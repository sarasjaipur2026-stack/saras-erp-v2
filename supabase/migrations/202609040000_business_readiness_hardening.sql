begin;

-- Cover every remaining foreign-key lookup used by cascades, joins, and RLS.
do $$
begin
  if to_regclass('public.pos_sessions') is not null and not exists (
    select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attname = 'terminal_id'
    where i.indrelid = to_regclass('public.pos_sessions') and i.indisvalid and i.indkey[0] = a.attnum
  ) then
    execute 'create index if not exists idx_pos_sessions_terminal_id on public.pos_sessions (terminal_id)';
  end if;
  if to_regclass('public.production_plans') is not null and not exists (
    select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attname = 'line_item_id'
    where i.indrelid = to_regclass('public.production_plans') and i.indisvalid and i.indkey[0] = a.attnum
  ) then
    execute 'create index if not exists idx_production_plans_line_item_id on public.production_plans (line_item_id)';
  end if;
  if to_regclass('public.yarn_supplier_rates') is not null and not exists (
    select 1 from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attname = 'supplier_id'
    where i.indrelid = to_regclass('public.yarn_supplier_rates') and i.indisvalid and i.indkey[0] = a.attnum
  ) then
    execute 'create index if not exists idx_yarn_supplier_rates_supplier_id on public.yarn_supplier_rates (supplier_id)';
  end if;
end $$;

-- This was introduced as NOT VALID for legacy compatibility. Existing rows now
-- comply, so enforce it for the full table as well as all future writes.
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.order_line_items'::regclass
      and conname = 'order_line_items_exactly_one_qty'
  ) then
    alter table public.order_line_items
      validate constraint order_line_items_exactly_one_qty;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'order_line_items' and column_name = 'total_qty'
  ) then
    execute 'alter table public.order_line_items add constraint order_line_items_single_quantity check (
      (case when coalesce(meters, 0) > 0 then 1 else 0 end)
      + (case when coalesce(weight_kg, 0) > 0 then 1 else 0 end)
      + (case when coalesce(total_qty, 0) > 0 then 1 else 0 end)
      + (case when coalesce(quantity, 0) > 0 then 1 else 0 end) <= 1)';
  else
    execute 'alter table public.order_line_items add constraint order_line_items_single_quantity check (
      (case when coalesce(meters, 0) > 0 then 1 else 0 end)
      + (case when coalesce(weight_kg, 0) > 0 then 1 else 0 end)
      + (case when coalesce(quantity, 0) > 0 then 1 else 0 end) <= 1)';
  end if;
end $$;

-- Business quantities must never silently become zero/negative when a caller
-- bypasses the UI and writes through the API directly.
alter table public.deliveries
  add constraint deliveries_positive_quantity
  check (quantity_delivered > 0) not valid;
alter table public.deliveries validate constraint deliveries_positive_quantity;

alter table public.stock_movements
  add constraint stock_movements_positive_quantity
  check (quantity > 0) not valid;
alter table public.stock_movements validate constraint stock_movements_positive_quantity;

alter table public.production_plans
  add constraint production_plans_valid_quantities
  check (planned_qty > 0 and completed_qty >= 0 and completed_qty <= planned_qty) not valid;
alter table public.production_plans validate constraint production_plans_valid_quantities;

alter table public.purchase_order_items
  add constraint purchase_order_items_valid_amounts
  check (
    quantity > 0
    and rate_per_unit >= 0
    and amount >= 0
    and quantity_received >= 0
    and quantity_received <= quantity
  ) not valid;
alter table public.purchase_order_items validate constraint purchase_order_items_valid_amounts;

alter table public.goods_receipt_items
  add constraint goods_receipt_items_positive_quantity
  check (quantity_received > 0) not valid;
alter table public.goods_receipt_items validate constraint goods_receipt_items_positive_quantity;

alter table public.jobwork_items
  add constraint jobwork_items_positive_quantity
  check (quantity > 0) not valid;
alter table public.jobwork_items validate constraint jobwork_items_positive_quantity;

alter table public.jobwork_jobs
  add constraint jobwork_jobs_nonnegative_rate
  check (rate_per_unit is null or rate_per_unit >= 0) not valid;
alter table public.jobwork_jobs validate constraint jobwork_jobs_nonnegative_rate;

-- Trigger functions and the assertion helper are internal implementation
-- details. PostgREST users never need to invoke them directly.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'audit_trigger', 'handle_new_user', 'log_invoice_to_ledger',
      'log_order_status_change', 'log_payment_to_ledger', 'notify_order_approval',
      'protect_profile_privileged_fields', 'assert_permission'
    )
  loop
    execute format('revoke execute on function %s from authenticated', fn.signature);
  end loop;
end $$;

-- Older helper functions are used by RLS, so keep them executable by signed-in
-- users but pin their lookup path like the newer helpers.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('current_user_role', 'can_manage', 'can_operate')
  loop
    execute format('alter function %s set search_path = pg_catalog, public', fn.signature);
  end loop;
end $$;

-- These owner-only policies were safe because anon has no table grants, but
-- explicitly targeting authenticated users keeps the policy boundary clear.
do $$
declare item record;
begin
  for item in
    select * from (values
      ('blocked_phones', 'blocked_phones_owner'),
      ('invoice_lines', 'invoice_lines_owner_all'),
      ('pos_print_jobs', 'pos_print_jobs_owner_all'),
      ('pos_sessions', 'pos_sessions_owner_all'),
      ('pos_tenders', 'pos_tenders_owner_all'),
      ('pos_terminals', 'pos_terminals_owner_all'),
      ('product_images', 'product_images_owner_all')
    ) as policies(table_name, policy_name)
  loop
    if exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = item.table_name and policyname = item.policy_name
    ) then
      execute format('alter policy %I on public.%I to authenticated', item.policy_name, item.table_name);
    end if;
  end loop;
end $$;

commit;
