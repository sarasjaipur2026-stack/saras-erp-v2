begin;
do $$ declare definition text; begin
select pg_get_functiondef('public.create_invoice_from_order_transactional(uuid,uuid)'::regprocedure) into definition;
definition:=replace(definition,
  'coalesce(nullif(v_order.taxable_amount, 0), v_order.subtotal, 0)',
  '(coalesce(v_order.grand_total,0)-coalesce(v_order.cgst_amount,0)-coalesce(v_order.sgst_amount,0)-coalesce(v_order.igst_amount,0))');
execute definition;
select pg_get_functiondef('public.record_payment_transactional(uuid,numeric,text,date,text,uuid,text,uuid)'::regprocedure) into definition;
definition:=replace(definition,
  'v_balance <= 0 and status = ''dispatch''',
  'v_balance <= 0 and status = ''dispatch'' and not exists (
    select 1 from public.order_line_items li where li.order_id=p_order_id
    and coalesce(nullif(li.quantity,0),nullif(li.meters,0),nullif(li.weight_kg,0),0)
      > (select coalesce(sum(d.quantity_delivered),0) from public.deliveries d where d.line_item_id=li.id)
  )');
execute definition;
end $$;
commit;
