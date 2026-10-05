import assert from 'node:assert/strict'
import test from 'node:test'
import { EventEmitter } from 'node:events'
import { csvCell,toCsv } from '../../src/lib/csv.js'
import { businessDate,invoiceDateRange,dateDaysAgo } from '../../src/lib/reportDates.js'
import { aggregateCustomerOutstanding } from '../../src/lib/reportFallback.js'
import { ensureSchemaCompatibility } from '../../src/lib/schemaCompatibility.js'
import { checkSchema,EXPECTED_SCHEMA } from '../../scripts/check-schema.mjs'
import { createWebhookHandler,isPublicAddress,postWebhook } from '../../server/webhook.mjs'

test('CSV protects leading formulas/control characters while preserving numeric values and quoting',()=>{
 for(const text of ['=1+1',' +SUM(A1)','\t@SUM(A1)','\r-HYPERLINK("x")','\u0000=1','-3'])assert.ok(csvCell(text).includes("'"))
 assert.equal(csvCell(-3),'-3');assert.equal(csvCell('A,"B"'),'"A,""B"""')
 assert.equal(toCsv([{name:'=1+1'}],[{label:'Name',value:r=>r.name}]),"Name\n'=1+1")
})

test('Indian business date and exclusive ranges cover midnight/month/year boundaries',()=>{
 assert.equal(businessDate(new Date('2026-03-31T19:00:00Z')),'2026-04-01')
 assert.deepEqual(invoiceDateRange('2026-12-31','2026-12-31'),{from:'2026-12-31T00:00:00+05:30',to:'2027-01-01T00:00:00+05:30'})
 assert.equal(invoiceDateRange('2024-02-01','2024-02-29').to,'2024-03-01T00:00:00+05:30')
 assert.equal(dateDaysAgo('2026-10-05',29),'2026-09-06')
})

test('outstanding fallback excludes draft and cancelled records',()=>{
 const rows=['draft','cancelled','approved'].map(status=>({customer_id:'c',status,grand_total:100,balance_due:100}))
 assert.equal(aggregateCustomerOutstanding(rows)[0].total_billed,100)
})

test('deployment schema gate rejects missing config, failed RPC and wrong version',async()=>{
 await assert.rejects(checkSchema({},()=>{}),/missing/)
 const env={VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_ANON_KEY:'anon-test'}
 await assert.rejects(checkSchema(env,async()=>Response.json('older')),/build blocked/)
 await assert.rejects(checkSchema(env,async()=>new Response('',{status:503})),/build blocked/)
 await checkSchema(env,async()=>Response.json(EXPECTED_SCHEMA))
})

test('client schema gate retries failure and coalesces successful checks',async()=>{
 await assert.rejects(ensureSchemaCompatibility({rpc:async()=>({data:'old'})}),/Database update required/)
 let calls=0
 const client={rpc:async()=>{calls++;return {data:EXPECTED_SCHEMA,error:null}}}
 await Promise.all([ensureSchemaCompatibility(client),ensureSchemaCompatibility(client)])
 assert.equal(calls,1)
})

test('webhook destinations reject local/private/reserved IPs, credentials, redirects and unsafe schemes',async()=>{
 for(const ip of ['127.0.0.1','10.2.3.4','172.31.1.1','192.168.1.1','169.254.169.254','100.64.1.1','::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])assert.equal(isPublicAddress(ip),false,ip)
 assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2001:4860:4860::8888'),true)
 for(const url of ['http://example.com','https://user:secret@example.com','https://example.com:444','https://127.0.0.1','https://[::1]'])await assert.rejects(postWebhook(url,{},async()=>[{address:'127.0.0.1',family:4}]))
 await assert.rejects(postWebhook('https://example.com',{},async()=>[{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]),/not public/)
 const send=(url,options,callback)=>{
  options.lookup(url.hostname,{},(_error,address)=>assert.equal(address,'8.8.8.8'))
  const req=new EventEmitter();req.setTimeout=()=>{};req.end=()=>callback({statusCode:302,resume(){}})
  return req
 }
 await assert.rejects(postWebhook('https://example.com',{},async()=>[{address:'8.8.8.8',family:4}],send),/rejected delivery/)
})

test('webhook validates JWT, notification ownership, config and delivery claims',async()=>{
 const notificationId='00000000-0000-4000-8000-000000000001'
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon-test',SUPABASE_SERVICE_ROLE_KEY:'server-secret-test'}
 let owner='actor',claim=true,forwarded=0,finished=[]
 const request=async(url,options)=>{
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'actor'})
  if(url.includes('/notifications?'))return Response.json([{id:notificationId,user_id:owner,title:'Paid',message:'Payment 40',type:'payment_received'}])
  if(url.includes('/app_settings?')){
   assert.equal(options.headers.apikey,'server-secret-test')
   return Response.json([{key:'notifications.whatsapp_enabled',value:{enabled:true}},{key:'notifications.whatsapp_webhook_url',value:{url:'https://webhook.example.com'}}])
  }
  if(url.includes('claim_notification_webhook'))return Response.json(claim)
  if(url.includes('finish_notification_webhook')){finished.push(JSON.parse(options.body));return Response.json(null)}
  throw new Error('Unexpected request')
 }
 const handler=createWebhookHandler({env,request,forward:async(_url,payload)=>{forwarded++;assert.equal(payload.notification_id,notificationId);assert.equal(payload.message,'Payment 40')}})
 const incoming=()=>new Request('https://erp.example.com/api/notification-webhook',{method:'POST',headers:{Authorization:'Bearer jwt-test'},body:JSON.stringify({notificationId,title:'Forged'})})
 assert.equal((await handler(new Request('https://erp.example.com',{method:'POST'}))).status,401)
 owner='someone-else';assert.equal((await handler(incoming())).status,403);assert.equal(forwarded,0)
 owner='actor';claim=false;assert.equal((await handler(incoming())).status,200);assert.equal(forwarded,0)
 claim=true;assert.equal((await handler(incoming())).status,200);assert.equal(forwarded,1);assert.equal(finished[0].p_success,true)
 const failed=createWebhookHandler({env,request,forward:async()=>{throw new Error('No delivery')}})
 assert.equal((await failed(incoming())).status,502);assert.equal(finished[1].p_success,false)
 assert.equal((await createWebhookHandler({env:{}})(incoming())).status,503)
})
