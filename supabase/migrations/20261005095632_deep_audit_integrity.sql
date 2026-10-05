begin;
-- Only checked transactional APIs may mutate business ledgers.
revoke insert,update,delete on public.orders,public.order_line_items,public.order_charges,
 public.payments,public.invoices,public.deliveries,public.production_plans,
 public.jobwork_items,public.stock_movements from authenticated;
revoke update,delete on public.profiles from authenticated;
grant update(full_name,firm_name) on public.profiles to authenticated;
alter table public.production_plans add column if not exists notes text;

-- All inventory writers use one transaction lock. This deliberately serializes
-- this small ERP's ledger writes, including receipts and manual adjustments.
create or replace function saras_private.guard_stock_movement() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_balance numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('saras:inventory-ledger',0));
 if num_nonnulls(new.product_id,new.material_id,new.yarn_type_id,new.product_type_id) <> 1 then
  raise exception 'A stock movement needs exactly one inventory identity';
 end if;
 if new.kind not in ('in','out') or new.quantity::text in ('NaN','Infinity','-Infinity')
    or new.quantity <= 0 or nullif(trim(new.unit),'') is null then
  raise exception 'Invalid stock movement';
 end if;
 if new.kind='out' then
  select coalesce(sum(case when kind='out' then -quantity else quantity end),0) into v_balance
  from public.stock_movements
  where product_id is not distinct from new.product_id and material_id is not distinct from new.material_id
   and yarn_type_id is not distinct from new.yarn_type_id and product_type_id is not distinct from new.product_type_id
   and warehouse_id is not distinct from new.warehouse_id and unit=new.unit;
  if v_balance < new.quantity then raise exception 'Insufficient stock: have %, need % %',v_balance,new.quantity,new.unit; end if;
 end if;
 return new;
end $$;

revoke all on function saras_private.guard_stock_movement() from public,anon,authenticated;
create trigger stock_movement_integrity before insert on public.stock_movements
for each row execute function saras_private.guard_stock_movement();

create or replace function saras_private.post_delivery_stock(p_line public.order_line_items,p_quantity numeric,p_unit text,p_delivery uuid,p_note text)
returns void language plpgsql security definer set search_path=pg_catalog,public as $$
declare b record; remaining numeric:=p_quantity; take_qty numeric; available numeric;
 product uuid:=p_line.product_id;
 material uuid:=case when p_line.product_id is null then p_line.material_id end;
begin
 -- A manufactured SKU may also name its input material; dispatch the SKU.
 if product is null and material is null then
  raise exception 'Delivery needs a product or material identity';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('saras:inventory-ledger',0));
 select coalesce(sum(case when kind='out' then -quantity else quantity end),0) into available
 from public.stock_movements where product_id is not distinct from product
  and material_id is not distinct from material and unit=p_unit
  and yarn_type_id is null and product_type_id is null;
 if available < p_quantity then raise exception 'Insufficient stock: have %, need % %',available,p_quantity,p_unit; end if;
 for b in select warehouse_id,sum(case when kind='out' then -quantity else quantity end) as balance
  from public.stock_movements where product_id is not distinct from product
   and material_id is not distinct from material and unit=p_unit
   and yarn_type_id is null and product_type_id is null
  group by warehouse_id having sum(case when kind='out' then -quantity else quantity end)>0
  order by warehouse_id nulls first
 loop
  take_qty:=least(remaining,b.balance);
  insert into public.stock_movements(kind,product_id,material_id,warehouse_id,quantity,unit,source_type,source_id,notes)
   values('out',product,material,b.warehouse_id,take_qty,p_unit,'delivery',p_delivery,p_note);
  remaining:=remaining-take_qty;
  exit when remaining=0;
 end loop;
 if remaining<>0 then raise exception 'Insufficient stock'; end if;
end $$;
revoke all on function saras_private.post_delivery_stock(public.order_line_items,numeric,text,uuid,text) from public,anon,authenticated;
create or replace function public.record_delivery_transactional(
  p_order_id uuid,
  p_line_item_id uuid,
  p_delivery_date date,
  p_quantity numeric,
  p_delivery_note text default null,
  p_challan_number text default null,
  p_vehicle_number text default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_line public.order_line_items%rowtype;
  v_delivery public.deliveries%rowtype;
  v_ordered numeric;
  v_delivered numeric;
  v_remaining numeric;
  v_stock numeric;
  v_unit text;
  v_challan text;
begin
  perform public.assert_permission('dispatch', 'create');
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Delivery quantity must be greater than zero'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_delivery from public.deliveries where dispatch_request_id = p_request_id limit 1;
  if found then
    if v_delivery.order_id <> p_order_id or v_delivery.line_item_id <> p_line_item_id
       or v_delivery.quantity_delivered <> p_quantity then
      raise exception 'request_id belongs to a different delivery';
    end if;
    return to_jsonb(v_delivery);
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('qc', 'dispatch') then raise exception 'Order must pass QC before delivery'; end if;
  select * into v_line from public.order_line_items
    where id = p_line_item_id and order_id = p_order_id for update;
  if not found then raise exception 'Invalid order line item'; end if;

  v_ordered := coalesce(nullif(v_line.quantity, 0), nullif(v_line.meters, 0), nullif(v_line.weight_kg, 0), 0);
  v_unit := case when v_line.quantity > 0 then coalesce(v_line.unit, 'pcs')
    when v_line.meters > 0 then 'm' when v_line.weight_kg > 0 then 'kg' else coalesce(v_line.unit, 'pcs') end;
  select coalesce(sum(quantity_delivered), 0) into v_delivered
    from public.deliveries where line_item_id = p_line_item_id;
  v_remaining := v_ordered - v_delivered;
  if p_quantity > v_remaining then raise exception 'Delivery quantity exceeds the remaining quantity %', v_remaining; end if;

  v_challan := nullif(left(trim(p_challan_number), 100), '');
  if v_challan is null then select public.next_challan_number() into v_challan; end if;
  insert into public.deliveries (
    order_id, line_item_id, delivery_date, quantity_delivered, unit, challan_number,
    vehicle_number, delivery_note, dispatch_request_id
  ) values (
    p_order_id, p_line_item_id, coalesce(p_delivery_date, current_date), p_quantity, v_unit, v_challan,
    nullif(left(trim(p_vehicle_number), 100), ''), nullif(left(trim(p_delivery_note), 1000), ''), p_request_id
  ) returning * into v_delivery;
  perform saras_private.post_delivery_stock(v_line,p_quantity,v_unit,v_delivery.id,'Dispatched via '||v_challan);
  insert into public.activity_log (user_id, staff_id, entity_type, entity_id, action, comment)
  values (auth.uid(), null, 'order', p_order_id, 'delivery_added', 'Delivery of ' || p_quantity || ' ' || v_unit || ' recorded');
  update public.orders set status = 'dispatch', updated_at = now() where id = p_order_id;
  return to_jsonb(v_delivery);
end
$$;
create or replace function public.create_dispatch_transactional(
  p_order_id uuid,
  p_vehicle_number text default null,
  p_driver_name text default null,
  p_delivery_note text default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_line public.order_line_items%rowtype;
  v_delivery public.deliveries%rowtype;
  v_challan text;
  v_delivered numeric;
  v_remaining numeric;
  v_ordered numeric;
  v_unit text;
  v_stock numeric;
  v_count integer := 0;
  v_rows jsonb;
  v_existing_order_id uuid;
begin
  perform public.assert_permission('dispatch', 'create');
  if p_request_id is null then raise exception 'request_id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select challan_number, order_id into v_challan, v_existing_order_id
    from public.deliveries where dispatch_request_id = p_request_id limit 1;
  if found then
    if v_existing_order_id <> p_order_id then raise exception 'request_id belongs to a different dispatch'; end if;
    select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at), '[]'::jsonb) into v_rows
      from public.deliveries d where dispatch_request_id = p_request_id;
    return jsonb_build_object('challan_number', v_challan, 'deliveries', v_rows);
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status not in ('qc', 'dispatch') then raise exception 'Order must pass QC before dispatch'; end if;
  select public.next_challan_number() into v_challan;
  for v_line in select * from public.order_line_items where order_id = p_order_id order by id for update
  loop
    select coalesce(sum(quantity_delivered), 0) into v_delivered
      from public.deliveries where line_item_id = v_line.id;
    v_ordered := coalesce(nullif(v_line.quantity, 0), nullif(v_line.meters, 0), nullif(v_line.weight_kg, 0), 0);
    v_unit := case when v_line.quantity > 0 then coalesce(v_line.unit, 'pcs')
      when v_line.meters > 0 then 'm' when v_line.weight_kg > 0 then 'kg' else coalesce(v_line.unit, 'pcs') end;
    v_remaining := v_ordered - v_delivered;
    if v_remaining <= 0 then continue; end if;
    insert into public.deliveries (
      order_id, line_item_id, delivery_date, quantity_delivered, unit, challan_number,
      vehicle_number, driver_name, delivery_note, dispatch_request_id
    ) values (
      p_order_id, v_line.id, current_date, v_remaining, v_unit, v_challan,
      nullif(trim(p_vehicle_number), ''), nullif(trim(p_driver_name), ''),
      nullif(trim(p_delivery_note), ''), p_request_id
    ) returning * into v_delivery;
    perform saras_private.post_delivery_stock(v_line,v_remaining,v_unit,v_delivery.id,'Dispatched via '||v_challan);
    v_count := v_count + 1;
  end loop;
  if v_count = 0 then raise exception 'All line items are already fully delivered'; end if;
  update public.orders set status = 'dispatch', updated_at = now() where id = p_order_id;
  select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at), '[]'::jsonb) into v_rows
    from public.deliveries d where dispatch_request_id = p_request_id;
  return jsonb_build_object('challan_number', v_challan, 'deliveries', v_rows);
end
$$;
create or replace function public.create_production_plans_transactional(p_order_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_order public.orders%rowtype; v_rows jsonb;
begin
  perform public.assert_permission('production', 'manage');
  if p_request_id is null then raise exception 'request_id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  if exists (
    select 1 from public.production_plans
    where create_request_id = p_request_id and order_id <> p_order_id
  ) then
    raise exception 'request_id belongs to a different production order';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb) into v_rows
    from public.production_plans p
    where p.create_request_id = p_request_id or (p.order_id = p_order_id and p.status <> 'cancelled');
  if jsonb_array_length(v_rows) > 0 then return v_rows; end if;
  if v_order.status not in ('approved', 'booking', 'production') then raise exception 'Order is not ready for production'; end if;
  insert into public.production_plans (
    order_id, line_item_id, product_id, machine_id, material_id, planned_qty, unit, status, create_request_id
  ) select p_order_id, li.id, li.product_id, li.machine_id, li.material_id,
      coalesce(nullif(li.quantity, 0), nullif(li.meters, 0), nullif(li.weight_kg, 0), 0),
      case when li.quantity > 0 then coalesce(li.unit, 'pcs') when li.meters > 0 then 'm' when li.weight_kg > 0 then 'kg' else coalesce(li.unit, 'pcs') end,
      'planned', p_request_id
    from public.order_line_items li where li.order_id = p_order_id;
  if not found then raise exception 'Order has no line items'; end if;
  update public.orders set status = 'production', updated_at = now() where id = p_order_id;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb) into v_rows
    from public.production_plans p where p.create_request_id = p_request_id;
  return v_rows;
end
$$;
create or replace function public.update_production_plan_transactional(p_plan_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_plan public.production_plans%rowtype;
begin
  perform public.assert_permission('production', 'manage');
  if exists(select 1 from jsonb_object_keys(p_patch) k where k not in
   ('status','completed_qty','planned_qty','machine_id','material_id','planned_start','planned_end','actual_start','actual_end','notes')) then
   raise exception 'Unsupported production patch field';
  end if;
  select * into v_plan from public.production_plans where id = p_plan_id for update;
  if not found then raise exception 'Production plan not found'; end if;
  if v_plan.status = 'completed' then
    if to_jsonb(jsonb_populate_record(v_plan,p_patch)) is distinct from to_jsonb(v_plan) then
      raise exception 'A completed production plan cannot be changed';
    end if;
    if (not (p_patch ? 'status') or p_patch ->> 'status' = 'completed')
       and (not (p_patch ? 'completed_qty') or (p_patch ->> 'completed_qty')::numeric = v_plan.completed_qty) then
      return to_jsonb(v_plan);
    end if;
    raise exception 'A completed production plan cannot be changed';
  end if;
  if p_patch ? 'status' and p_patch ->> 'status' not in ('planned', 'in_progress', 'on_hold', 'completed', 'cancelled') then
    raise exception 'Invalid production status';
  end if;
  update public.production_plans set
    status = case when p_patch ? 'status' then p_patch ->> 'status' else status end,
    completed_qty = case when p_patch ? 'completed_qty' then (p_patch ->> 'completed_qty')::numeric else completed_qty end,
    planned_qty = case when p_patch ? 'planned_qty' then (p_patch ->> 'planned_qty')::numeric else planned_qty end,
    machine_id = case when p_patch ? 'machine_id' then nullif(p_patch ->> 'machine_id', '')::uuid else machine_id end,
    material_id = case when p_patch ? 'material_id' then nullif(p_patch ->> 'material_id', '')::uuid else material_id end,
    planned_start = case when p_patch ? 'planned_start' then nullif(p_patch ->> 'planned_start', '')::timestamptz else planned_start end,
    planned_end = case when p_patch ? 'planned_end' then nullif(p_patch ->> 'planned_end', '')::timestamptz else planned_end end,
    actual_start = case when p_patch ? 'actual_start' then nullif(p_patch ->> 'actual_start', '')::timestamptz else actual_start end,
    actual_end = case when p_patch ? 'actual_end' then nullif(p_patch ->> 'actual_end', '')::timestamptz else actual_end end,
    notes = case when p_patch ? 'notes' then p_patch ->> 'notes' else notes end,
    updated_at = now()
  where id = p_plan_id returning * into v_plan;
  if v_plan.completed_qty::text in ('NaN','Infinity','-Infinity') or v_plan.planned_qty::text in ('NaN','Infinity','-Infinity') or v_plan.completed_qty < 0 or v_plan.completed_qty > v_plan.planned_qty then raise exception 'Invalid completed quantity'; end if;
  if v_plan.status='completed' and v_plan.completed_qty<=0 then raise exception 'Enter positive output quantity before completing'; end if;
  if v_plan.status = 'completed' and v_plan.product_id is not null and v_plan.completed_qty > 0 then
    perform pg_advisory_xact_lock(hashtextextended(v_plan.product_id::text, 1));
    if not exists (select 1 from public.stock_movements where source_type = 'production' and source_id = v_plan.id) then
      insert into public.stock_movements (kind, product_id, quantity, unit, source_type, source_id, notes)
      values ('in', v_plan.product_id, v_plan.completed_qty, v_plan.unit, 'production', v_plan.id, 'Production complete (plan ' || left(v_plan.id::text, 8) || ')');
    end if;
  end if;
  return to_jsonb(v_plan);
end
$$;
create or replace function public.create_invoice_from_order_transactional(p_order_id uuid, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_order public.orders%rowtype; v_invoice public.invoices%rowtype; v_number text;
begin
  perform public.assert_permission('invoices', 'create');
  if p_request_id is null then raise exception 'request_id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_invoice from public.invoices where idempotency_key = p_request_id;
  if found then
    if v_invoice.order_id <> p_order_id then raise exception 'request_id belongs to a different invoice'; end if;
    return to_jsonb(v_invoice);
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status in ('draft','cancelled') then raise exception 'Draft or cancelled orders cannot be invoiced'; end if;
  select * into v_invoice from public.invoices where order_id = p_order_id limit 1;
  if found then return to_jsonb(v_invoice); end if;
  select public.next_invoice_number() into v_number;
  insert into public.invoices (
    invoice_number, order_id, customer_id, invoice_date, due_date, subtotal,
    cgst_amount, sgst_amount, igst_amount, total_tax, grand_total,
    amount_paid, balance_due, status, idempotency_key
  ) values (
    v_number, v_order.id, v_order.customer_id, current_date, v_order.payment_due_date,
    (coalesce(v_order.grand_total,0)-coalesce(v_order.cgst_amount,0)-coalesce(v_order.sgst_amount,0)-coalesce(v_order.igst_amount,0)),
    coalesce(v_order.cgst_amount, 0), coalesce(v_order.sgst_amount, 0), coalesce(v_order.igst_amount, 0),
    coalesce(v_order.cgst_amount, 0) + coalesce(v_order.sgst_amount, 0) + coalesce(v_order.igst_amount, 0),
    coalesce(v_order.grand_total, 0), coalesce(v_order.advance_paid, 0),
    greatest(0, coalesce(v_order.grand_total, 0) - coalesce(v_order.advance_paid, 0)),
    (jsonb_populate_record(null::public.invoices,jsonb_build_object('status',
      case when coalesce(v_order.balance_due, v_order.grand_total, 0) <= 0 then 'paid' else 'issued' end))).status,
    p_request_id
  ) returning * into v_invoice;
  return to_jsonb(v_invoice);
end
$$;
create or replace function public.admin_update_user_permissions(p_user_id uuid, p_role text, p_permissions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_profile public.profiles%rowtype; v_admin_count integer;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_role not in ('admin', 'staff', 'viewer') then raise exception 'Invalid role'; end if;
  perform pg_advisory_xact_lock(hashtextextended('saras:admin-roles',0));
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if v_profile.role = 'admin' and p_role <> 'admin' then
    select count(*) into v_admin_count from public.profiles where role = 'admin';
    if v_admin_count <= 1 then raise exception 'Cannot demote the last administrator'; end if;
  end if;
  update public.profiles set role = p_role, permissions = coalesce(p_permissions, '{}'::jsonb), updated_at = now()
    where id = p_user_id returning * into v_profile;
  return to_jsonb(v_profile);
end
$$;
-- A role-change RPC plus restricted column grants closes direct demotion.
-- Also protect service/admin deletion and auth-user cascading deletion.
create or replace function saras_private.guard_last_admin() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if old.role='admin' and (tg_op='DELETE' or new.role is distinct from 'admin') then
  perform pg_advisory_xact_lock(hashtextextended('saras:admin-roles',0));
  if not exists(select 1 from public.profiles where role='admin' and id<>old.id) then
   raise exception 'Cannot remove the last administrator';
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
revoke all on function saras_private.guard_last_admin() from public,anon,authenticated;
create trigger guard_last_admin before update of role or delete on public.profiles
for each row execute function saras_private.guard_last_admin();

create or replace function public.transition_order_transactional(p_order_id uuid,p_status text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.orders%rowtype; allowed text[];
begin
 perform public.assert_permission('orders','edit');
 if p_status='approved' then perform public.assert_permission('orders','approve'); end if;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if o.status=p_status then return to_jsonb(o); end if;
 allowed:=case o.status when 'draft' then array['booking','cancelled'] when 'booking' then array['approved','cancelled']
  when 'approved' then array['production','cancelled'] when 'production' then array['qc','cancelled']
  when 'qc' then array['dispatch','cancelled'] when 'dispatch' then array['completed'] else array[]::text[] end;
 if p_status is null or not p_status=any(allowed) then raise exception 'Invalid order status transition'; end if;
 if p_status='booking' and (o.order_type_id is null or o.payment_terms_id is null or not exists(select 1 from public.order_line_items where order_id=o.id)) then
  raise exception 'Booking requires an order type, payment terms and at least one item'; end if;
 if p_status='production' then
  perform public.create_production_plans_transactional(o.id,gen_random_uuid());
 elsif p_status='dispatch' then
  perform public.create_dispatch_transactional(o.id,null,null,null,gen_random_uuid());
 else
  if p_status='completed' then
   if coalesce(o.balance_due,0)>0 or not exists(select 1 from public.order_line_items where order_id=o.id)
    or exists(select 1 from public.order_line_items l where l.order_id=o.id and
     coalesce((select sum(d.quantity_delivered) from public.deliveries d where d.line_item_id=l.id),0)
     < coalesce(nullif(l.quantity,0),nullif(l.meters,0),nullif(l.weight_kg,0),0)) then
    raise exception 'Complete all deliveries and settle the balance before completing'; end if;
  end if;
  if p_status='cancelled' and (exists(select 1 from public.payments where order_id=o.id) or exists(select 1 from public.invoices where order_id=o.id)
   or exists(select 1 from public.deliveries where order_id=o.id) or exists(select 1 from public.production_plans where order_id=o.id)) then
    raise exception 'Order has linked operations; reconcile them before cancellation'; end if;
  update public.orders set status=(jsonb_populate_record(null::public.orders,jsonb_build_object('status',p_status))).status,approved_by=case when p_status='approved' then auth.uid() else approved_by end,
   approved_at=case when p_status='approved' then now() else approved_at end,updated_at=clock_timestamp() where id=o.id;
 end if;
 select * into o from public.orders where id=p_order_id;
 return to_jsonb(o);
end $$;

create or replace function public.delete_draft_order(p_order_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.orders%rowtype;
begin
 perform public.assert_permission('orders','delete');
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found'; end if;
 if o.status<>'draft' or exists(select 1 from public.payments where order_id=o.id)
  or exists(select 1 from public.invoices where order_id=o.id) or exists(select 1 from public.deliveries where order_id=o.id)
  or exists(select 1 from public.production_plans where order_id=o.id)
  or exists(select 1 from public.attachments where entity_type='order' and entity_id=o.id) then
  raise exception 'Only unlinked draft orders can be deleted'; end if;
 delete from public.order_charges where order_id=o.id;
 delete from public.order_line_items where order_id=o.id;
 delete from public.orders where id=o.id;
end $$;

create or replace function public.link_order_calculator(p_line_id uuid,p_profile_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.order_line_items%rowtype; o public.orders%rowtype;
begin
 perform public.assert_permission('orders','edit'); perform public.assert_permission('calculator','view');
 select o1.* into o from public.orders o1 join public.order_line_items l1 on l1.order_id=o1.id where l1.id=p_line_id for update of o1;
 if not found or o.status not in ('draft','booking') or exists(select 1 from public.invoices where order_id=o.id)
  or exists(select 1 from public.production_plans where order_id=o.id) or exists(select 1 from public.deliveries where order_id=o.id) then
  raise exception 'Calculator links can only change on unlinked draft or booking orders'; end if;
 update public.order_line_items set calculator_profile_id=p_profile_id where id=p_line_id returning * into l;
 update public.orders set updated_at=clock_timestamp() where id=o.id;
 return to_jsonb(l);
end $$;

alter table public.stock_movements add column adjustment_request_id uuid;
create unique index stock_adjustment_request_unique on public.stock_movements(adjustment_request_id) where adjustment_request_id is not null;
create or replace function public.adjust_stock_transactional(p_payload jsonb,p_request_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.stock_movements%rowtype; existing public.stock_movements%rowtype;
begin
 perform public.assert_permission('stock','adjust');
 if p_request_id is null then raise exception 'request_id is required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,7));
 select * into m from jsonb_populate_record(null::public.stock_movements,p_payload);
 if m.kind not in ('in','out') or m.kind is null then raise exception 'Invalid adjustment direction'; end if;
 select * into existing from public.stock_movements where adjustment_request_id=p_request_id;
 if found then
  if (to_jsonb(existing)-array['id','created_at','source_type','source_id','adjustment_request_id']) is distinct from
   (to_jsonb(m)-array['id','created_at','source_type','source_id','adjustment_request_id']) then raise exception 'request_id belongs to a different adjustment'; end if;
  return to_jsonb(existing);
 end if;
 insert into public.stock_movements(kind,product_id,material_id,yarn_type_id,product_type_id,warehouse_id,quantity,unit,source_type,notes,adjustment_request_id)
 values(m.kind,m.product_id,m.material_id,m.yarn_type_id,m.product_type_id,m.warehouse_id,m.quantity,m.unit,'adjustment',m.notes,p_request_id) returning * into m;
 return to_jsonb(m);
end $$;
create or replace function public.report_sales_register(p_from timestamptz default null,p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare rows jsonb;
begin
 perform public.assert_permission('reports','view');
 select coalesce(jsonb_agg(row_data order by created_at desc),'[]'::jsonb) into rows from (
  select i.invoice_date as created_at,to_jsonb(i)||jsonb_build_object('order_number',i.invoice_number,
   'created_at',i.invoice_date,'taxable_amount',i.subtotal,'advance_paid',i.amount_paid,
   'customers',jsonb_build_object('firm_name',c.firm_name,'gstin',c.gstin)) as row_data
  from public.invoices i join public.customers c on c.id=i.customer_id
  where i.status::text in ('issued','partially_paid','paid','overdue')
   and (p_from is null or (i.invoice_date::timestamp at time zone 'Asia/Kolkata')>=p_from)
   and (p_to is null or (i.invoice_date::timestamp at time zone 'Asia/Kolkata')<p_to)
 ) q;
 return rows;
end $$;
create or replace function public.report_customer_outstanding()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_rows jsonb;
begin
  perform public.assert_permission('reports', 'view');
  select coalesce(jsonb_agg(to_jsonb(q) order by q.total_outstanding desc), '[]'::jsonb) into v_rows
  from (
    select c.id as customer_id, c.firm_name, c.phone, count(o.id)::integer as order_count,
      coalesce(sum(o.grand_total), 0) as total_billed,
      coalesce(sum(o.advance_paid), 0) as total_paid,
      coalesce(sum(o.balance_due), 0) as total_outstanding,
      min(o.created_at) filter (where o.balance_due > 0) as oldest_open
    from public.customers c join public.orders o on o.customer_id = c.id and o.status not in ('draft','cancelled')
    group by c.id, c.firm_name, c.phone
    having coalesce(sum(o.grand_total), 0) > 0
  ) q;
  return v_rows;
end $$;
create or replace function public.report_purchase_register(p_from date default null, p_to date default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_rows jsonb;
begin
  perform public.assert_permission('reports', 'view');
  select coalesce(jsonb_agg(row_data order by po_date desc), '[]'::jsonb) into v_rows
  from (
    select po.po_date, to_jsonb(po) || jsonb_build_object(
      'suppliers', jsonb_build_object('name', s.name, 'firm', s.firm)
    ) as row_data
    from public.purchase_orders po left join public.suppliers s on s.id = po.supplier_id
    where po.status<>'cancelled' and (p_from is null or po.po_date >= p_from) and (p_to is null or po.po_date <= p_to)
  ) q;
  return v_rows;
end $$;

create or replace function public.can_access_entity(p_type text,p_id uuid,p_action text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare module text; tab text; action text; present boolean;
begin
 if auth.uid() is null or p_id is null then return false; end if;
 module:=case p_type when 'order' then 'orders' when 'enquiry' then 'enquiries' when 'invoice' then 'invoices'
  when 'purchase_order' then 'purchase' when 'goods_receipt' then 'purchase' when 'quality_inspection' then 'quality' end;
 tab:=case p_type when 'order' then 'orders' when 'enquiry' then 'enquiries' when 'invoice' then 'invoices'
  when 'purchase_order' then 'purchase_orders' when 'goods_receipt' then 'goods_receipts' when 'quality_inspection' then 'quality_inspections' end;
 if tab is null then return false; end if;
 action:=case when p_action='view' then 'view' when module in ('orders','enquiries') then
  case when p_action='delete' and module='orders' then 'delete' else 'edit' end
  when module='invoices' then 'create' when module='quality' then 'inspect'
  when p_type='goods_receipt' then 'receive' else 'create' end;
 if not public.has_permission(module,action) then return false; end if;
 execute format('select exists(select 1 from public.%I where id=$1)',tab) into present using p_id;
 return present;
end $$;
revoke all on function public.can_access_entity(text,uuid,text) from public,anon;
grant execute on function public.can_access_entity(text,uuid,text) to authenticated;

drop policy saras_select on public.attachments;
drop policy saras_insert on public.attachments;
drop policy saras_update on public.attachments;
drop policy saras_delete on public.attachments;
revoke update on public.attachments from authenticated;
create policy attachment_view on public.attachments for select to authenticated
 using(public.can_access_entity(entity_type,entity_id,'view'));
create policy attachment_insert on public.attachments for insert to authenticated
 with check(public.can_access_entity(entity_type,entity_id,'edit') and uploaded_by=(select auth.uid())
  and storage_path like entity_type||'/'||entity_id::text||'/'||(select auth.uid())::text||'/%');
create policy attachment_delete on public.attachments for delete to authenticated
 using(public.can_access_entity(entity_type,entity_id,'delete'));

create or replace function public.can_access_attachment_path(p_name text,p_action text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare parts text[]; entity uuid;
begin
 parts:=string_to_array(p_name,'/');
 if array_length(parts,1) not in (3,4) or parts[2] !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
 begin entity:=parts[2]::uuid; exception when invalid_text_representation then return false; end;
 if p_action='insert' then
  return array_length(parts,1)=4 and parts[3]=auth.uid()::text and public.can_access_entity(parts[1],entity,'edit');
 elsif p_action in ('view','delete') and array_length(parts,1)=4 and parts[3]=auth.uid()::text
  and not exists(select 1 from public.attachments where storage_path=p_name) then
  return public.can_access_entity(parts[1],entity,'edit');
 end if;
 return public.can_access_entity(parts[1],entity,p_action);
end $$;
revoke all on function public.can_access_attachment_path(text,text) from public,anon;
grant execute on function public.can_access_attachment_path(text,text) to authenticated;
drop policy saras_attachments_select on storage.objects;
drop policy saras_attachments_insert on storage.objects;
drop policy saras_attachments_delete on storage.objects;
create policy saras_attachments_select on storage.objects for select to authenticated
 using(bucket_id='order-attachments' and public.can_access_attachment_path(name,'view'));
create policy saras_attachments_insert on storage.objects for insert to authenticated
 with check(bucket_id='order-attachments' and public.can_access_attachment_path(name,'insert'));
create policy saras_attachments_delete on storage.objects for delete to authenticated
 using(bucket_id='order-attachments' and public.can_access_attachment_path(name,'delete'));

create or replace function public.can_read_notification(p public.notifications)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select auth.uid() is not null and (p.staff_id is null or p.staff_id=auth.uid())
  and (case when p.entity_type is not null then public.can_access_entity(p.entity_type,p.entity_id,'view')
       else p.staff_id=auth.uid() or p.user_id=auth.uid() or public.is_admin() end)
  and (p.type<>'payment_received' or public.has_permission('payments','view'))
$$;
revoke all on function public.can_read_notification(public.notifications) from public,anon;
grant execute on function public.can_read_notification(public.notifications) to authenticated;
drop policy notifications_select_secure on public.notifications;
create policy notifications_select_secure on public.notifications for select to authenticated
 using(public.can_read_notification(notifications));
revoke update on public.notifications from authenticated;
create table saras_private.notification_reads(
 notification_id uuid not null references public.notifications(id) on delete cascade,
 user_id uuid not null references public.profiles(id) on delete cascade,
 read_at timestamptz not null default now(),primary key(notification_id,user_id));
create index notification_reads_user_idx on saras_private.notification_reads(user_id);
revoke all on saras_private.notification_reads from public,anon,authenticated;
create or replace function public.list_user_notifications(p_unread boolean default false,p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare rows jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) into rows from (
  select n.id,n.type,n.title,n.message,n.entity_type,n.entity_id,n.created_at,n.staff_id,n.user_id,
   coalesce(r.read_at,case when n.staff_id=auth.uid() then n.read_at end) as read_at
  from public.notifications n left join saras_private.notification_reads r on r.notification_id=n.id and r.user_id=auth.uid()
  where public.can_read_notification(n) and (not p_unread or coalesce(r.read_at,case when n.staff_id=auth.uid() then n.read_at end) is null)
  order by n.created_at desc limit greatest(1,least(coalesce(p_limit,200),200))
 ) q;
 return rows;
end $$;
create or replace function public.mark_notifications_read(p_id uuid default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if p_id is not null and not exists(select 1 from public.notifications n where n.id=p_id and public.can_read_notification(n)) then
  raise exception 'Notification not found or permission denied'; end if;
 insert into saras_private.notification_reads(notification_id,user_id)
  select n.id,auth.uid() from public.notifications n where (p_id is null or n.id=p_id) and public.can_read_notification(n)
  on conflict(notification_id,user_id) do nothing;
 return jsonb_build_object('id',p_id,'read_at',now());
end $$;

create or replace function public.create_full_order_from_sample(p_sample_id uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.orders%rowtype; o public.orders%rowtype; prefix text;
begin
 perform public.assert_permission('orders','create'); perform public.assert_permission('orders','view');
 select * into s from public.orders where id=p_sample_id for update;
 if not found or s.nature<>'sample' or s.status='cancelled' then raise exception 'Valid sample order required'; end if;
 select * into o from public.orders where parent_sample_id=s.id order by created_at limit 1;
 if found then return to_jsonb(o); end if;
 select t.prefix into prefix from public.order_types t where id=s.order_type_id;
 insert into public.orders(user_id,customer_id,order_type_id,broker_id,payment_terms_id,parent_sample_id,status,nature,order_number)
 values(auth.uid(),s.customer_id,s.order_type_id,s.broker_id,s.payment_terms_id,s.id,'draft','production',
  public.generate_order_number(auth.uid(),coalesce(nullif(prefix,''),'ORD'))) returning * into o;
 return to_jsonb(o);
end $$;
-- Fail closed when the frontend and installed migration set do not match.
create table saras_private.webhook_deliveries(
 notification_id uuid primary key references public.notifications(id) on delete cascade,
 attempts integer not null default 1,status text not null default 'sending',updated_at timestamptz not null default now());
revoke all on saras_private.webhook_deliveries from public,anon,authenticated;
create or replace function public.claim_notification_webhook(p_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$
declare claimed uuid;
begin
 if not exists(select 1 from public.notifications n where n.id=p_id and n.user_id=auth.uid() and public.can_read_notification(n)) then
  raise exception 'Notification permission denied'; end if;
 insert into saras_private.webhook_deliveries(notification_id) values(p_id)
 on conflict(notification_id) do update set attempts=webhook_deliveries.attempts+1,status='sending',updated_at=now()
 where webhook_deliveries.status='failed' and webhook_deliveries.attempts<3 and webhook_deliveries.updated_at<now()-interval '5 minutes'
 returning notification_id into claimed;
 return claimed is not null;
end $$;
revoke all on function public.claim_notification_webhook(uuid) from public,anon;
grant execute on function public.claim_notification_webhook(uuid) to authenticated;
create or replace function public.finish_notification_webhook(p_id uuid,p_success boolean) returns void
language sql security definer set search_path=pg_catalog,public as $$
 update saras_private.webhook_deliveries set status=case when p_success then 'delivered' else 'failed' end,updated_at=now()
 where notification_id=p_id;
$$;
revoke all on function public.finish_notification_webhook(uuid,boolean) from public,anon,authenticated;
grant execute on function public.finish_notification_webhook(uuid,boolean) to service_role;
grant select on public.app_settings to service_role;
create or replace function public.erp_schema_version() returns text language sql stable as $$
 select '20261005095632'
$$;
revoke all on function public.erp_schema_version() from public;
grant execute on function public.erp_schema_version() to anon,service_role;
-- Explicit grants for every new public API; helpers have no anonymous access.
do $$
declare f record;
begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('transition_order_transactional','delete_draft_order','link_order_calculator',
   'adjust_stock_transactional','list_user_notifications','mark_notifications_read','erp_schema_version','create_full_order_from_sample')
 loop
  execute format('revoke all on function %s from public,anon',f.signature);
  execute format('grant execute on function %s to authenticated',f.signature);
 end loop;
end $$;
grant execute on function public.erp_schema_version() to anon,service_role;
commit;

