begin;
alter table public.payments add column if not exists user_id uuid;
alter table public.payments alter column user_id set default auth.uid();
do $$
declare definition text; expression text;
begin
  select replace(pg_get_functiondef('public.create_invoice_from_order_transactional(uuid,uuid)'::regprocedure),chr(13),'') into definition;
  expression := 'case when coalesce(v_order.balance_due, v_order.grand_total, 0) <= 0 then ''paid'' else ''issued'' end';
  definition := replace(definition, expression, '(jsonb_populate_record(null::public.invoices,jsonb_build_object(''status'',' || expression || '))).status');
  execute definition;
  select replace(pg_get_functiondef('public.record_payment_transactional(uuid,numeric,text,date,text,uuid,text,uuid)'::regprocedure),chr(13),'') into definition;
  expression := 'case
        when greatest(0, grand_total - v_total_paid) <= 0 then ''paid''
        when v_total_paid > 0 then ''partially_paid''
        else ''issued''
      end';
  definition := replace(definition,expression,'(jsonb_populate_record(null::public.invoices,jsonb_build_object(''status'',' || expression || '))).status');
  execute definition;
end $$;
commit;
