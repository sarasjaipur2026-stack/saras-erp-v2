import assert from 'node:assert/strict'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'
import { createSupabaseHarness,runMigrations } from '../helpers/supabase.js'

const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`

test('authenticated APIs preserve permission, ledger and workflow integrity',async t=>{
 const db=new PGlite()
 const admin=id(1),staff=id(2),viewer=id(3),customer=id(4),product=id(5),material=id(6)
 const asUser=async(user,fn)=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user])
  await db.exec('set role authenticated')
  try{return await fn()}finally{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin])}
 }
 const order=async(n,status='draft',total=100)=>{
  await db.query("insert into public.orders(id,user_id,customer_id,order_number,status,grand_total,balance_due) values($1,$2,$3,$4,$5,$6,$6)",[id(n),admin,customer,'INTEGRITY-'+n,status,total])
  return id(n)
 }
 const line=async(n,o,entity=product,unit='pcs',qty=5,kind='product')=>{
  await db.query(`insert into public.order_line_items(id,order_id,${kind}_id,quantity,unit,rate_per_unit) values($1,$2,$3,$4,$5,20)`,[id(n),o,entity,qty,unit])
 }
 const dispatch=(o,r)=>db.query('select public.create_dispatch_transactional($1,null,null,null,$2) as result',[o,r])
 try{
  await db.waitReady;await createSupabaseHarness(db);await runMigrations(db)
  for(const [u,name] of [[admin,'admin'],[staff,'staff'],[viewer,'viewer']])await db.query('insert into auth.users(id,email) values($1,$2)',[u,name+'@test.invalid'])
  await db.query("update public.profiles set role='admin' where id=$1",[admin])
  await db.query("update public.profiles set role='staff',permissions=$2 where id=$1",[staff,JSON.stringify({orders:{view:true,edit:true},payments:{record:true},production:{view:true,manage:true},purchase:{view:true,create:true}})])
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[admin])
  await db.query("insert into public.customers(id,user_id,firm_name) values($1,$2,'Integrity customer')",[customer,admin])
  await db.query("insert into public.products(id,user_id,code,name) values($1,$2,'INT','Integrity product')",[product,admin])
  await db.query("insert into public.materials(id,user_id,name,category) values($1,$2,'Integrity material','polyester')",[material,admin])
  await t.test('staff cannot approve or directly rewrite order/payment/production ledgers',async()=>{
   await order(10,'booking');await line(11,id(10))
   await asUser(staff,async()=>{
    await assert.rejects(db.query("update public.orders set status='approved',grand_total=1 where id=$1",[id(10)]),/permission denied/i)
    await assert.rejects(db.query("select public.transition_order_transactional($1,'approved')",[id(10)]),/orders.approve/)
    await assert.rejects(db.query("insert into public.payments(order_id,amount,payment_mode) values($1,1000,'cash')",[id(10)]),/permission denied/i)
    await assert.rejects(db.exec("update public.production_plans set status='completed',completed_qty=5"),/permission denied/i)
   })
   await asUser(admin,()=>db.query("select public.transition_order_transactional($1,'approved')",[id(10)]))
   assert.equal((await db.query('select status,approved_by from public.orders where id=$1',[id(10)])).rows[0].approved_by,admin)
  })
  await t.test('payment RPC remains usable and rejects overpayment',async()=>{
   await asUser(staff,async()=>{
    const args=[id(10),40,'cash','2026-10-05',null,null,null,id(12)]
    await db.query('select public.record_payment_transactional($1,$2,$3,$4,$5,$6,$7,$8)',args)
    await db.query('select public.record_payment_transactional($1,$2,$3,$4,$5,$6,$7,$8)',args)
    await assert.rejects(db.query('select public.record_payment_transactional($1,$2,$3,$4,$5,$6,$7,$8)',[id(10),70,'cash','2026-10-05',null,null,null,id(13)]),/exceeds balance/)
   })
   const stored=(await db.query('select advance_paid,balance_due from public.orders where id=$1',[id(10)])).rows[0]
   assert.deepEqual(stored,{advance_paid:'40.00',balance_due:'60.00'})
  })
  await t.test('wrong-unit stock cannot dispatch and transaction rolls back delivery',async()=>{
   await order(20,'qc');await line(21,id(20))
   await db.query("insert into public.stock_movements(kind,product_id,quantity,unit) values('in',$1,100,'kg')",[product])
   await asUser(admin,()=>assert.rejects(dispatch(id(20),id(22)),/Insufficient stock/))
   assert.equal((await db.query('select count(*)::int as n from public.deliveries where order_id=$1',[id(20)])).rows[0].n,0)
  })
  await t.test('dispatch consumes exact unit across warehouses, retries do not duplicate',async()=>{
   await db.query('update public.order_line_items set material_id=$1 where id=$2',[material,id(21)])
   await db.query("insert into public.warehouses(id,user_id,name) values($1,$2,'Main')",[id(23),admin])
   await db.query("insert into public.stock_movements(kind,product_id,warehouse_id,quantity,unit) values('in',$1,$2,3,'pcs'),('in',$1,null,2,'pcs')",[product,id(23)])
   await asUser(admin,()=>dispatch(id(20),id(22)));await asUser(admin,()=>dispatch(id(20),id(22)))
   const rows=(await db.query("select unit,sum(case when kind='out' then -quantity else quantity end)::numeric as balance from public.stock_movements where product_id=$1 group by unit order by unit",[product])).rows
   assert.deepEqual(rows,[{unit:'kg',balance:'100.000'},{unit:'pcs',balance:'0.000'}])
   assert.equal((await db.query('select count(*)::int as n from public.deliveries where order_id=$1',[id(20)])).rows[0].n,1)
  })
  await t.test('material deliveries check and deduct material stock',async()=>{
   await order(30,'qc');await line(31,id(30),material,'kg',5,'material')
   await asUser(admin,()=>assert.rejects(dispatch(id(30),id(32)),/Insufficient stock/))
   await db.query("insert into public.stock_movements(kind,material_id,quantity,unit) values('in',$1,5,'kg')",[material])
   await asUser(admin,()=>db.query('select public.record_delivery_transactional($1,$2,current_date,5,null,null,null,$3)',[id(30),id(31),id(32)]))
   assert.equal(Number((await db.query("select sum(case when kind='out' then -quantity else quantity end) as n from public.stock_movements where material_id=$1",[material])).rows[0].n),0)
  })
  await t.test('completion validates output, persists notes and posts inventory exactly once',async()=>{
   await order(40,'booking');await line(41,id(40))
   const plans=(await asUser(admin,()=>db.query('select public.create_production_plans_transactional($1,$2) as result',[id(40),id(42)]))).rows[0].result
   const plan=plans[0].id
   const again=(await asUser(admin,()=>db.query('select public.create_production_plans_transactional($1,$2) as result',[id(40),id(43)]))).rows[0].result
   assert.equal(again[0].id,plan)
   await asUser(staff,async()=>{
    await assert.rejects(db.query('select public.update_production_plan_transactional($1,$2)',[plan,{status:'completed'}]),/positive output/)
    await db.query('select public.update_production_plan_transactional($1,$2)',[plan,{notes:'Saved shop-floor note'}])
    await assert.rejects(db.query('select public.update_production_plan_transactional($1,$2)',[plan,{unknown:'ignored'}]),/Unsupported/)
    await db.query('select public.update_production_plan_transactional($1,$2)',[plan,{status:'completed',completed_qty:5}])
    await db.query('select public.update_production_plan_transactional($1,$2)',[plan,{status:'completed',completed_qty:5}])
    await assert.rejects(db.query('select public.update_production_plan_transactional($1,$2)',[plan,{notes:'rewrite'}]),/cannot be changed/)
   })
   assert.equal((await db.query('select notes from public.production_plans where id=$1',[plan])).rows[0].notes,'Saved shop-floor note')
   assert.equal((await db.query("select count(*)::int as n from public.stock_movements where source_type='production' and source_id=$1",[plan])).rows[0].n,1)
  })
  await t.test('draft/cancelled invoice rejected, active invoice accepted',async()=>{
   await order(50);await order(51,'cancelled')
   await asUser(admin,async()=>{
    for(const n of [50,51])await assert.rejects(db.query('select public.create_invoice_from_order_transactional($1,$2)',[id(n),id(n+100)]),/cannot be invoiced/)
    await db.query('select public.create_invoice_from_order_transactional($1,$2)',[id(10),id(52)])
   })
  })
  await t.test('jobwork outward without stock is rejected atomically',async()=>{
   await db.query("insert into public.yarn_types(id,user_id,name) values($1,$2,'Jobwork yarn')",[id(60),admin])
   await db.query("insert into public.suppliers(id,user_id,name) values($1,$2,'Jobwork supplier')",[id(61),admin])
   const payload={direction:'outward',supplier_id:id(61),items:[{kind:'material_sent',yarn_type_id:id(60),quantity:10,unit:'kg'}]}
   await asUser(admin,()=>assert.rejects(db.query('select public.create_jobwork_transactional($1,$2)',[payload,id(62)]),/Insufficient stock/))
   assert.equal((await db.query('select count(*)::int as n from public.jobwork_jobs')).rows[0].n,0)
  })
  await t.test('adjustments validate warehouse stock and bind retries to payload',async()=>{
   const payload={kind:'in',yarn_type_id:id(60),quantity:10,unit:'kg',notes:'Opening balance'}
   await asUser(admin,async()=>{
    await db.query('select public.adjust_stock_transactional($1,$2)',[payload,id(63)])
    await db.query('select public.adjust_stock_transactional($1,$2)',[payload,id(63)])
    await assert.rejects(db.query('select public.adjust_stock_transactional($1,$2)',[{...payload,quantity:11},id(63)]),/different adjustment/)
    await assert.rejects(db.query('select public.adjust_stock_transactional($1,$2)',[{...payload,kind:'out',warehouse_id:id(23)},id(64)]),/Insufficient stock/)
   })
  })
  await t.test('financial notification requires payment view and broadcast read status is per user',async()=>{
   await db.query("insert into public.notifications(id,user_id,type,title,message,entity_type,entity_id) values($1,$2,'payment_received','Payment','Customer paid 40','order',$3)",[id(70),admin,id(10)])
   for(const user of [viewer,staff])await asUser(user,async()=>assert.equal((await db.query('select id from public.notifications where id=$1',[id(70)])).rows.length,0))
   await db.query("insert into public.notifications(id,user_id,type,title,entity_type,entity_id) values($1,$2,'status_changed','Approved','order',$3)",[id(71),admin,id(10)])
   await asUser(staff,()=>db.query('select public.mark_notifications_read($1)',[id(71)]))
   const staffRows=(await asUser(staff,()=>db.query('select public.list_user_notifications(false,200) as rows'))).rows[0].rows
   assert.ok(staffRows.find(r=>r.id===id(71)).read_at)
   const adminRows=(await asUser(admin,()=>db.query('select public.list_user_notifications(false,200) as rows'))).rows[0].rows
   assert.equal(adminRows.find(r=>r.id===id(71)).read_at,null)
  })
  await t.test('attachment policies follow entity permissions and allow own orphan cleanup',async()=>{
   await db.query("insert into public.purchase_orders(id,po_number,supplier_id,po_date,status) values($1,'PO-ATT',$2,current_date,'draft')",[id(80),id(61)])
   await asUser(staff,async()=>{
    assert.equal((await db.query("select public.can_access_entity('purchase_order',$1,'edit') as allowed",[id(80)])).rows[0].allowed,true)
    const path=`purchase_order/${id(80)}/${staff}/file.pdf`
    assert.equal((await db.query("select public.can_access_attachment_path($1,'delete') as allowed",[path])).rows[0].allowed,true)
    await db.query("insert into storage.objects(bucket_id,name) values('order-attachments',$1)",[path])
    await db.query('delete from storage.objects where name=$1',[path])
    assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,0,'edit-only upload cleanup succeeds')
    await db.query("insert into storage.objects(bucket_id,name) values('order-attachments',$1)",[path])
    await db.query("insert into public.attachments(entity_type,entity_id,file_name,file_type,file_size,storage_path,uploaded_by) values('purchase_order',$1,'file.pdf','application/pdf',100,$2,$3)",[id(80),path,staff])
    await assert.rejects(db.query("insert into public.attachments(entity_type,entity_id,file_name,file_type,file_size,storage_path,uploaded_by) values('invoice',$1,'file.pdf','application/pdf',100,$2,$3)",[id(80),`invoice/${id(80)}/${staff}/other.pdf`,staff]),/row-level security/)
   })
   await asUser(viewer,async()=>assert.equal((await db.query('select count(*)::int as n from public.attachments')).rows[0].n,0))
   await asUser(viewer,async()=>assert.equal((await db.query("select count(*)::int as n from storage.objects where bucket_id='order-attachments'")).rows[0].n,0))
  })
  await t.test('last-admin guard covers direct update, RPC and deletion',async()=>{
   await asUser(admin,()=>assert.rejects(db.query("update public.profiles set role='viewer' where id=$1",[admin]),/permission denied/i))
   await asUser(admin,()=>assert.rejects(db.query("select public.admin_update_user_permissions($1,'viewer','{}')",[admin]),/last administrator/))
   await assert.rejects(db.query('delete from public.profiles where id=$1',[admin]),/last administrator/)
  })
  await t.test('sales uses invoices, receivables exclude abandoned orders, boundaries include final day',async()=>{
   await order(90,'draft',9999);await order(91,'cancelled',9999)
   const sales=(await asUser(admin,()=>db.query('select public.report_sales_register(null,null) as rows'))).rows[0].rows
   assert.equal(sales.length,1);assert.equal(sales[0].order_number.startsWith('INV'),true)
   const invoice=sales[0]
   await db.query("update public.invoices set invoice_date='2026-10-05' where id=$1",[invoice.id])
   const range=(await asUser(admin,()=>db.query("select public.report_sales_register('2026-10-05T00:00:00+05:30','2026-10-06T00:00:00+05:30') as rows"))).rows[0].rows
   assert.equal(range.length,1)
   const outstanding=(await asUser(admin,()=>db.query('select public.report_customer_outstanding() as rows'))).rows[0].rows
   assert.equal(Number(outstanding[0].total_billed),400)
  })
  await t.test('completion requires deliveries and settled balance; sample conversion is idempotent',async()=>{
   await asUser(admin,()=>assert.rejects(db.query("select public.transition_order_transactional($1,'completed')",[id(20)]),/settle the balance/))
   await db.query('update public.orders set balance_due=0 where id=$1',[id(20)])
   await asUser(admin,()=>db.query("select public.transition_order_transactional($1,'completed')",[id(20)]))
   await db.query("update public.orders set nature='sample' where id=$1",[id(50)])
   const sample=(await asUser(admin,()=>db.query('select public.create_full_order_from_sample($1) as result',[id(50)]))).rows[0].result
   const retry=(await asUser(admin,()=>db.query('select public.create_full_order_from_sample($1) as result',[id(50)]))).rows[0].result
   assert.equal(sample.id,retry.id);assert.equal(sample.nature,'production');assert.equal(sample.status,'draft')
  })
  await t.test('webhook claims are permission checked, idempotent and private',async()=>{
   await asUser(staff,()=>assert.rejects(db.query('select public.claim_notification_webhook($1)',[id(70)]),/permission denied/i))
   await asUser(admin,async()=>{
    assert.equal((await db.query('select public.claim_notification_webhook($1) as claimed',[id(70)])).rows[0].claimed,true)
    assert.equal((await db.query('select public.claim_notification_webhook($1) as claimed',[id(70)])).rows[0].claimed,false)
    await assert.rejects(db.query('select public.finish_notification_webhook($1,true)',[id(70)]),/permission denied/i)
   })
   await db.exec('set role anon')
   assert.equal((await db.query('select public.erp_schema_version() as version')).rows[0].version,'20261005095632')
   await assert.rejects(db.query("select public.transition_order_transactional($1,'approved')",[id(50)]),/permission denied/i)
   await db.exec('reset role')
  })
 }finally{await db.close()}
})
