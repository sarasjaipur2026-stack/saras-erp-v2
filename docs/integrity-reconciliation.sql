-- Read-only review queries. Run after database access is restored, before
-- deciding any historical corrections. Do not automatically erase ledger rows.
select product_id,material_id,yarn_type_id,product_type_id,warehouse_id,unit,
 sum(case when kind='out' then -quantity else quantity end) as balance
from public.stock_movements
group by product_id,material_id,yarn_type_id,product_type_id,warehouse_id,unit
having sum(case when kind='out' then -quantity else quantity end)<0;

select o.id,o.order_number,o.grand_total,o.advance_paid,o.balance_due,
 coalesce(sum(p.amount),0) as payments_total
from public.orders o left join public.payments p on p.order_id=o.id
group by o.id
having coalesce(sum(p.amount),0)>o.grand_total
 or coalesce(sum(p.amount),0) is distinct from o.advance_paid
 or greatest(0,o.grand_total-coalesce(sum(p.amount),0)) is distinct from o.balance_due;

select p.id,p.order_id,p.completed_qty,coalesce(sum(m.quantity),0) as stock_posted
from public.production_plans p left join public.stock_movements m
 on m.source_type='production' and m.source_id=p.id and m.kind='in'
where p.status='completed' and p.product_id is not null
group by p.id
having p.completed_qty<=0 or coalesce(sum(m.quantity),0)<>p.completed_qty;

select i.id,i.invoice_number,i.status,o.order_number,o.status as order_status
from public.invoices i join public.orders o on o.id=i.order_id
where o.status in ('draft','cancelled') and i.status::text<>'cancelled';

select order_id,line_item_id,count(*) as open_plans from public.production_plans
where status<>'cancelled' group by order_id,line_item_id having count(*)>1;

select count(*) as administrator_count from public.profiles where role='admin';

select a.id,a.entity_type,a.entity_id,a.storage_path
from public.attachments a left join storage.objects s
 on s.bucket_id='order-attachments' and s.name=a.storage_path
where s.id is null;

select s.id,s.name as object_without_metadata from storage.objects s
left join public.attachments a on a.storage_path=s.name
where s.bucket_id='order-attachments' and a.id is null;
