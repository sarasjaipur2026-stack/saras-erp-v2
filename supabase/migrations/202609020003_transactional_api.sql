-- Atomic, idempotent server-side workflows and uncapped aggregate reports.

begin;

create or replace function public.assert_permission(p_module text, p_action text)
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null or not public.has_permission(p_module, p_action) then
    raise exception 'Permission denied for %.%', p_module, p_action using errcode = '42501';
  end if;
end
$$;

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

  if v_line.product_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_line.product_id::text || ':' || v_unit, 1));
    select coalesce(sum(case when kind = 'out' then -quantity else quantity end), 0)
      into v_stock from public.stock_movements
      where product_id = v_line.product_id and unit = v_unit;
    if v_stock < p_quantity then
      raise exception 'Insufficient stock for product %: have %, need %', v_line.product_id, v_stock, p_quantity;
    end if;
  end if;

  v_challan := nullif(left(trim(p_challan_number), 100), '');
  if v_challan is null then select public.next_challan_number() into v_challan; end if;
  insert into public.deliveries (
    order_id, line_item_id, delivery_date, quantity_delivered, unit, challan_number,
    vehicle_number, delivery_note, dispatch_request_id
  ) values (
    p_order_id, p_line_item_id, coalesce(p_delivery_date, current_date), p_quantity, v_unit, v_challan,
    nullif(left(trim(p_vehicle_number), 100), ''), nullif(left(trim(p_delivery_note), 1000), ''), p_request_id
  ) returning * into v_delivery;
  if v_line.product_id is not null then
    insert into public.stock_movements (kind, product_id, quantity, unit, source_type, source_id, notes)
    values ('out', v_line.product_id, p_quantity, v_unit, 'delivery', v_delivery.id, 'Dispatched via ' || v_challan);
  end if;
  insert into public.activity_log (user_id, staff_id, entity_type, entity_id, action, comment)
  values (auth.uid(), auth.uid(), 'order', p_order_id, 'delivery', 'Delivery of ' || p_quantity || ' ' || v_unit || ' recorded');
  update public.orders set status = 'dispatch', updated_at = now() where id = p_order_id;
  return to_jsonb(v_delivery);
end
$$;

create or replace function public.record_payment_transactional(
  p_order_id uuid,
  p_amount numeric,
  p_payment_mode text,
  p_payment_date date,
  p_reference_number text default null,
  p_bank_id uuid default null,
  p_notes text default null,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_order public.orders%rowtype;
  v_payment public.payments%rowtype;
  v_total_paid numeric(14,2);
  v_balance numeric(14,2);
begin
  perform public.assert_permission('payments', 'record');
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be greater than zero'; end if;
  if p_payment_mode not in ('cash', 'cheque', 'upi', 'neft', 'rtgs', 'card', 'other') then
    raise exception 'Invalid payment mode';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_payment from public.payments where idempotency_key = p_request_id;
  if found then
    if v_payment.order_id <> p_order_id
       or v_payment.amount <> round(p_amount, 2)
       or v_payment.payment_mode <> p_payment_mode then
      raise exception 'request_id was already used for a different payment';
    end if;
    select greatest(0, coalesce(o.grand_total, 0) - coalesce(sum(p.amount), 0))
      into v_balance
    from public.orders o left join public.payments p on p.order_id = o.id
    where o.id = p_order_id group by o.grand_total;
    return to_jsonb(v_payment) || jsonb_build_object('balance_due', coalesce(v_balance, 0));
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
  if v_order.status = 'cancelled' then raise exception 'Cannot record a payment for a cancelled order'; end if;

  select coalesce(sum(amount), 0) into v_total_paid from public.payments where order_id = p_order_id;
  v_balance := greatest(0, coalesce(v_order.grand_total, 0) - v_total_paid);
  if p_amount > v_balance + 0.01 then
    raise exception 'Amount % exceeds balance due %', p_amount, v_balance;
  end if;

  insert into public.payments (
    order_id, amount, payment_mode, payment_date, reference_number, bank_id, notes, idempotency_key
  ) values (
    p_order_id, round(p_amount, 2), p_payment_mode, coalesce(p_payment_date, current_date),
    nullif(trim(p_reference_number), ''), p_bank_id, nullif(trim(p_notes), ''), p_request_id
  ) returning * into v_payment;

  v_total_paid := v_total_paid + v_payment.amount;
  v_balance := greatest(0, coalesce(v_order.grand_total, 0) - v_total_paid);
  update public.orders
  set advance_paid = v_total_paid,
      balance_due = v_balance,
      status = case when v_balance <= 0 and status = 'dispatch' then 'completed' else status end,
      updated_at = now()
  where id = p_order_id;

  update public.invoices
  set amount_paid = v_total_paid,
      balance_due = greatest(0, grand_total - v_total_paid),
      status = case
        when greatest(0, grand_total - v_total_paid) <= 0 then 'paid'
        when v_total_paid > 0 then 'partially_paid'
        else 'issued'
      end,
      updated_at = now()
  where order_id = p_order_id;

  return to_jsonb(v_payment) || jsonb_build_object('total_paid', v_total_paid, 'balance_due', v_balance);
end
$$;

create or replace function public.get_order_balance(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare v_order public.orders%rowtype; v_paid numeric(14,2);
begin
  perform public.assert_permission('payments', 'view');
  select * into v_order from public.orders where id = p_order_id;
  if not found then raise exception 'Order not found'; end if;
  select coalesce(sum(amount), 0) into v_paid from public.payments where order_id = p_order_id;
  return jsonb_build_object(
    'grandTotal', coalesce(v_order.grand_total, 0),
    'advancePaid', coalesce(v_order.advance_paid, 0),
    'totalPayments', v_paid,
    'balance', greatest(0, coalesce(v_order.grand_total, 0) - v_paid),
    'balanceDue', greatest(0, coalesce(v_order.grand_total, 0) - v_paid)
  );
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
  select * into v_invoice from public.invoices where order_id = p_order_id limit 1;
  if found then return to_jsonb(v_invoice); end if;
  select public.next_invoice_number() into v_number;
  insert into public.invoices (
    invoice_number, order_id, customer_id, invoice_date, due_date, subtotal,
    cgst_amount, sgst_amount, igst_amount, total_tax, grand_total,
    amount_paid, balance_due, status, idempotency_key
  ) values (
    v_number, v_order.id, v_order.customer_id, current_date, v_order.payment_due_date,
    coalesce(nullif(v_order.taxable_amount, 0), v_order.subtotal, 0),
    coalesce(v_order.cgst_amount, 0), coalesce(v_order.sgst_amount, 0), coalesce(v_order.igst_amount, 0),
    coalesce(v_order.cgst_amount, 0) + coalesce(v_order.sgst_amount, 0) + coalesce(v_order.igst_amount, 0),
    coalesce(v_order.grand_total, 0), coalesce(v_order.advance_paid, 0),
    greatest(0, coalesce(v_order.grand_total, 0) - coalesce(v_order.advance_paid, 0)),
    case when coalesce(v_order.balance_due, v_order.grand_total, 0) <= 0 then 'paid' else 'issued' end,
    p_request_id
  ) returning * into v_invoice;
  return to_jsonb(v_invoice);
end
$$;

create or replace function public.create_purchase_order_transactional(p_payload jsonb, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_item jsonb;
  v_number text;
  v_subtotal numeric(14,2) := 0;
  v_qty numeric;
  v_rate numeric;
  v_items jsonb := coalesce(p_payload -> 'items', '[]'::jsonb);
begin
  perform public.assert_permission('purchase', 'create');
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 or jsonb_array_length(v_items) > 1000 then
    raise exception 'Purchase order must contain between 1 and 1000 items';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_po from public.purchase_orders where idempotency_key = p_request_id;
  if found then
    if v_po.supplier_id is distinct from nullif(p_payload ->> 'supplier_id', '')::uuid then
      raise exception 'request_id belongs to a different purchase order';
    end if;
    return to_jsonb(v_po);
  end if;
  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_rate := coalesce((v_item ->> 'rate_per_unit')::numeric, 0);
    if v_qty <= 0 or nullif(v_item ->> 'yarn_type_id', '') is null then raise exception 'Invalid PO item'; end if;
    v_subtotal := v_subtotal + (v_qty * v_rate);
  end loop;
  select public.next_po_number() into v_number;
  insert into public.purchase_orders (
    po_number, supplier_id, po_date, expected_date, status, subtotal,
    cgst_amount, sgst_amount, igst_amount, grand_total, notes, idempotency_key
  ) values (
    v_number, (p_payload ->> 'supplier_id')::uuid,
    coalesce((p_payload ->> 'po_date')::date, current_date), nullif(p_payload ->> 'expected_date', '')::date,
    'issued', round(v_subtotal, 2), greatest(0, coalesce((p_payload ->> 'cgst_amount')::numeric, 0)),
    greatest(0, coalesce((p_payload ->> 'sgst_amount')::numeric, 0)),
    greatest(0, coalesce((p_payload ->> 'igst_amount')::numeric, 0)),
    round(v_subtotal, 2) + greatest(0, coalesce((p_payload ->> 'cgst_amount')::numeric, 0))
      + greatest(0, coalesce((p_payload ->> 'sgst_amount')::numeric, 0))
      + greatest(0, coalesce((p_payload ->> 'igst_amount')::numeric, 0)),
    nullif(trim(p_payload ->> 'notes'), ''), p_request_id
  ) returning * into v_po;
  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_qty := (v_item ->> 'quantity')::numeric;
    v_rate := coalesce((v_item ->> 'rate_per_unit')::numeric, 0);
    insert into public.purchase_order_items (
      po_id, yarn_type_id, description, quantity, unit, rate_per_unit, amount
    ) values (
      v_po.id, (v_item ->> 'yarn_type_id')::uuid, nullif(trim(v_item ->> 'description'), ''),
      v_qty, coalesce(nullif(v_item ->> 'unit', ''), 'kg'), v_rate, round(v_qty * v_rate, 2)
    );
  end loop;
  return to_jsonb(v_po);
end
$$;

create or replace function public.create_goods_receipt_transactional(
  p_po_id uuid,
  p_received_date date,
  p_vehicle_number text default null,
  p_warehouse_id uuid default null,
  p_notes text default null,
  p_items jsonb default '[]'::jsonb,
  p_request_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_po public.purchase_orders%rowtype;
  v_grn public.goods_receipts%rowtype;
  v_po_item public.purchase_order_items%rowtype;
  v_item jsonb;
  v_effective jsonb;
  v_number text;
  v_qty numeric;
  v_count integer := 0;
  v_all boolean;
  v_any boolean;
begin
  perform public.assert_permission('purchase', 'receive');
  if p_request_id is null then raise exception 'request_id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_grn from public.goods_receipts where idempotency_key = p_request_id;
  if found then
    if v_grn.po_id <> p_po_id then raise exception 'request_id belongs to a different goods receipt'; end if;
    return jsonb_build_object('grn_number', v_grn.grn_number, 'grn', to_jsonb(v_grn));
  end if;
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if v_po.status = 'cancelled' then raise exception 'Cannot receive a cancelled purchase order'; end if;
  if coalesce(jsonb_array_length(p_items), 0) = 0 then
    select coalesce(jsonb_agg(jsonb_build_object(
      'po_item_id', id, 'yarn_type_id', yarn_type_id,
      'quantity_received', greatest(0, quantity - quantity_received), 'unit', unit
    )), '[]'::jsonb) into v_effective
    from public.purchase_order_items where po_id = p_po_id and quantity_received < quantity;
  else
    v_effective := p_items;
  end if;
  if jsonb_array_length(v_effective) = 0 then raise exception 'No outstanding items to receive'; end if;
  select public.next_grn_number() into v_number;
  insert into public.goods_receipts (
    grn_number, po_id, supplier_id, received_date, vehicle_number, warehouse_id, notes, idempotency_key
  ) values (
    v_number, v_po.id, v_po.supplier_id, coalesce(p_received_date, current_date),
    nullif(trim(p_vehicle_number), ''), p_warehouse_id, nullif(trim(p_notes), ''), p_request_id
  ) returning * into v_grn;
  for v_item in select value from jsonb_array_elements(v_effective)
  loop
    select * into v_po_item from public.purchase_order_items
      where id = (v_item ->> 'po_item_id')::uuid and po_id = p_po_id for update;
    if not found then raise exception 'Invalid purchase order item'; end if;
    v_qty := (v_item ->> 'quantity_received')::numeric;
    if v_qty <= 0 or v_po_item.quantity_received + v_qty > v_po_item.quantity then
      raise exception 'Received quantity exceeds outstanding quantity';
    end if;
    insert into public.goods_receipt_items (
      grn_id, po_item_id, yarn_type_id, quantity_received, unit, qc_status
    ) values (v_grn.id, v_po_item.id, v_po_item.yarn_type_id, v_qty, v_po_item.unit, 'pending');
    update public.purchase_order_items set quantity_received = quantity_received + v_qty where id = v_po_item.id;
    insert into public.stock_movements (
      kind, yarn_type_id, warehouse_id, quantity, unit, source_type, source_id, notes
    ) values ('in', v_po_item.yarn_type_id, p_warehouse_id, v_qty, v_po_item.unit, 'grn', v_grn.id, 'Received via ' || v_number);
    v_count := v_count + 1;
  end loop;
  select bool_and(quantity_received >= quantity), bool_or(quantity_received > 0)
    into v_all, v_any from public.purchase_order_items where po_id = p_po_id;
  update public.purchase_orders
    set status = case when v_all then 'received' when v_any then 'partially_received' else 'issued' end,
        updated_at = now()
    where id = p_po_id;
  return jsonb_build_object('grn_number', v_number, 'grn', to_jsonb(v_grn), 'item_count', v_count);
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
    if v_line.product_id is not null then
      perform pg_advisory_xact_lock(hashtextextended(v_line.product_id::text, 1));
      select coalesce(sum(case when kind = 'out' then -quantity else quantity end), 0)
        into v_stock from public.stock_movements where product_id = v_line.product_id;
      if v_stock < v_remaining then
        raise exception 'Insufficient stock for product %: have %, need %', v_line.product_id, v_stock, v_remaining;
      end if;
    end if;
    insert into public.deliveries (
      order_id, line_item_id, delivery_date, quantity_delivered, unit, challan_number,
      vehicle_number, driver_name, delivery_note, dispatch_request_id
    ) values (
      p_order_id, v_line.id, current_date, v_remaining, v_unit, v_challan,
      nullif(trim(p_vehicle_number), ''), nullif(trim(p_driver_name), ''),
      nullif(trim(p_delivery_note), ''), p_request_id
    ) returning * into v_delivery;
    if v_line.product_id is not null then
      insert into public.stock_movements (
        kind, product_id, quantity, unit, source_type, source_id, notes
      ) values ('out', v_line.product_id, v_remaining, v_unit, 'delivery', v_delivery.id, 'Dispatched via ' || v_challan);
    end if;
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
  select coalesce(jsonb_agg(to_jsonb(p) order by p.created_at), '[]'::jsonb) into v_rows
    from public.production_plans p
    where p.create_request_id = p_request_id or (p.order_id = p_order_id and p.status <> 'cancelled');
  if jsonb_array_length(v_rows) > 0 then return v_rows; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found'; end if;
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
  select * into v_plan from public.production_plans where id = p_plan_id for update;
  if not found then raise exception 'Production plan not found'; end if;
  if v_plan.status = 'completed' then
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
    updated_at = now()
  where id = p_plan_id returning * into v_plan;
  if v_plan.completed_qty < 0 or v_plan.completed_qty > v_plan.planned_qty then raise exception 'Invalid completed quantity'; end if;
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

create or replace function public.create_jobwork_transactional(p_payload jsonb, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_job public.jobwork_jobs%rowtype; v_item jsonb; v_inserted public.jobwork_items%rowtype; v_number text;
begin
  perform public.assert_permission('jobwork', 'manage');
  if p_request_id is null then raise exception 'request_id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_job from public.jobwork_jobs where idempotency_key = p_request_id;
  if found then
    if v_job.direction is distinct from p_payload ->> 'direction'
       or v_job.order_id is distinct from nullif(p_payload ->> 'order_id', '')::uuid then
      raise exception 'request_id belongs to a different jobwork job';
    end if;
    return to_jsonb(v_job);
  end if;
  if p_payload ->> 'direction' = 'inward' and nullif(p_payload ->> 'customer_id', '') is null then raise exception 'Inward jobwork needs a customer'; end if;
  if p_payload ->> 'direction' = 'outward' and nullif(p_payload ->> 'supplier_id', '') is null then raise exception 'Outward jobwork needs a supplier'; end if;
  select public.next_jobwork_number() into v_number;
  insert into public.jobwork_jobs (
    job_number, direction, status, customer_id, supplier_id, order_id, start_date,
    due_date, rate_per_unit, rate_unit, notes, idempotency_key
  ) values (
    v_number, p_payload ->> 'direction', 'pending', nullif(p_payload ->> 'customer_id', '')::uuid,
    nullif(p_payload ->> 'supplier_id', '')::uuid, nullif(p_payload ->> 'order_id', '')::uuid,
    coalesce((p_payload ->> 'start_date')::date, current_date), nullif(p_payload ->> 'due_date', '')::date,
    nullif(p_payload ->> 'rate_per_unit', '')::numeric, coalesce(nullif(p_payload ->> 'rate_unit', ''), 'kg'),
    nullif(trim(p_payload ->> 'notes'), ''), p_request_id
  ) returning * into v_job;
  for v_item in select value from jsonb_array_elements(coalesce(p_payload -> 'items', '[]'::jsonb))
  loop
    if coalesce((v_item ->> 'quantity')::numeric, 0) <= 0 then raise exception 'Invalid jobwork quantity'; end if;
    insert into public.jobwork_items (
      job_id, kind, yarn_type_id, product_type_id, quantity, unit, event_date, notes
    ) values (
      v_job.id, v_item ->> 'kind', nullif(v_item ->> 'yarn_type_id', '')::uuid,
      nullif(v_item ->> 'product_type_id', '')::uuid, (v_item ->> 'quantity')::numeric,
      coalesce(nullif(v_item ->> 'unit', ''), 'kg'), coalesce((v_item ->> 'event_date')::date, v_job.start_date),
      nullif(trim(v_item ->> 'notes'), '')
    ) returning * into v_inserted;
    insert into public.stock_movements (
      kind, yarn_type_id, product_type_id, quantity, unit, source_type, source_id, notes
    ) values (
      case when v_inserted.kind in ('material_received', 'finished_received') then 'in' else 'out' end,
      v_inserted.yarn_type_id, v_inserted.product_type_id, v_inserted.quantity, v_inserted.unit,
      'jobwork', v_inserted.id, 'Jobwork ' || replace(v_inserted.kind, '_', ' ') || ' (' || v_number || ')'
    );
  end loop;
  if exists (select 1 from public.jobwork_items where job_id = v_job.id) then
    update public.jobwork_jobs set status = 'in_progress', updated_at = now() where id = v_job.id returning * into v_job;
  end if;
  return to_jsonb(v_job);
end
$$;

create or replace function public.add_jobwork_item_transactional(p_payload jsonb, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_item public.jobwork_items%rowtype; v_job public.jobwork_jobs%rowtype;
begin
  perform public.assert_permission('jobwork', 'manage');
  if p_request_id is null then raise exception 'request_id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_item from public.jobwork_items where idempotency_key = p_request_id;
  if found then
    if v_item.job_id is distinct from nullif(p_payload ->> 'job_id', '')::uuid then
      raise exception 'request_id belongs to a different jobwork item';
    end if;
    return to_jsonb(v_item);
  end if;
  select * into v_job from public.jobwork_jobs where id = (p_payload ->> 'job_id')::uuid for update;
  if not found or v_job.status in ('completed', 'cancelled') then raise exception 'Jobwork is not open'; end if;
  if coalesce((p_payload ->> 'quantity')::numeric, 0) <= 0 then raise exception 'Invalid quantity'; end if;
  insert into public.jobwork_items (
    job_id, kind, yarn_type_id, product_type_id, quantity, unit, event_date, notes, idempotency_key
  ) values (
    v_job.id, p_payload ->> 'kind', nullif(p_payload ->> 'yarn_type_id', '')::uuid,
    nullif(p_payload ->> 'product_type_id', '')::uuid, (p_payload ->> 'quantity')::numeric,
    coalesce(nullif(p_payload ->> 'unit', ''), 'kg'), coalesce((p_payload ->> 'event_date')::date, current_date),
    nullif(trim(p_payload ->> 'notes'), ''), p_request_id
  ) returning * into v_item;
  insert into public.stock_movements (kind, yarn_type_id, product_type_id, quantity, unit, source_type, source_id, notes)
  values (
    case when v_item.kind in ('material_received', 'finished_received') then 'in' else 'out' end,
    v_item.yarn_type_id, v_item.product_type_id, v_item.quantity, v_item.unit, 'jobwork', v_item.id,
    'Jobwork ' || replace(v_item.kind, '_', ' ')
  );
  update public.jobwork_jobs set status = 'in_progress', updated_at = now() where id = v_job.id;
  return to_jsonb(v_item);
end
$$;

create or replace function public.create_quality_inspection_transactional(p_payload jsonb, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.quality_inspections%rowtype; v_number text;
begin
  perform public.assert_permission('quality', 'inspect');
  if p_request_id is null then raise exception 'request_id is required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_row from public.quality_inspections where idempotency_key = p_request_id;
  if found then
    if v_row.source_type is distinct from coalesce(nullif(p_payload ->> 'source_type', ''), 'manual')
       or v_row.source_id is distinct from nullif(p_payload ->> 'source_id', '')::uuid then
      raise exception 'request_id belongs to a different quality inspection';
    end if;
    return to_jsonb(v_row);
  end if;
  select public.next_qi_number() into v_number;
  insert into public.quality_inspections (
    qi_number, source_type, source_id, inspector, sample_size, overall_status, notes, idempotency_key
  ) values (
    v_number, coalesce(nullif(p_payload ->> 'source_type', ''), 'manual'),
    nullif(p_payload ->> 'source_id', '')::uuid, nullif(trim(p_payload ->> 'inspector'), ''),
    nullif(p_payload ->> 'sample_size', '')::integer, 'pending', nullif(trim(p_payload ->> 'notes'), ''), p_request_id
  ) returning * into v_row;
  return to_jsonb(v_row);
end
$$;

create or replace function public.submit_quality_results_transactional(
  p_inspection_id uuid, p_results jsonb, p_overall_status text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_inspection public.quality_inspections%rowtype; v_result jsonb;
begin
  perform public.assert_permission('quality', 'inspect');
  if p_overall_status not in ('pending', 'passed', 'failed', 'rework') then raise exception 'Invalid quality status'; end if;
  select * into v_inspection from public.quality_inspections where id = p_inspection_id for update;
  if not found then raise exception 'Inspection not found'; end if;
  delete from public.quality_inspection_results where inspection_id = p_inspection_id;
  for v_result in select value from jsonb_array_elements(coalesce(p_results, '[]'::jsonb))
  loop
    insert into public.quality_inspection_results (
      inspection_id, parameter_id, parameter_name, measured_value, text_value, pass, notes
    ) values (
      p_inspection_id, nullif(v_result ->> 'parameter_id', '')::uuid, nullif(trim(v_result ->> 'parameter_name'), ''),
      nullif(v_result ->> 'measured_value', '')::numeric, nullif(trim(v_result ->> 'text_value'), ''),
      nullif(v_result ->> 'pass', '')::boolean, nullif(trim(v_result ->> 'notes'), '')
    );
  end loop;
  update public.quality_inspections
    set overall_status = p_overall_status, inspected_at = now(), updated_at = now()
    where id = p_inspection_id returning * into v_inspection;
  if v_inspection.source_type = 'grn' and v_inspection.source_id is not null and p_overall_status <> 'pending' then
    update public.goods_receipt_items set qc_status = p_overall_status where grn_id = v_inspection.source_id;
  end if;
  return to_jsonb(v_inspection);
end
$$;

create or replace function public.update_own_profile(p_profile jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  update public.profiles set
    company_name = left(coalesce(p_profile ->> 'company_name', ''), 200),
    gstin = left(coalesce(p_profile ->> 'gstin', ''), 20),
    pan = left(coalesce(p_profile ->> 'pan', ''), 20),
    address = left(coalesce(p_profile ->> 'address', ''), 1000),
    city = left(coalesce(p_profile ->> 'city', ''), 100),
    state = left(coalesce(p_profile ->> 'state', ''), 100),
    state_code = left(coalesce(p_profile ->> 'state_code', ''), 5),
    phone = left(coalesce(p_profile ->> 'phone', ''), 30),
    email = left(coalesce(p_profile ->> 'email', ''), 320),
    logo_url = left(coalesce(p_profile ->> 'logo_url', ''), 2000),
    default_order_type = left(coalesce(p_profile ->> 'default_order_type', ''), 50),
    default_payment_terms = left(coalesce(p_profile ->> 'default_payment_terms', ''), 50),
    order_number_format = left(coalesce(p_profile ->> 'order_number_format', ''), 100),
    price_summary_fields = coalesce(p_profile -> 'price_summary_fields', '{}'::jsonb),
    print_letterhead = coalesce((p_profile ->> 'print_letterhead')::boolean, true),
    print_terms_conditions = left(coalesce(p_profile ->> 'print_terms_conditions', ''), 10000),
    gst_company_state_code = left(coalesce(p_profile ->> 'gst_company_state_code', ''), 5),
    default_cgst_rate = coalesce((p_profile ->> 'default_cgst_rate')::numeric, 0),
    default_sgst_rate = coalesce((p_profile ->> 'default_sgst_rate')::numeric, 0),
    default_igst_rate = coalesce((p_profile ->> 'default_igst_rate')::numeric, 0),
    auto_split_gst = coalesce((p_profile ->> 'auto_split_gst')::boolean, true),
    updated_at = now()
  where id = auth.uid() returning * into v_profile;
  if not found then raise exception 'Profile not found'; end if;
  return to_jsonb(v_profile) - 'permissions';
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

create or replace function public.set_app_setting(p_key text, p_value jsonb, p_description text default null)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_row public.app_settings%rowtype;
begin
  perform public.assert_permission('settings', 'manage');
  if p_key !~ '^[a-z0-9._-]{1,100}$' then raise exception 'Invalid setting key'; end if;
  insert into public.app_settings(key, value, description, updated_at)
    values (p_key, coalesce(p_value, '{}'::jsonb), p_description, now())
    on conflict (key) do update set value = excluded.value,
      description = coalesce(excluded.description, public.app_settings.description), updated_at = now()
    returning * into v_row;
  return to_jsonb(v_row);
end
$$;

create or replace function public.import_master_rows(
  p_table text, p_rows jsonb, p_filename text, p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare v_count integer; v_row jsonb; v_existing public.import_log%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator access required' using errcode = '42501'; end if;
  if p_table not in ('customers', 'products', 'materials', 'machines', 'colors', 'suppliers', 'brokers') then
    raise exception 'Unsupported import table';
  end if;
  if p_request_id is null then raise exception 'request_id is required'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Rows must be an array'; end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 1000 then raise exception 'Import must contain between 1 and 1000 rows'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_existing from public.import_log where idempotency_key = p_request_id;
  if found then
    if v_existing.import_type <> p_table then raise exception 'request_id belongs to a different import'; end if;
    return to_jsonb(v_existing);
  end if;
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    case p_table
      when 'customers' then
        if nullif(trim(v_row ->> 'firm_name'), '') is null then raise exception 'Customer firm_name is required'; end if;
        insert into public.customers (
          user_id, firm_name, contact_name, phone, email, city, state, address, gstin, pan, credit_limit
        ) values (
          auth.uid(), left(trim(v_row ->> 'firm_name'), 200), nullif(left(trim(v_row ->> 'contact_name'), 200), ''),
          nullif(left(trim(v_row ->> 'phone'), 30), ''), nullif(left(trim(v_row ->> 'email'), 320), ''),
          nullif(left(trim(v_row ->> 'city'), 100), ''), nullif(left(trim(v_row ->> 'state'), 100), ''),
          nullif(left(trim(v_row ->> 'address'), 1000), ''), nullif(left(trim(v_row ->> 'gstin'), 20), ''),
          nullif(left(trim(v_row ->> 'pan'), 20), ''), nullif(v_row ->> 'credit_limit', '')::numeric
        );
      when 'products' then
        if nullif(trim(v_row ->> 'name'), '') is null or nullif(trim(v_row ->> 'code'), '') is null then
          raise exception 'Product name and code are required';
        end if;
        if coalesce(nullif(v_row ->> 'default_rate_unit', ''), 'per_meter') not in ('per_meter', 'per_kg', 'per_piece') then
          raise exception 'Invalid product rate unit';
        end if;
        insert into public.products (
          user_id, name, code, name_hi, hsn_code, gst_rate, rate_unit, default_rate_unit, uses_filler
        ) values (
          auth.uid(), left(trim(v_row ->> 'name'), 200), left(trim(v_row ->> 'code'), 80),
          nullif(left(trim(v_row ->> 'name_hi'), 200), ''), nullif(left(trim(v_row ->> 'hsn_code'), 20), ''),
          coalesce(nullif(v_row ->> 'gst_rate', '')::numeric, 0),
          coalesce(nullif(v_row ->> 'default_rate_unit', ''), 'per_meter'),
          coalesce(nullif(v_row ->> 'default_rate_unit', ''), 'per_meter'),
          coalesce(nullif(v_row ->> 'uses_filler', '')::boolean, false)
        );
      when 'materials' then
        if nullif(trim(v_row ->> 'name'), '') is null then raise exception 'Material name is required'; end if;
        insert into public.materials (user_id, name, category, price_per_kg, hsn_code, gst_rate)
        values (
          auth.uid(), left(trim(v_row ->> 'name'), 200),
          left(coalesce(nullif(trim(v_row ->> 'category'), ''), 'other'), 100),
          nullif(v_row ->> 'price_per_kg', '')::numeric, nullif(left(trim(v_row ->> 'hsn_code'), 20), ''),
          coalesce(nullif(v_row ->> 'gst_rate', '')::numeric, 0)
        );
      when 'machines' then
        if nullif(trim(v_row ->> 'name'), '') is null or nullif(trim(v_row ->> 'code'), '') is null then
          raise exception 'Machine name and code are required';
        end if;
        insert into public.machines (user_id, name, code, name_hi, spindles, machine_count)
        values (
          auth.uid(), left(trim(v_row ->> 'name'), 200), left(trim(v_row ->> 'code'), 80),
          nullif(left(trim(v_row ->> 'name_hi'), 200), ''), nullif(v_row ->> 'spindles', '')::integer,
          greatest(1, coalesce(nullif(v_row ->> 'machine_count', '')::integer, 1))
        );
      when 'colors' then
        if nullif(trim(v_row ->> 'name'), '') is null then raise exception 'Color name is required'; end if;
        if coalesce(nullif(v_row ->> 'hex_code', ''), '#000000') !~ '^#[0-9A-Fa-f]{6}$' then
          raise exception 'Color hex_code must use #RRGGBB';
        end if;
        insert into public.colors (user_id, name, hex_code)
        values (
          auth.uid(), left(trim(v_row ->> 'name'), 200), upper(coalesce(nullif(v_row ->> 'hex_code', ''), '#000000'))
        );
      when 'suppliers' then
        if nullif(trim(coalesce(v_row ->> 'name', v_row ->> 'firm')), '') is null then
          raise exception 'Supplier name or firm is required';
        end if;
        insert into public.suppliers (user_id, name, firm, phone, email, city, state, address, gstin)
        values (
          auth.uid(), left(trim(coalesce(nullif(v_row ->> 'name', ''), v_row ->> 'firm')), 200),
          nullif(left(trim(v_row ->> 'firm'), 200), ''), nullif(left(trim(v_row ->> 'phone'), 30), ''),
          nullif(left(trim(v_row ->> 'email'), 320), ''), nullif(left(trim(v_row ->> 'city'), 100), ''),
          nullif(left(trim(v_row ->> 'state'), 100), ''), nullif(left(trim(v_row ->> 'address'), 1000), ''),
          nullif(left(trim(v_row ->> 'gstin'), 20), '')
        );
      when 'brokers' then
        if nullif(trim(v_row ->> 'name'), '') is null then raise exception 'Broker name is required'; end if;
        insert into public.brokers (user_id, name, phone, email, commission_rate, city)
        values (
          auth.uid(), left(trim(v_row ->> 'name'), 200), nullif(left(trim(v_row ->> 'phone'), 30), ''),
          nullif(left(trim(v_row ->> 'email'), 320), ''), nullif(v_row ->> 'commission_rate', '')::numeric,
          nullif(left(trim(v_row ->> 'city'), 100), '')
        );
    end case;
  end loop;
  insert into public.import_log(user_id, import_type, filename, record_count, status, idempotency_key)
    values (auth.uid(), p_table, left(p_filename, 180), v_count, 'completed', p_request_id)
    returning * into v_existing;
  return to_jsonb(v_existing);
end
$$;

create or replace function public.dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_status_counts jsonb := '{}'::jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  if public.has_permission('orders', 'view') then
    select jsonb_build_object(
      'total_orders', count(*),
      'pending_orders', count(*) filter (where status in ('draft', 'booking', 'approved', 'production', 'qc')),
      'urgent_orders', count(*) filter (where priority = 'urgent' and status not in ('completed', 'cancelled')),
      'total_revenue', coalesce(sum(grand_total) filter (where status <> 'cancelled'), 0),
      'outstanding_balance', coalesce(sum(balance_due) filter (where status <> 'cancelled'), 0),
      'overdue_count', count(*) filter (
        where coalesce(payment_due_date, delivery_date_1, delivery_date) < current_date
          and balance_due > 0 and status not in ('completed', 'cancelled')
      )
    ) into v_result from public.orders;
    select coalesce(jsonb_object_agg(status, count), '{}'::jsonb) into v_status_counts
    from (select status, count(*)::integer as count from public.orders group by status) s;
  else
    v_result := jsonb_build_object(
      'total_orders', 0, 'pending_orders', 0, 'urgent_orders', 0,
      'total_revenue', 0, 'outstanding_balance', 0, 'overdue_count', 0
    );
  end if;

  v_result := v_result || jsonb_build_object(
    'status_counts', v_status_counts,
    'new_enquiries', case when public.has_permission('enquiries', 'view')
      then (select count(*) from public.enquiries where outcome = 'open') else 0 end,
    'total_customers', case when public.has_permission('masters', 'view')
      then (select count(*) from public.customers) else 0 end,
    'total_payments', case when public.has_permission('payments', 'view')
      then (select coalesce(sum(amount), 0) from public.payments) else 0 end
  );
  return v_result;
end
$$;

create or replace function public.search_entities(
  q text,
  types text[] default null,
  max_per integer default 5
)
returns table (
  entity_type text,
  entity_id uuid,
  primary_label text,
  secondary text,
  metadata jsonb,
  rank integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_query text := left(trim(coalesce(q, '')), 100);
  v_pattern text;
  v_max integer := greatest(1, least(coalesce(max_per, 5), 20));
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if v_query = '' then return; end if;
  v_pattern := '%' || replace(replace(v_query, '%', E'\\%'), '_', E'\\_') || '%';

  return query
  with matches as (
    select 'customer'::text as kind, c.id,
      c.firm_name as label, concat_ws(' · ', c.contact_name, c.phone, c.city) as detail,
      jsonb_build_object('gstin', c.gstin) as meta,
      case when lower(c.firm_name) = lower(v_query) then 0 when c.firm_name ilike v_query || '%' then 1 else 2 end as score
    from public.customers c
    where public.has_permission('masters', 'view') and (types is null or 'customer' = any(types))
      and concat_ws(' ', c.firm_name, c.contact_name, c.phone, c.gstin, c.city) ilike v_pattern escape E'\\'
    union all
    select 'order', o.id, o.order_number, c.firm_name,
      jsonb_build_object('status', o.status, 'priority', o.priority, 'grand_total', o.grand_total),
      case when lower(o.order_number) = lower(v_query) then 0 when o.order_number ilike v_query || '%' then 1 else 2 end
    from public.orders o left join public.customers c on c.id = o.customer_id
    where public.has_permission('orders', 'view') and (types is null or 'order' = any(types))
      and concat_ws(' ', o.order_number, c.firm_name, o.status) ilike v_pattern escape E'\\'
    union all
    select 'enquiry', e.id, e.enquiry_number, c.firm_name,
      jsonb_build_object('stage', e.stage, 'outcome', e.outcome, 'priority', e.priority),
      case when lower(e.enquiry_number) = lower(v_query) then 0 when e.enquiry_number ilike v_query || '%' then 1 else 2 end
    from public.enquiries e left join public.customers c on c.id = e.customer_id
    where public.has_permission('enquiries', 'view') and (types is null or 'enquiry' = any(types))
      and concat_ws(' ', e.enquiry_number, c.firm_name, e.contact_person_name, e.contact_phone) ilike v_pattern escape E'\\'
    union all
    select 'invoice', i.id, i.invoice_number, coalesce(c.firm_name, o.order_number),
      jsonb_build_object('status', i.status, 'grand_total', i.grand_total, 'balance_due', i.balance_due),
      case when lower(i.invoice_number) = lower(v_query) then 0 when i.invoice_number ilike v_query || '%' then 1 else 2 end
    from public.invoices i join public.orders o on o.id = i.order_id left join public.customers c on c.id = i.customer_id
    where public.has_permission('invoices', 'view') and (types is null or 'invoice' = any(types))
      and concat_ws(' ', i.invoice_number, o.order_number, c.firm_name) ilike v_pattern escape E'\\'
    union all
    select 'payment', p.id, coalesce(nullif(p.reference_number, ''), 'Payment ' || left(p.id::text, 8)), o.order_number,
      jsonb_build_object('amount', p.amount, 'payment_mode', p.payment_mode, 'payment_date', p.payment_date),
      case when lower(coalesce(p.reference_number, '')) = lower(v_query) then 0
        when coalesce(p.reference_number, '') ilike v_query || '%' then 1 else 2 end
    from public.payments p join public.orders o on o.id = p.order_id
    where public.has_permission('payments', 'view') and (types is null or 'payment' = any(types))
      and concat_ws(' ', p.reference_number, o.order_number, p.payment_mode) ilike v_pattern escape E'\\'
    union all
    select 'delivery', d.id, coalesce(nullif(d.challan_number, ''), 'Delivery ' || left(d.id::text, 8)), o.order_number,
      jsonb_build_object('delivery_date', d.delivery_date, 'quantity', d.quantity_delivered, 'unit', d.unit),
      case when lower(coalesce(d.challan_number, '')) = lower(v_query) then 0
        when coalesce(d.challan_number, '') ilike v_query || '%' then 1 else 2 end
    from public.deliveries d join public.orders o on o.id = d.order_id
    where public.has_permission('dispatch', 'view') and (types is null or 'delivery' = any(types))
      and concat_ws(' ', d.challan_number, o.order_number, d.vehicle_number) ilike v_pattern escape E'\\'
    union all
    select 'purchase_order', po.id, po.po_number, coalesce(s.firm, s.name),
      jsonb_build_object('status', po.status, 'grand_total', po.grand_total, 'po_date', po.po_date),
      case when lower(po.po_number) = lower(v_query) then 0 when po.po_number ilike v_query || '%' then 1 else 2 end
    from public.purchase_orders po left join public.suppliers s on s.id = po.supplier_id
    where public.has_permission('purchase', 'view') and (types is null or 'purchase_order' = any(types))
      and concat_ws(' ', po.po_number, s.name, s.firm) ilike v_pattern escape E'\\'
    union all
    select 'product', p.id, p.name, p.code,
      jsonb_build_object('hsn_code', p.hsn_code, 'gst_rate', p.gst_rate),
      case when lower(p.code) = lower(v_query) or lower(p.name) = lower(v_query) then 0
        when p.code ilike v_query || '%' or p.name ilike v_query || '%' then 1 else 2 end
    from public.products p
    where public.has_permission('masters', 'view') and (types is null or 'product' = any(types))
      and concat_ws(' ', p.code, p.name, p.name_hi, p.hsn_code) ilike v_pattern escape E'\\'
  ), ranked as (
    select m.*, row_number() over (partition by m.kind order by m.score, m.label) as row_num
    from matches m
  )
  select r.kind, r.id, r.label, r.detail, r.meta, r.score
  from ranked r where r.row_num <= v_max
  order by r.score, r.kind, r.label;
end
$$;

create or replace function public.report_sales_register(p_from timestamptz default null, p_to timestamptz default null)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_rows jsonb;
begin
  perform public.assert_permission('reports', 'view');
  select coalesce(jsonb_agg(row_data order by created_at desc), '[]'::jsonb) into v_rows
  from (
    select o.created_at, to_jsonb(o) || jsonb_build_object(
      'customers', jsonb_build_object('firm_name', c.firm_name, 'gstin', c.gstin)
    ) as row_data
    from public.orders o left join public.customers c on c.id = o.customer_id
    where (p_from is null or o.created_at >= p_from) and (p_to is null or o.created_at <= p_to)
  ) q;
  return v_rows;
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
    from public.customers c join public.orders o on o.customer_id = c.id
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
    where (p_from is null or po.po_date >= p_from) and (p_to is null or po.po_date <= p_to)
  ) q;
  return v_rows;
end $$;

create or replace function public.stock_balances()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog, public as $$
declare v_rows jsonb;
begin
  perform public.assert_permission('stock', 'view');
  select coalesce(jsonb_agg(to_jsonb(q) order by q.last_move desc), '[]'::jsonb) into v_rows
  from (
    select concat_ws('|', sm.product_id, sm.material_id, sm.yarn_type_id, sm.product_type_id, sm.warehouse_id, sm.unit) as key,
      sm.product_id, sm.material_id, sm.yarn_type_id, sm.product_type_id, sm.warehouse_id,
      coalesce(max(p.name), max(pt.name), max(m.name), max(yt.name)) as product_name,
      coalesce(max(m.name), max(yt.name)) as material_name,
      max(w.name) as warehouse_name,
      (sm.product_id is not null or sm.product_type_id is not null) as is_finished_good,
      sm.unit, sum(case when sm.kind = 'out' then -sm.quantity else sm.quantity end) as quantity,
      max(sm.created_at) as last_move
    from public.stock_movements sm
    left join public.products p on p.id = sm.product_id
    left join public.product_types pt on pt.id = sm.product_type_id
    left join public.materials m on m.id = sm.material_id
    left join public.yarn_types yt on yt.id = sm.yarn_type_id
    left join public.warehouses w on w.id = sm.warehouse_id
    group by sm.product_id, sm.material_id, sm.yarn_type_id, sm.product_type_id, sm.warehouse_id, sm.unit
  ) q;
  return v_rows;
end $$;

-- RPCs are available only to signed-in users; every function also performs
-- an explicit server-side permission check.
revoke all on function public.assert_permission(text, text) from public;
grant execute on function public.assert_permission(text, text) to authenticated;
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'record_delivery_transactional', 'record_payment_transactional', 'get_order_balance', 'create_invoice_from_order_transactional',
      'create_purchase_order_transactional', 'create_goods_receipt_transactional',
      'create_dispatch_transactional', 'create_production_plans_transactional',
      'update_production_plan_transactional', 'create_jobwork_transactional',
      'add_jobwork_item_transactional', 'create_quality_inspection_transactional',
      'submit_quality_results_transactional', 'update_own_profile',
      'admin_update_user_permissions', 'set_app_setting', 'import_master_rows',
      'dashboard_stats', 'search_entities', 'report_sales_register',
      'report_customer_outstanding', 'report_purchase_register', 'stock_balances'
    )
  loop
    execute format('revoke all on function %s from public', fn.signature);
    execute format('grant execute on function %s to authenticated', fn.signature);
  end loop;
end $$;

commit;
