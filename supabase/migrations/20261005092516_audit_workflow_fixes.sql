begin;
-- Existing request snapshots remain intact; new requests retain only a fingerprint.
alter table saras_private.order_save_requests add column payload_hash text;
alter table saras_private.order_save_requests alter column payload drop not null;
create or replace function public.convert_enquiry_transactional(p_enquiry_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_enquiry public.enquiries%rowtype;
  v_order public.orders%rowtype;
  v_prefix text;
begin
  perform public.assert_permission('enquiries','edit');
  perform public.assert_permission('orders','create');
  select * into v_enquiry from public.enquiries where id=p_enquiry_id for update;
  if not found then raise exception 'Enquiry not found'; end if;
  if v_enquiry.converted_order_id is not null then
    select * into v_order from public.orders where id=v_enquiry.converted_order_id;
    if not found then raise exception 'Converted order not found'; end if;
  else
    if v_enquiry.outcome='lost' then raise exception 'Reopen the lost enquiry before converting'; end if;
    select prefix into v_prefix from public.order_types where id=v_enquiry.order_type_id;
    insert into public.orders(user_id,customer_id,order_type_id,broker_id,payment_terms_id,status,converted_enquiry_id,order_number)
      values(auth.uid(),v_enquiry.customer_id,v_enquiry.order_type_id,v_enquiry.broker_id,v_enquiry.payment_terms_id,
        'draft',v_enquiry.id,public.generate_order_number(auth.uid(),coalesce(nullif(v_prefix,''),'ORD')))
      returning * into v_order;
  end if;
  update public.enquiries set status='converted',outcome='won',probability=100,converted_order_id=v_order.id
    where id=p_enquiry_id;
  return to_jsonb(v_order);
end $$;
revoke all on function public.convert_enquiry_transactional(uuid) from public,anon;
grant execute on function public.convert_enquiry_transactional(uuid) to authenticated;
-- Reconcile only rows with an existing order link, preserving unlinked historical records.
update public.enquiries e set outcome='won',probability=100
where e.status='converted' and e.converted_order_id is not null and e.outcome='open';

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op='UPDATE' and (to_jsonb(old)-'updated_at')=(to_jsonb(new)-'updated_at') then
    return new;
  end if;
  insert into public.audit_log (user_id, table_name, record_id, action, old_values, new_values)
  values (
    coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    tg_table_name,
    coalesce(new.id, old.id),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end
$$;

revoke all on function public.audit_trigger() from public;


-- One transaction owns the parent and all child changes. No partial order can commit.
create or replace function public.save_order_transactional(
  p_order_id uuid, p_request_id uuid, p_order jsonb, p_lines jsonb, p_charges jsonb
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_request saras_private.order_save_requests%rowtype;
  v_payload jsonb := jsonb_build_object('id',p_order_id,'order',p_order,'lines',p_lines,'charges',p_charges);
  v_data jsonb;
  v_item jsonb;
  v_items jsonb;
  v_table text;
  v_allowed text[];
  v_columns text;
  v_values text;
  v_assignments text;
  v_id uuid;
  v_ids uuid[];
  v_prefix text;
  v_paid numeric;
  v_subtotal numeric;
  v_item_discount numeric;
  v_net numeric;
  v_discount numeric;
  v_charges numeric;
  v_taxable_charges numeric;
  v_item_tax numeric;
  v_tax numeric;
  v_cgst numeric;
  v_result jsonb;
begin
  perform public.assert_permission('orders', case when p_order_id is null then 'create' else 'edit' end);
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if jsonb_typeof(p_order) is distinct from 'object'
     or jsonb_typeof(p_lines) is distinct from 'array'
     or jsonb_typeof(p_charges) is distinct from 'array' then
    raise exception 'Order, items and charges are required';
  end if;
  if jsonb_array_length(p_lines) > 500 or jsonb_array_length(p_charges) > 100 then
    raise exception 'Order exceeds the item or charge limit';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 4));
  select * into v_request from saras_private.order_save_requests where request_id=p_request_id;
  if found then
    if v_request.user_id <> auth.uid() or coalesce(v_request.payload_hash, encode(sha256(convert_to(v_request.payload::text,'UTF8')),'hex')) <> encode(sha256(convert_to(v_payload::text,'UTF8')),'hex') then
      raise exception 'request_id belongs to a different save';
    end if;
    return v_request.result;
  end if;
  if coalesce(p_order->>'status','') not in ('draft','booking') then
    raise exception 'Only draft and booking orders can be edited; use the workflow actions for later stages';
  end if;
  if p_order->>'status'='booking' and (jsonb_array_length(p_lines)=0
    or nullif(p_order->>'order_type_id','') is null or nullif(p_order->>'payment_terms_id','') is null) then
    raise exception 'Booking requires an order type, payment terms and at least one item';
  end if;
  if p_order_id is null then
    select prefix into v_prefix from public.order_types where id=nullif(p_order->>'order_type_id','')::uuid;
    insert into public.orders(user_id, customer_id, order_number)
      values(auth.uid(), (p_order->>'customer_id')::uuid,
        public.generate_order_number(auth.uid(),coalesce(nullif(v_prefix,''),'ORD')))
      returning * into v_order;
  else
    select * into v_order from public.orders where id=p_order_id for update;
    if not found then raise exception 'Order not found'; end if;
    if nullif(p_order->>'expected_updated_at','') is not null
      and v_order.updated_at is distinct from (p_order->>'expected_updated_at')::timestamptz then
      raise exception 'Order changed since you opened it. Reload before saving';
    end if;
    if v_order.status not in ('draft','booking') then raise exception 'This order has progressed and can no longer be edited'; end if;
    if exists(select 1 from public.invoices where order_id=p_order_id)
       or exists(select 1 from public.deliveries where order_id=p_order_id)
       or exists(select 1 from public.production_plans where order_id=p_order_id) then
      raise exception 'Order has linked operations and cannot be rewritten';
    end if;
    if v_order.status='booking' and p_order->>'status'='draft' then raise exception 'A booking cannot be reset to draft'; end if;
  end if;

  -- Only explicitly editable fields enter the typed record; no owner, approval or ID injection.
  select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_data
    from jsonb_each(p_order) where key=any(array['customer_id','order_type_id','broker_id','payment_terms_id','currency_id','currency_code','priority','nature','status','delivery_date_1','delivery_date_2','delivery_date_3','subtotal','total_charges','total_item_discount','order_discount_type','order_discount_value','order_discount_amount','taxable_amount','cgst_amount','sgst_amount','igst_amount','gst_type','grand_total','customer_notes','internal_notes','production_notes','shipping_address']);
  select string_agg(format('%I = r.%I',key,key),',') into v_assignments from jsonb_each(v_data);
  execute format('update public.orders t set %s, updated_at=clock_timestamp() from jsonb_populate_record(null::public.orders,$1) r where t.id=$2 returning t.*',v_assignments)
    into v_order using v_data,v_order.id;

  foreach v_table in array array['order_line_items','order_charges'] loop
    v_items := case when v_table='order_line_items' then p_lines else p_charges end;
    v_allowed := case when v_table='order_line_items' then array['sort_order','line_type','product_id','machine_id','material_id','color_id','calculator_profile_id','width_cm','meters','weight_kg','quantity','unit','rate_per_unit','amount','item_discount_type','item_discount_value','item_discount_amount','gst_rate','gst_amount','instructions'] else array['charge_type_id','scope','amount','is_taxable'] end;
    v_ids := array[]::uuid[];
    for v_item in select value from jsonb_array_elements(v_items) loop
      if jsonb_typeof(v_item) is distinct from 'object' then raise exception 'Invalid item'; end if;
      v_id := nullif(v_item->>'id','')::uuid;
      if v_id is not null then
        execute format('select id from public.%I where id=$1 and order_id=$2 for update',v_table) into v_id using v_id,v_order.id;
        if v_id is null then raise exception 'Item does not belong to this order'; end if;
      else
        v_id := gen_random_uuid();
      end if;
      if v_id=any(v_ids) then raise exception 'Duplicate item ID'; end if;
      v_ids := array_append(v_ids,v_id);
      select coalesce(jsonb_object_agg(key,value),'{}'::jsonb) into v_data
        from jsonb_each(v_item) where key=any(v_allowed);
      v_data := v_data || jsonb_build_object('id',v_id,'order_id',v_order.id);
      select string_agg(format('%I',key),','),string_agg(format('r.%I',key),','),
        string_agg(format('%I=excluded.%I',key,key),',')
        into v_columns,v_values,v_assignments from jsonb_each(v_data);
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I,$1) r on conflict(id) do update set %s',v_table,v_columns,v_values,v_table,v_assignments) using v_data;
    end loop;
    execute format('delete from public.%I where order_id=$1 and not(id=any($2))',v_table) using v_order.id,v_ids;
  end loop;
  if exists(select 1 from public.order_line_items where order_id=v_order.id and (
    coalesce(quantity,0)<0 or coalesce(meters,0)<0 or coalesce(weight_kg,0)<0
    or rate_per_unit<0 or item_discount_value<0 or gst_rate<0 or gst_rate>100))
    or exists(select 1 from public.order_charges where order_id=v_order.id and amount<0) then
    raise exception 'Amounts, quantities and tax rates must be valid non-negative numbers';
  end if;
  -- Recompute monetary values from the saved lines; stale/tampered UI totals cannot reach the ledger.
  with amounts as (
    select id, round(coalesce(nullif(quantity,0),nullif(meters,0),nullif(weight_kg,0),0)*rate_per_unit,2) as amount
    from public.order_line_items where order_id=v_order.id
  ), discounts as (
    select l.id,a.amount,least(a.amount,round(case when l.item_discount_type in ('percent','percentage')
      then a.amount*l.item_discount_value/100 else l.item_discount_value end,2)) as discount,l.gst_rate
    from public.order_line_items l join amounts a using(id)
  )
  update public.order_line_items l set amount=d.amount,item_discount_amount=d.discount,
    gst_amount=round((d.amount-d.discount)*d.gst_rate/100,2)
    from discounts d where l.id=d.id and (l.amount,l.item_discount_amount,l.gst_amount)
      is distinct from (d.amount,d.discount,round((d.amount-d.discount)*d.gst_rate/100,2));
  select coalesce(sum(amount),0),coalesce(sum(item_discount_amount),0),coalesce(sum(gst_amount),0)
    into v_subtotal,v_item_discount,v_item_tax from public.order_line_items where order_id=v_order.id;
  v_net := v_subtotal-v_item_discount;
  if v_order.order_discount_value<0 then raise exception 'Discount must be non-negative'; end if;
  v_discount := least(v_net,round(case when v_order.order_discount_type::text in ('percent','percentage')
    then v_net*v_order.order_discount_value/100 else v_order.order_discount_value end,2));
  select coalesce(sum(amount),0),coalesce(sum(amount) filter(where is_taxable),0)
    into v_charges,v_taxable_charges from public.order_charges where order_id=v_order.id;
  v_tax := round(v_item_tax + case when v_net>0 then (v_taxable_charges-v_discount)*v_item_tax/v_net else 0 end,2);
  v_cgst := case when v_order.gst_type='inter_state' then 0 else round(v_tax/2,2) end;
  select coalesce(sum(amount),0) into v_paid from public.payments where order_id=v_order.id;
  if v_net-v_discount+v_charges+v_tax < v_paid then raise exception 'Order total cannot be less than recorded payments'; end if;
  update public.orders set subtotal=v_subtotal,total_item_discount=v_item_discount,
    order_discount_amount=v_discount,total_charges=v_charges,
    taxable_amount=v_net-v_discount+v_taxable_charges,cgst_amount=v_cgst,
    sgst_amount=case when gst_type='inter_state' then 0 else v_tax-v_cgst end,
    igst_amount=case when gst_type='inter_state' then v_tax else 0 end,
    advance_paid=v_paid,balance_due=v_net-v_discount+v_charges+v_tax-v_paid,
    grand_total=v_net-v_discount+v_charges+v_tax
    where id=v_order.id returning * into v_order;
  if p_order->>'status'='booking' and exists (
    select 1 from public.order_line_items where order_id=v_order.id and (
      coalesce(nullif(quantity,0),nullif(meters,0),nullif(weight_kg,0),0)<=0
      or (line_type='stock' and material_id is null)
      or (line_type<>'stock' and product_id is null))) then
    raise exception 'Every booked item needs a product/material and a positive quantity';
  end if;
  v_result := to_jsonb(v_order);
  insert into saras_private.order_save_requests(request_id,user_id,payload_hash,result)
    values(p_request_id,auth.uid(),encode(sha256(convert_to(v_payload::text,'UTF8')),'hex'),v_result);
  return v_result;
end $$;
revoke all on function public.save_order_transactional(uuid,uuid,jsonb,jsonb,jsonb) from public,anon;
grant execute on function public.save_order_transactional(uuid,uuid,jsonb,jsonb,jsonb) to authenticated;

do $$
declare definition text;
begin
  select pg_get_functiondef('public.record_payment_transactional(uuid,numeric,text,date,text,uuid,text,uuid)'::regprocedure) into definition;
  if definition !~ 'jsonb_populate_record\(null::public.invoices' then
    definition := regexp_replace(definition,
      'status = (case[[:space:]]+when greatest\(0, grand_total - v_total_paid\)[\s\S]*?end),',
      'status = (jsonb_populate_record(null::public.invoices,jsonb_build_object(''status'',\1))).status,');
    execute definition;
  end if;
end $$;
commit;
