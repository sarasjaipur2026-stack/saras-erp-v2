-- Columns and tables required by the transactional ERP API.

begin;

-- The legacy schema used a five-value enum, while the application workflow
-- now has draft/booking/approved/production/qc/dispatch/completed states.
-- Keep an already-compatible enum in place: changing its column type would
-- require dropping every trigger that references orders.status. Convert only
-- genuinely legacy enums that are missing one or more workflow values.
do $$
begin
  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public' and c.table_name = 'orders'
      and c.column_name = 'status' and c.udt_name <> 'text'
      and exists (
        select 1
        from unnest(array['draft', 'booking', 'approved', 'production', 'qc', 'dispatch', 'completed', 'cancelled']) required(label)
        where not exists (
          select 1
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = c.udt_schema
            and t.typname = c.udt_name and e.enumlabel = required.label
        )
      )
  ) then
    alter table public.orders alter column status drop default;
    alter table public.orders alter column status type text using status::text;
  end if;
end $$;

alter table if exists public.orders add column if not exists subtotal numeric(14,2) not null default 0;
alter table if exists public.orders add column if not exists taxable_amount numeric(14,2) not null default 0;
alter table if exists public.orders add column if not exists cgst_amount numeric(14,2) not null default 0;
alter table if exists public.orders add column if not exists sgst_amount numeric(14,2) not null default 0;
alter table if exists public.orders add column if not exists igst_amount numeric(14,2) not null default 0;
alter table if exists public.orders add column if not exists balance_due numeric(14,2) not null default 0;
alter table if exists public.orders add column if not exists payment_due_date date;
alter table if exists public.order_line_items add column if not exists quantity numeric(14,3) not null default 0;
alter table if exists public.order_line_items add column if not exists unit text not null default 'pcs';

create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  bank_name text,
  account_number text,
  ifsc_code text,
  branch text,
  account_type text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  address text,
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.yarn_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  hsn_code text,
  gst_rate numeric(5,2),
  default_rate_per_kg numeric(14,2),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete restrict,
  invoice_date date not null default current_date,
  due_date date,
  subtotal numeric(14,2) not null default 0,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  total_tax numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  status text not null default 'issued',
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_mode text not null,
  payment_date date not null default current_date,
  reference_number text,
  bank_id uuid references public.banks(id) on delete set null,
  notes text,
  idempotency_key uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  po_date date not null default current_date,
  expected_date date,
  status text not null default 'issued',
  subtotal numeric(14,2) not null default 0,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  grand_total numeric(14,2) not null default 0,
  notes text,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.purchase_order_items (
  id uuid primary key default gen_random_uuid(),
  po_id uuid not null references public.purchase_orders(id) on delete cascade,
  yarn_type_id uuid not null references public.yarn_types(id) on delete restrict,
  description text,
  quantity numeric(14,3) not null check (quantity > 0),
  quantity_received numeric(14,3) not null default 0,
  unit text not null default 'kg',
  rate_per_unit numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  grn_number text not null unique,
  po_id uuid not null references public.purchase_orders(id) on delete restrict,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  received_date date not null default current_date,
  vehicle_number text,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  status text not null default 'received',
  notes text,
  idempotency_key uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.goods_receipt_items (
  id uuid primary key default gen_random_uuid(),
  grn_id uuid not null references public.goods_receipts(id) on delete cascade,
  po_item_id uuid references public.purchase_order_items(id) on delete restrict,
  yarn_type_id uuid not null references public.yarn_types(id) on delete restrict,
  quantity_received numeric(14,3) not null check (quantity_received > 0),
  unit text not null default 'kg',
  qc_status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('in', 'out', 'adjustment')),
  product_id uuid references public.products(id) on delete restrict,
  material_id uuid references public.materials(id) on delete restrict,
  yarn_type_id uuid references public.yarn_types(id) on delete restrict,
  product_type_id uuid references public.product_types(id) on delete restrict,
  warehouse_id uuid references public.warehouses(id) on delete set null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null,
  source_type text,
  source_id uuid,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.production_plans (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  line_item_id uuid references public.order_line_items(id) on delete restrict,
  product_id uuid references public.products(id) on delete restrict,
  machine_id uuid references public.machines(id) on delete set null,
  material_id uuid references public.materials(id) on delete set null,
  planned_qty numeric(14,3) not null default 0,
  completed_qty numeric(14,3) not null default 0,
  unit text not null default 'pcs',
  status text not null default 'planned',
  planned_start timestamptz,
  planned_end timestamptz,
  actual_start timestamptz,
  actual_end timestamptz,
  create_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobwork_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique,
  direction text not null check (direction in ('inward', 'outward')),
  status text not null default 'pending',
  customer_id uuid references public.customers(id) on delete restrict,
  supplier_id uuid references public.suppliers(id) on delete restrict,
  order_id uuid references public.orders(id) on delete set null,
  start_date date not null default current_date,
  due_date date,
  completed_date date,
  rate_per_unit numeric(14,2),
  rate_unit text not null default 'kg',
  notes text,
  idempotency_key uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobwork_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobwork_jobs(id) on delete cascade,
  kind text not null,
  yarn_type_id uuid references public.yarn_types(id) on delete restrict,
  product_type_id uuid references public.product_types(id) on delete restrict,
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null default 'kg',
  event_date date not null default current_date,
  notes text,
  idempotency_key uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.quality_inspections (
  id uuid primary key default gen_random_uuid(),
  qi_number text not null unique,
  source_type text not null default 'manual',
  source_id uuid,
  inspector text,
  sample_size integer,
  overall_status text not null default 'pending',
  notes text,
  idempotency_key uuid,
  inspected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quality_inspection_results (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.quality_inspections(id) on delete cascade,
  parameter_id uuid,
  parameter_name text,
  measured_value numeric,
  text_value text,
  pass boolean,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.import_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  import_type text not null,
  filename text not null,
  record_count integer not null default 0,
  status text not null,
  idempotency_key uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_at timestamptz not null default now()
);

create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 5242880),
  storage_path text not null unique,
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table if exists public.invoices add column if not exists idempotency_key uuid;
alter table if exists public.payments add column if not exists idempotency_key uuid;
alter table if exists public.purchase_orders add column if not exists idempotency_key uuid;
alter table if exists public.goods_receipts add column if not exists idempotency_key uuid;
alter table if exists public.deliveries add column if not exists line_item_id uuid references public.order_line_items(id) on delete restrict;
alter table if exists public.deliveries add column if not exists unit text not null default 'pcs';
alter table if exists public.deliveries add column if not exists challan_number text;
alter table if exists public.deliveries add column if not exists vehicle_number text;
alter table if exists public.deliveries add column if not exists driver_name text;
alter table if exists public.deliveries add column if not exists dispatch_request_id uuid;
alter table if exists public.production_plans add column if not exists product_id uuid references public.products(id) on delete restrict;
alter table if exists public.production_plans add column if not exists create_request_id uuid;
alter table if exists public.production_plans add column if not exists unit text not null default 'pcs';
alter table if exists public.jobwork_jobs add column if not exists idempotency_key uuid;
alter table if exists public.jobwork_items add column if not exists idempotency_key uuid;
alter table if exists public.quality_inspections add column if not exists idempotency_key uuid;
alter table if exists public.import_log add column if not exists idempotency_key uuid;
alter table if exists public.notifications add column if not exists staff_id uuid;
alter table if exists public.notifications add column if not exists entity_type text;
alter table if exists public.notifications add column if not exists entity_id uuid;

create unique index if not exists invoices_idempotency_unique on public.invoices(idempotency_key) where idempotency_key is not null;
create unique index if not exists payments_idempotency_unique on public.payments(idempotency_key) where idempotency_key is not null;
create unique index if not exists purchase_orders_idempotency_unique on public.purchase_orders(idempotency_key) where idempotency_key is not null;
create unique index if not exists goods_receipts_idempotency_unique on public.goods_receipts(idempotency_key) where idempotency_key is not null;
create unique index if not exists deliveries_request_line_unique on public.deliveries(dispatch_request_id, line_item_id) where dispatch_request_id is not null;
create unique index if not exists production_request_line_unique on public.production_plans(create_request_id, line_item_id) where create_request_id is not null;
create unique index if not exists jobwork_jobs_idempotency_unique on public.jobwork_jobs(idempotency_key) where idempotency_key is not null;
create unique index if not exists jobwork_items_idempotency_unique on public.jobwork_items(idempotency_key) where idempotency_key is not null;
create unique index if not exists quality_inspections_idempotency_unique on public.quality_inspections(idempotency_key) where idempotency_key is not null;
create unique index if not exists import_log_idempotency_unique on public.import_log(idempotency_key) where idempotency_key is not null;
create index if not exists payments_order_idx on public.payments(order_id);
create index if not exists stock_movements_balance_idx on public.stock_movements(product_id, material_id, yarn_type_id, product_type_id, warehouse_id);

create sequence if not exists public.invoice_number_seq;
create sequence if not exists public.po_number_seq;
create sequence if not exists public.grn_number_seq;
create sequence if not exists public.challan_number_seq;
create sequence if not exists public.jobwork_number_seq;
create sequence if not exists public.qi_number_seq;

do $$
begin
  if to_regprocedure('public.next_invoice_number()') is null then
    execute $fn$create function public.next_invoice_number() returns text language sql security definer set search_path = pg_catalog, public as 'select ''INV-'' || to_char(current_date, ''YYYYMM'') || ''-'' || lpad(nextval(''public.invoice_number_seq'')::text, 6, ''0'')'$fn$;
  end if;
  if to_regprocedure('public.next_po_number()') is null then
    execute $fn$create function public.next_po_number() returns text language sql security definer set search_path = pg_catalog, public as 'select ''PO-'' || to_char(current_date, ''YYYYMM'') || ''-'' || lpad(nextval(''public.po_number_seq'')::text, 6, ''0'')'$fn$;
  end if;
  if to_regprocedure('public.next_grn_number()') is null then
    execute $fn$create function public.next_grn_number() returns text language sql security definer set search_path = pg_catalog, public as 'select ''GRN-'' || to_char(current_date, ''YYYYMM'') || ''-'' || lpad(nextval(''public.grn_number_seq'')::text, 6, ''0'')'$fn$;
  end if;
  if to_regprocedure('public.next_challan_number()') is null then
    execute $fn$create function public.next_challan_number() returns text language sql security definer set search_path = pg_catalog, public as 'select ''DC-'' || to_char(current_date, ''YYYYMM'') || ''-'' || lpad(nextval(''public.challan_number_seq'')::text, 6, ''0'')'$fn$;
  end if;
  if to_regprocedure('public.next_jobwork_number()') is null then
    execute $fn$create function public.next_jobwork_number() returns text language sql security definer set search_path = pg_catalog, public as 'select ''JW-'' || to_char(current_date, ''YYYYMM'') || ''-'' || lpad(nextval(''public.jobwork_number_seq'')::text, 6, ''0'')'$fn$;
  end if;
  if to_regprocedure('public.next_qi_number()') is null then
    execute $fn$create function public.next_qi_number() returns text language sql security definer set search_path = pg_catalog, public as 'select ''QI-'' || to_char(current_date, ''YYYYMM'') || ''-'' || lpad(nextval(''public.qi_number_seq'')::text, 6, ''0'')'$fn$;
  end if;
end $$;

revoke all on function public.next_invoice_number() from public;
revoke all on function public.next_po_number() from public;
revoke all on function public.next_grn_number() from public;
revoke all on function public.next_challan_number() from public;
revoke all on function public.next_jobwork_number() from public;
revoke all on function public.next_qi_number() from public;
grant execute on function public.next_invoice_number() to authenticated;
grant execute on function public.next_po_number() to authenticated;
grant execute on function public.next_grn_number() to authenticated;
grant execute on function public.next_challan_number() to authenticated;
grant execute on function public.next_jobwork_number() to authenticated;
grant execute on function public.next_qi_number() to authenticated;

commit;
