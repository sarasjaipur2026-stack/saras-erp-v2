-- SARAS ERP security baseline. Apply before deploying the matching frontend.
-- This migration is intentionally idempotent so it can be rehearsed safely.

begin;

alter table if exists public.profiles add column if not exists full_name text;
alter table if exists public.profiles add column if not exists role text not null default 'viewer';
alter table if exists public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table if exists public.profiles add column if not exists company_name text;
alter table if exists public.profiles add column if not exists gstin text;
alter table if exists public.profiles add column if not exists pan text;
alter table if exists public.profiles add column if not exists address text;
alter table if exists public.profiles add column if not exists city text;
alter table if exists public.profiles add column if not exists state text;
alter table if exists public.profiles add column if not exists state_code text;
alter table if exists public.profiles add column if not exists phone text;
alter table if exists public.profiles add column if not exists logo_url text;
alter table if exists public.profiles add column if not exists default_order_type text;
alter table if exists public.profiles add column if not exists default_payment_terms text;
alter table if exists public.profiles add column if not exists order_number_format text;
alter table if exists public.profiles add column if not exists price_summary_fields jsonb;
alter table if exists public.profiles add column if not exists print_letterhead boolean not null default true;
alter table if exists public.profiles add column if not exists print_terms_conditions text;
alter table if exists public.profiles add column if not exists gst_company_state_code text;
alter table if exists public.profiles add column if not exists default_cgst_rate numeric(5,2);
alter table if exists public.profiles add column if not exists default_sgst_rate numeric(5,2);
alter table if exists public.profiles add column if not exists default_igst_rate numeric(5,2);
alter table if exists public.profiles add column if not exists auto_split_gst boolean not null default true;
update public.profiles set role = 'viewer' where role is null;
update public.profiles set permissions = '{}'::jsonb where permissions is null;
alter table public.profiles alter column role set default 'viewer';
alter table public.profiles alter column role set not null;
alter table public.profiles alter column permissions set default '{}'::jsonb;
alter table public.profiles alter column permissions set not null;

do $$
begin
  if to_regclass('public.profiles') is not null
     and not exists (select 1 from pg_constraint where conname = 'profiles_role_check') then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('admin', 'staff', 'viewer'));
  end if;
end $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select p.role = 'admin'
    from public.profiles p
    where p.id = auth.uid()
  ), false)
$$;

create or replace function public.has_permission(p_module text, p_action text default 'view')
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select coalesce((
    select case
      when p.role = 'admin' then true
      when p.role = 'viewer' then
        p_action = 'view' and coalesce((p.permissions -> p_module ->> 'view')::boolean, false)
      when p.role = 'staff' then
        coalesce((p.permissions -> p_module ->> p_action)::boolean, false)
      else false
    end
    from public.profiles p
    where p.id = auth.uid()
  ), false)
$$;

revoke all on function public.is_admin() from public;
revoke all on function public.has_permission(text, text) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.has_permission(text, text) to authenticated;

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if auth.uid() is null then
    if session_user not in ('postgres', 'supabase_admin') then
      raise exception 'Authentication required' using errcode = '42501';
    end if;
    new.updated_at := now();
    return new;
  end if;
  if not public.is_admin()
     and (new.role is distinct from old.role or new.permissions is distinct from old.permissions) then
    raise exception 'Only an administrator can change roles or permissions' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end
$$;
revoke all on function public.protect_profile_privileged_fields() from public;

drop trigger if exists protect_profile_privileged_fields_trigger on public.profiles;
create trigger protect_profile_privileged_fields_trigger
before update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

alter table public.profiles enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end $$;
create policy profiles_select_secure on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_secure on public.profiles
  for update to authenticated using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- Replace permissive/owner-fragmented policies with a single role/permission model.
do $$
declare
  cfg record;
  pol record;
begin
  for cfg in
    select * from (values
      ('customers', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('products', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('materials', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('machines', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('colors', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('suppliers', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('brokers', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('charge_types', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('order_types', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('payment_terms', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('warehouses', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('banks', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('staff', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('currencies', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('hsn_codes', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('units', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('machine_types', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('product_types', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('yarn_types', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('yarn_supplier_rates', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('process_types', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('operators', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('packaging_types', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('transports', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('quality_parameters', 'quality', 'view', 'inspect', 'inspect', 'inspect'),
      ('chaal_types', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('custom_field_definitions', 'masters', 'view', 'manage', 'manage', 'manage'),
      ('calculator_profiles', 'calculator', 'view', 'view', 'view', 'view'),
      ('orders', 'orders', 'view', 'create', 'edit', 'delete'),
      ('order_line_items', 'orders', 'view', 'create', 'edit', 'delete'),
      ('order_charges', 'orders', 'view', 'create', 'edit', 'delete'),
      ('enquiries', 'enquiries', 'view', 'create', 'edit', 'edit'),
      ('enquiry_line_items', 'enquiries', 'view', 'create', 'edit', 'edit'),
      ('enquiry_activities', 'enquiries', 'view', 'edit', 'edit', 'edit'),
      ('invoices', 'invoices', 'view', 'create', 'create', 'create'),
      ('payments', 'payments', 'view', 'record', 'record', 'record'),
      ('purchase_orders', 'purchase', 'view', 'create', 'create', 'create'),
      ('purchase_order_items', 'purchase', 'view', 'create', 'receive', 'create'),
      ('goods_receipts', 'purchase', 'view', 'receive', 'receive', 'receive'),
      ('goods_receipt_items', 'purchase', 'view', 'receive', 'receive', 'receive'),
      ('stock', 'stock', 'view', 'adjust', 'adjust', 'adjust'),
      ('stock_movements', 'stock', 'view', 'adjust', 'adjust', 'adjust'),
      ('deliveries', 'dispatch', 'view', 'create', 'create', 'create'),
      ('jobwork_tracking', 'jobwork', 'view', 'manage', 'manage', 'manage'),
      ('production_plans', 'production', 'view', 'manage', 'manage', 'manage'),
      ('jobwork_jobs', 'jobwork', 'view', 'manage', 'manage', 'manage'),
      ('jobwork_items', 'jobwork', 'view', 'manage', 'manage', 'manage'),
      ('quality_inspections', 'quality', 'view', 'inspect', 'inspect', 'inspect'),
      ('quality_inspection_results', 'quality', 'view', 'inspect', 'inspect', 'inspect'),
      ('attachments', 'orders', 'view', 'edit', 'edit', 'delete'),
      ('activity_log', 'orders', 'view', 'edit', 'edit', 'delete')
    ) as v(table_name, module_name, select_action, insert_action, update_action, delete_action)
  loop
    if to_regclass('public.' || cfg.table_name) is null then continue; end if;
    execute format('alter table public.%I enable row level security', cfg.table_name);
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = cfg.table_name
    loop
      execute format('drop policy if exists %I on public.%I', pol.policyname, cfg.table_name);
    end loop;
    execute format('create policy saras_select on public.%I for select to authenticated using (public.has_permission(%L, %L))', cfg.table_name, cfg.module_name, cfg.select_action);
    execute format('create policy saras_insert on public.%I for insert to authenticated with check (public.has_permission(%L, %L))', cfg.table_name, cfg.module_name, cfg.insert_action);
    execute format('create policy saras_update on public.%I for update to authenticated using (public.has_permission(%L, %L)) with check (public.has_permission(%L, %L))', cfg.table_name, cfg.module_name, cfg.update_action, cfg.module_name, cfg.update_action);
    execute format('create policy saras_delete on public.%I for delete to authenticated using (public.has_permission(%L, %L))', cfg.table_name, cfg.module_name, cfg.delete_action);
  end loop;
end $$;

-- Per-user operational tables receive narrower policies.
do $$
declare pol record;
begin
  if to_regclass('public.notifications') is not null then
    alter table public.notifications enable row level security;
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'notifications'
    loop execute format('drop policy if exists %I on public.notifications', pol.policyname); end loop;
    create policy notifications_select_secure on public.notifications for select to authenticated
      using (user_id = auth.uid() or staff_id = auth.uid() or staff_id is null);
    create policy notifications_insert_secure on public.notifications for insert to authenticated
      with check (user_id = auth.uid());
    create policy notifications_update_secure on public.notifications for update to authenticated
      using (user_id = auth.uid() or staff_id = auth.uid())
      with check (user_id = auth.uid() or staff_id = auth.uid());
  end if;
  if to_regclass('public.import_log') is not null then
    alter table public.import_log enable row level security;
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'import_log'
    loop execute format('drop policy if exists %I on public.import_log', pol.policyname); end loop;
    create policy import_log_select_secure on public.import_log for select to authenticated
      using (user_id = auth.uid() or public.is_admin());
  end if;
  if to_regclass('public.audit_log') is not null then
    alter table public.audit_log enable row level security;
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'audit_log'
    loop execute format('drop policy if exists %I on public.audit_log', pol.policyname); end loop;
    create policy audit_log_select_secure on public.audit_log for select to authenticated
      using (public.is_admin());
    revoke insert, update, delete on public.audit_log from authenticated;
  end if;
  if to_regclass('public.app_settings') is not null then
    alter table public.app_settings enable row level security;
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'app_settings'
    loop execute format('drop policy if exists %I on public.app_settings', pol.policyname); end loop;
    create policy app_settings_select_secure on public.app_settings for select to authenticated
      using (public.has_permission('settings', 'view'));
  end if;
end $$;

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
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

-- Keep one audit trigger per mutable business table. Legacy installations had
-- differently named audit triggers, so remove only triggers that already call
-- audit_trigger before installing the canonical trigger.
do $$
declare
  table_name text;
  trigger_name text;
begin
  foreach table_name in array array[
    'customers', 'products', 'materials', 'machines', 'colors', 'suppliers',
    'brokers', 'orders', 'order_line_items', 'order_charges', 'enquiries',
    'enquiry_line_items', 'deliveries', 'invoices', 'payments',
    'purchase_orders', 'goods_receipts', 'stock_movements', 'production_plans',
    'jobwork_jobs', 'jobwork_items', 'quality_inspections', 'attachments'
  ]
  loop
    if to_regclass('public.' || table_name) is null then continue; end if;
    for trigger_name in
      select t.tgname
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      where not t.tgisinternal and n.nspname = 'public'
        and c.relname = table_name and p.proname = 'audit_trigger'
    loop
      execute format('drop trigger if exists %I on public.%I', trigger_name, table_name);
    end loop;
    execute format(
      'create trigger saras_audit_row after insert or update or delete on public.%I for each row execute function public.audit_trigger()',
      table_name
    );
  end loop;
end $$;

-- Version storage configuration alongside the database. Logos are public by
-- design; transactional documents and QC evidence remain private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('company-logos', 'company-logos', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('order-attachments', 'order-attachments', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif','application/pdf']),
  ('quality-photos', 'quality-photos', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Private attachment bucket. Application downloads must use signed URLs.
do $$
declare pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') ilike '%order-attachments%' or coalesce(with_check, '') ilike '%order-attachments%')
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;
drop policy if exists saras_attachments_select on storage.objects;
drop policy if exists saras_attachments_insert on storage.objects;
drop policy if exists saras_attachments_delete on storage.objects;
create policy saras_attachments_select on storage.objects for select to authenticated
  using (bucket_id = 'order-attachments' and public.has_permission('orders', 'view'));
create policy saras_attachments_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'order-attachments' and public.has_permission('orders', 'edit'));
create policy saras_attachments_delete on storage.objects for delete to authenticated
  using (bucket_id = 'order-attachments' and public.has_permission('orders', 'delete'));

drop policy if exists saras_company_logos_insert on storage.objects;
drop policy if exists saras_company_logos_update on storage.objects;
drop policy if exists saras_company_logos_delete on storage.objects;
create policy saras_company_logos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'company-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy saras_company_logos_update on storage.objects for update to authenticated
  using (bucket_id = 'company-logos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'company-logos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy saras_company_logos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists saras_quality_photos_select on storage.objects;
drop policy if exists saras_quality_photos_insert on storage.objects;
drop policy if exists saras_quality_photos_delete on storage.objects;
create policy saras_quality_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'quality-photos' and public.has_permission('quality', 'view'));
create policy saras_quality_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'quality-photos' and public.has_permission('quality', 'inspect'));
create policy saras_quality_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'quality-photos' and public.has_permission('quality', 'inspect'));

commit;
