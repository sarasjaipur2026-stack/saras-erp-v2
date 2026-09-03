import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import { PGlite } from '@electric-sql/pglite'

const migrationDir = new URL('../../supabase/migrations/', import.meta.url)
const legacySchema = new URL('../../src/db/schema.sql', import.meta.url)

async function createSupabaseHarness(db) {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;

    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;

    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id),
      name text not null
    );
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$
        select case
          when strpos(name, '/') = 0 then array[]::text[]
          else string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
        end
      $$;
  `)
}

async function runMigrations(db) {
  const files = (await readdir(migrationDir))
    .filter(file => file.endsWith('.sql'))
    .sort()

  assert.ok(files.length >= 3, 'expected the versioned database migrations')
  for (const file of files) {
    const sql = await readFile(new URL(file, migrationDir), 'utf8')
    await db.exec(sql)
  }
}

test('all database migrations execute in filename order on a clean database', async () => {
  const db = new PGlite()
  try {
    await db.waitReady
    await createSupabaseHarness(db)
    await runMigrations(db)

    const { rows } = await db.query(`
      select count(*)::integer as count
      from information_schema.tables
      where table_schema = 'public'
    `)
    assert.ok(rows[0].count >= 40, 'fresh install should create the complete ERP schema')

    const unsafeFunctions = await db.query(`
      select p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef
        and not exists (
          select 1 from unnest(coalesce(p.proconfig, array[]::text[])) cfg
          where cfg like 'search_path=%'
        )
    `)
    assert.deepEqual(unsafeFunctions.rows, [], 'SECURITY DEFINER functions need a fixed search_path')

    const publicDefiners = await db.query(`
      select distinct p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where n.nspname = 'public' and p.prosecdef
        and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
    `)
    assert.deepEqual(publicDefiners.rows, [], 'SECURITY DEFINER functions must not be executable by PUBLIC')

    const anonTablePrivileges = await db.query(`
      select table_name, privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public' and grantee = 'anon'
    `)
    assert.deepEqual(anonTablePrivileges.rows, [], 'login-only ERP tables must not be granted to anon')

    const publicOrAnonFunctions = await db.query(`
      select distinct p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
      where n.nspname = 'public' and acl.privilege_type = 'EXECUTE'
        and acl.grantee in (0, (select oid from pg_roles where rolname = 'anon'))
    `)
    assert.deepEqual(publicOrAnonFunctions.rows, [], 'public functions must not be callable by PUBLIC or anon')

    const authenticatedWithoutSelect = await db.query(`
      select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
        and not has_table_privilege('authenticated', c.oid, 'SELECT')
    `)
    assert.deepEqual(authenticatedWithoutSelect.rows, [], 'authenticated users need Data API table grants')

    const unindexedForeignKeys = await db.query(`
      select c.conname
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f' and n.nspname = 'public'
        and not exists (
          select 1
          from pg_index i
          where i.indrelid = c.conrelid
            and i.indisvalid
            and i.indisready
            and i.indkey::smallint[] @> c.conkey
        )
    `)
    assert.deepEqual(unindexedForeignKeys.rows, [], 'public foreign keys need supporting indexes')
  } finally {
    await db.close()
  }
})

test('database migrations upgrade the original v2 schema without SQL errors', async () => {
  const db = new PGlite()
  try {
    await db.waitReady
    await createSupabaseHarness(db)
    await db.exec(await readFile(legacySchema, 'utf8'))
    await runMigrations(db)

    const { rows } = await db.query(`
      select data_type
      from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'status'
    `)
    assert.equal(rows[0].data_type, 'text')
  } finally {
    await db.close()
  }
})

test('compatible order status enums remain intact when status triggers exist', async () => {
  const db = new PGlite()
  try {
    await db.waitReady
    await createSupabaseHarness(db)
    await db.exec(await readFile(legacySchema, 'utf8'))
    await db.exec(`
      alter type public.order_status add value if not exists 'draft';
      alter type public.order_status add value if not exists 'booking';
      alter type public.order_status add value if not exists 'approved';
      alter type public.order_status add value if not exists 'production';
      alter type public.order_status add value if not exists 'qc';
      alter type public.order_status add value if not exists 'dispatch';
      alter type public.order_status add value if not exists 'completed';

      create function public.orders_update_search_text()
      returns trigger language plpgsql as $$
      begin
        return new;
      end
      $$;
      create trigger trg_orders_search_text
        before insert or update of order_number, customer_id, status on public.orders
        for each row execute function public.orders_update_search_text();
    `)

    await runMigrations(db)

    const { rows } = await db.query(`
      select data_type, udt_name
      from information_schema.columns
      where table_schema = 'public' and table_name = 'orders' and column_name = 'status'
    `)
    assert.deepEqual(rows[0], { data_type: 'USER-DEFINED', udt_name: 'order_status' })
  } finally {
    await db.close()
  }
})

test('core transactional, import, dashboard, and search RPCs preserve invariants', async () => {
  const db = new PGlite()
  const userId = '00000000-0000-4000-8000-000000000001'
  const customerId = '00000000-0000-4000-8000-000000000002'
  const orderId = '00000000-0000-4000-8000-000000000003'
  const paymentRequestId = '00000000-0000-4000-8000-000000000004'
  const invoiceRequestId = '00000000-0000-4000-8000-000000000005'
  try {
    await db.waitReady
    await createSupabaseHarness(db)
    await runMigrations(db)
    await db.query(
      'insert into auth.users (id, email) values ($1, $2)',
      [userId, 'admin@example.test'],
    )
    await db.query("update public.profiles set role = 'admin' where id = $1", [userId])
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userId])
    await db.query(
      'insert into public.customers (id, user_id, firm_name) values ($1, $2, $3)',
      [customerId, userId, 'Test Customer'],
    )
    await db.query(`
      insert into public.orders (
        id, user_id, customer_id, order_number, status, grand_total, balance_due
      ) values ($1, $2, $3, 'ORD-TEST-1', 'dispatch', 100, 100)
    `, [orderId, userId, customerId])

    const paymentArgs = [orderId, 40, 'cash', '2026-09-02', null, null, null, paymentRequestId]
    await db.query('select public.record_payment_transactional($1,$2,$3,$4,$5,$6,$7,$8)', paymentArgs)
    await db.query('select public.record_payment_transactional($1,$2,$3,$4,$5,$6,$7,$8)', paymentArgs)
    await assert.rejects(
      db.query(
        'select public.record_payment_transactional($1,$2,$3,$4,$5,$6,$7,$8)',
        [orderId, 41, 'cash', '2026-09-02', null, null, null, paymentRequestId],
      ),
      /different payment/,
    )

    let result = await db.query(`
      select
        (select count(*)::integer from public.payments where order_id = $1) as payment_count,
        advance_paid,
        balance_due
      from public.orders where id = $1
    `, [orderId])
    assert.deepEqual(result.rows[0], { payment_count: 1, advance_paid: '40.00', balance_due: '60.00' })

    await assert.rejects(
      db.query(
        'select public.record_payment_transactional($1,$2,$3,$4,$5,$6,$7,$8)',
        [orderId, 70, 'cash', '2026-09-02', null, null, null, '00000000-0000-4000-8000-000000000006'],
      ),
      /exceeds balance due/,
    )

    await db.query('select public.create_invoice_from_order_transactional($1,$2)', [orderId, invoiceRequestId])
    await db.query(
      'select public.create_invoice_from_order_transactional($1,$2)',
      [orderId, '00000000-0000-4000-8000-000000000007'],
    )
    result = await db.query('select count(*)::integer as count from public.invoices where order_id = $1', [orderId])
    assert.equal(result.rows[0].count, 1)

    const importRequestId = '00000000-0000-4000-8000-000000000009'
    const importRows = JSON.stringify([{ name: 'Imported Yarn', category: 'polyester', price_per_kg: 125.5 }])
    await db.query(
      "select public.import_master_rows('materials', $1::jsonb, 'materials.csv', $2)",
      [importRows, importRequestId],
    )
    await db.query(
      "select public.import_master_rows('materials', $1::jsonb, 'materials.csv', $2)",
      [importRows, importRequestId],
    )
    result = await db.query("select count(*)::integer as count from public.materials where name = 'Imported Yarn'")
    assert.equal(result.rows[0].count, 1)

    const productId = '00000000-0000-4000-8000-000000000010'
    const productionOrderId = '00000000-0000-4000-8000-000000000011'
    const productionRequestId = '00000000-0000-4000-8000-000000000012'
    await db.query(
      "insert into public.products (id, user_id, code, name) values ($1, $2, 'TEST-P', 'Test Product')",
      [productId, userId],
    )
    await db.query(`
      insert into public.orders (id, user_id, customer_id, order_number, status)
      values ($1, $2, $3, 'ORD-TEST-2', 'approved')
    `, [productionOrderId, userId, customerId])
    await db.query(`
      insert into public.order_line_items (order_id, product_id, quantity, unit)
      values ($1, $2, 5, 'pcs')
    `, [productionOrderId, productId])
    await db.query(
      'select public.create_production_plans_transactional($1, $2)',
      [productionOrderId, productionRequestId],
    )
    result = await db.query('select id from public.production_plans where create_request_id = $1', [productionRequestId])
    const planId = result.rows[0].id
    const completion = JSON.stringify({ status: 'completed', completed_qty: 5 })
    await db.query('select public.update_production_plan_transactional($1, $2::jsonb)', [planId, completion])
    await db.query('select public.update_production_plan_transactional($1, $2::jsonb)', [planId, completion])
    result = await db.query(`
      select count(*)::integer as count, sum(quantity)::text as quantity
      from public.stock_movements where source_type = 'production' and source_id = $1
    `, [planId])
    assert.deepEqual(result.rows[0], { count: 1, quantity: '5.000' })
    await assert.rejects(
      db.query(
        'select public.update_production_plan_transactional($1, $2::jsonb)',
        [planId, JSON.stringify({ completed_qty: 4 })],
      ),
      /completed production plan cannot be changed/,
    )

    const lineResult = await db.query('select id from public.order_line_items where order_id = $1', [productionOrderId])
    const lineItemId = lineResult.rows[0].id
    const deliveryRequestId = '00000000-0000-4000-8000-000000000013'
    await db.query("update public.orders set status = 'qc' where id = $1", [productionOrderId])
    const deliverySql = `
      select public.record_delivery_transactional($1,$2,$3,$4,$5,$6,$7,$8)
    `
    const deliveryArgs = [productionOrderId, lineItemId, '2026-09-02', 2, null, null, null, deliveryRequestId]
    await db.query(deliverySql, deliveryArgs)
    await db.query(deliverySql, deliveryArgs)
    result = await db.query(`
      select
        (select count(*)::integer from public.deliveries where line_item_id = $1) as delivery_count,
        sum(case when kind = 'out' then -quantity else quantity end)::text as stock_balance
      from public.stock_movements where product_id = $2 and unit = 'pcs'
    `, [lineItemId, productId])
    assert.deepEqual(result.rows[0], { delivery_count: 1, stock_balance: '3.000' })
    await assert.rejects(
      db.query(deliverySql, [
        productionOrderId, lineItemId, '2026-09-02', 4, null, null, null,
        '00000000-0000-4000-8000-000000000014',
      ]),
      /exceeds the remaining quantity/,
    )

    result = await db.query('select public.dashboard_stats() as stats')
    assert.equal(Number(result.rows[0].stats.total_orders), 2)
    assert.equal(Number(result.rows[0].stats.total_customers), 1)
    result = await db.query("select entity_type, primary_label from public.search_entities('Test', null, 5)")
    assert.ok(result.rows.some(row => row.entity_type === 'customer' && row.primary_label === 'Test Customer'))
    assert.ok(result.rows.some(row => row.entity_type === 'product' && row.primary_label === 'Test Product'))

    await db.query("update public.profiles set role = 'viewer', permissions = '{}'::jsonb where id = $1", [userId])
    result = await db.query('select public.dashboard_stats() as stats')
    assert.equal(Number(result.rows[0].stats.total_orders), 0)
    result = await db.query("select count(*)::integer as count from public.search_entities('Test', null, 5)")
    assert.equal(result.rows[0].count, 0)
    await assert.rejects(
      db.query(
        'select public.record_payment_transactional($1,$2,$3,$4,$5,$6,$7,$8)',
        [orderId, 1, 'cash', '2026-09-02', null, null, null, '00000000-0000-4000-8000-000000000008'],
      ),
      /Permission denied/,
    )
  } finally {
    await db.close()
  }
})
