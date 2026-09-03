-- SARAS ERP v2 baseline schema.
-- This is the first migration and is safe to apply to both a new Supabase
-- project and the existing v2 database. Later migrations add transactional
-- workflows and replace the initial policies with the hardened policy set.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text,
  firm_name text,
  role text not null default 'viewer',
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  firm_name text not null,
  contact_name text,
  phone text,
  email text,
  city text,
  state text,
  state_code text,
  address text,
  shipping_addresses jsonb not null default '[]'::jsonb,
  gstin text,
  pan text,
  credit_limit numeric(14,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hsn_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  code text not null,
  category text,
  description text,
  cgst_pct numeric(5,2) not null default 0,
  sgst_pct numeric(5,2) not null default 0,
  igst_pct numeric(5,2) not null default 0,
  cess_pct numeric(5,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.units (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  symbol text not null,
  unit_type text not null,
  conversion_factor numeric(14,6) not null default 1,
  is_base_unit boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chaal_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  hindi_name text,
  speed_factor numeric(10,4) not null default 1,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.machine_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  custom_number text,
  machine_type text,
  spindle_count integer,
  default_carriers integer,
  default_speed_m_per_min numeric(14,3),
  motor_power_hp numeric(14,3),
  machine_width_mm numeric(14,3),
  rpm_min numeric(14,3),
  rpm_max numeric(14,3),
  hourly_cost numeric(14,2),
  machine_count integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  machine_type_id uuid references public.machine_types(id) on delete set null,
  code text not null,
  name text not null,
  name_hi text,
  spindles integer,
  compatible_products text[],
  machine_count integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.colors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  hex_code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  code text,
  category text,
  requires_filler boolean not null default false,
  default_chaal_id uuid references public.chaal_types(id) on delete set null,
  default_waste_pct numeric(7,3) not null default 5,
  hsn_code_id uuid references public.hsn_codes(id) on delete set null,
  default_unit_id uuid references public.units(id) on delete set null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  product_type_id uuid references public.product_types(id) on delete set null,
  code text not null,
  name text not null,
  name_hi text,
  hsn_code text,
  gst_rate numeric(5,2) not null default 0,
  rate_unit text default 'per_meter',
  default_rate_unit text not null default 'per_meter',
  uses_filler boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  category text not null,
  price_per_kg numeric(14,2),
  hsn_code text,
  gst_rate numeric(5,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  phone text,
  email text,
  firm text,
  gstin text,
  city text,
  state text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.brokers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  phone text,
  email text,
  commission_rate numeric(7,3),
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.charge_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  scope text not null default 'per_order',
  default_amount numeric(14,2) not null default 0,
  is_taxable boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  prefix text not null default 'ORD',
  gst_treatment text,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_terms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  days integer not null default 0,
  description text,
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  code text,
  address text,
  city text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.banks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
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

create table if not exists public.staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  phone text,
  email text,
  role text,
  department text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.currencies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  code text not null,
  name text not null,
  symbol text,
  exchange_rate numeric(18,6) not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.yarn_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  code text,
  yarn_category text,
  count_or_denier text,
  usage_type text,
  hsn_code text,
  hsn_code_id uuid references public.hsn_codes(id) on delete set null,
  color_id uuid references public.colors(id) on delete set null,
  gst_rate numeric(5,2),
  default_rate_per_kg numeric(14,2),
  min_order_qty numeric(14,3),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.yarn_supplier_rates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  yarn_type_id uuid not null references public.yarn_types(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  rate_per_kg numeric(14,2) not null,
  effective_from date not null default current_date,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.process_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  hindi_name text,
  sequence_order integer not null default 0,
  default_duration_per_kg_mins numeric(14,3),
  default_machine_type_id uuid references public.machine_types(id) on delete set null,
  requires_machine boolean not null default true,
  is_optional boolean not null default false,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.operators (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  phone text,
  role text,
  shift text,
  daily_wage numeric(14,2),
  joining_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.packaging_types (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  weight_grams numeric(14,3),
  cost_per_unit numeric(14,2),
  dimensions text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.transports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  vehicle_number text not null,
  vehicle_type text,
  transporter_name text,
  driver_name text,
  driver_phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quality_parameters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  name text not null,
  unit text,
  min_value numeric,
  max_value numeric,
  test_method text,
  is_mandatory boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete restrict,
  entity_type text not null,
  field_key text not null,
  label text not null,
  field_type text not null default 'text',
  options jsonb,
  required boolean not null default false,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  order_number text not null,
  order_type_id uuid references public.order_types(id) on delete set null,
  broker_id uuid references public.brokers(id) on delete set null,
  payment_terms_id uuid references public.payment_terms(id) on delete set null,
  currency_id uuid references public.currencies(id) on delete set null,
  currency_code text not null default 'INR',
  parent_sample_id uuid references public.orders(id) on delete set null,
  converted_enquiry_id uuid,
  nature text not null default 'sample',
  priority text not null default 'normal',
  status text not null default 'draft',
  delivery_date date,
  delivery_date_1 date,
  delivery_date_2 date,
  delivery_date_3 date,
  subtotal numeric(14,2) not null default 0,
  total_charges numeric(14,2) not null default 0,
  total_item_discount numeric(14,2) not null default 0,
  order_discount_type text not null default 'flat',
  order_discount_value numeric(14,2) not null default 0,
  order_discount_amount numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0,
  taxable_amount numeric(14,2) not null default 0,
  cgst_amount numeric(14,2) not null default 0,
  sgst_amount numeric(14,2) not null default 0,
  igst_amount numeric(14,2) not null default 0,
  gst_amount numeric(14,2) not null default 0,
  gst_type text not null default 'intra_state',
  grand_total numeric(14,2) not null default 0,
  advance_paid numeric(14,2) not null default 0,
  balance_due numeric(14,2) not null default 0,
  payment_due_date date,
  customer_notes text,
  internal_notes text,
  production_notes text,
  notes text,
  shipping_address jsonb,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, order_number)
);

create table if not exists public.order_line_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  sort_order integer not null default 0,
  line_type text not null default 'production',
  product_id uuid references public.products(id) on delete restrict,
  machine_id uuid references public.machines(id) on delete set null,
  material_id uuid references public.materials(id) on delete set null,
  color_id uuid references public.colors(id) on delete set null,
  calculator_profile_id uuid,
  width_cm numeric(14,3),
  meters numeric(14,3) not null default 0,
  weight_kg numeric(14,3) not null default 0,
  quantity numeric(14,3) not null default 0,
  unit text not null default 'pcs',
  rate_per_unit numeric(14,2) not null default 0,
  amount numeric(14,2) not null default 0,
  item_discount_type text not null default 'flat',
  item_discount_value numeric(14,2) not null default 0,
  item_discount_amount numeric(14,2) not null default 0,
  gst_rate numeric(5,2) not null default 0,
  gst_amount numeric(14,2) not null default 0,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_charges (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  charge_type_id uuid references public.charge_types(id) on delete set null,
  scope text not null default 'per_order',
  amount numeric(14,2) not null default 0,
  is_taxable boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.enquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  enquiry_number text not null,
  order_type_id uuid references public.order_types(id) on delete set null,
  broker_id uuid references public.brokers(id) on delete set null,
  payment_terms_id uuid references public.payment_terms(id) on delete set null,
  assigned_to uuid references public.staff(id) on delete set null,
  contact_person_name text,
  contact_phone text,
  contact_role text,
  products_required text,
  quantity numeric(14,3),
  quoted_rate numeric(14,2),
  source text,
  source_channel text,
  source_details text,
  status text not null default 'new',
  stage text not null default 'new',
  outcome text not null default 'open',
  probability integer not null default 10,
  priority text not null default 'normal',
  expected_value numeric(14,2),
  expected_close_date date,
  followup_date date,
  lost_reason text,
  lost_reason_note text,
  competitor_info text,
  lost_at timestamptz,
  converted_order_id uuid references public.orders(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, enquiry_number)
);

alter table public.orders add column if not exists converted_enquiry_id uuid;
alter table public.orders drop constraint if exists orders_converted_enquiry_id_fkey;
alter table public.orders add constraint orders_converted_enquiry_id_fkey
  foreign key (converted_enquiry_id) references public.enquiries(id) on delete set null;

create table if not exists public.enquiry_line_items (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name_override text,
  description text,
  quantity numeric(14,3) not null default 0,
  unit text not null default 'pcs',
  target_rate numeric(14,2),
  quoted_rate numeric(14,2),
  our_quoted_rate numeric(14,2),
  notes text,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.enquiry_activities (
  id uuid primary key default gen_random_uuid(),
  enquiry_id uuid not null references public.enquiries(id) on delete cascade,
  staff_id uuid references public.staff(id) on delete set null,
  activity_type text not null,
  body text,
  direction text,
  created_by uuid references public.profiles(id) on delete set null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.deliveries (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  line_item_id uuid references public.order_line_items(id) on delete restrict,
  challan_number text,
  delivery_date date not null default current_date,
  quantity_delivered numeric(14,3) not null default 0,
  unit text not null default 'pcs',
  vehicle_number text,
  driver_name text,
  delivery_note text,
  dispatch_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.jobwork_tracking (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  line_item_id uuid references public.order_line_items(id) on delete set null,
  material_inward_date date,
  material_inward_qty numeric(14,3),
  material_return_date date,
  material_return_qty numeric(14,3),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calculator_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  profile_name text not null,
  machine_id uuid references public.machines(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  chaal text,
  sample_length_m numeric(14,3),
  sample_weight_kg numeric(14,3),
  grams_per_meter numeric(14,3),
  yarn_count text,
  yarn_type text,
  cover_count text,
  filler_count text,
  waste_percentage numeric(7,3),
  labor_cost_per_kg numeric(14,2),
  overhead_cost_percentage numeric(7,3),
  profit_margin_percentage numeric(7,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stock (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete restrict,
  material_id uuid not null references public.materials(id) on delete restrict,
  quantity_kg numeric(14,3) not null default 0,
  location text,
  batch_number text,
  expiry_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  staff_id uuid,
  title text not null,
  message text,
  type text,
  entity_type text,
  entity_id uuid,
  related_order_id uuid references public.orders(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  staff_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  comment text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  table_name text not null,
  record_id uuid,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

-- Bring installations created from the original one-file schema up to the
-- baseline shape. ADD COLUMN is deliberately non-destructive.
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists role text not null default 'viewer';
alter table public.profiles add column if not exists permissions jsonb not null default '{}'::jsonb;

alter table public.products add column if not exists name_hi text;
alter table public.products add column if not exists product_type_id uuid references public.product_types(id) on delete set null;
alter table public.products add column if not exists default_rate_unit text not null default 'per_meter';
alter table public.products add column if not exists active boolean not null default true;
alter table public.products alter column rate_unit set default 'per_meter';
alter table public.customers alter column contact_name drop not null;
alter table public.customers add column if not exists state text;
alter table public.customers add column if not exists state_code text;
alter table public.customers add column if not exists shipping_addresses jsonb not null default '[]'::jsonb;

alter table public.materials add column if not exists active boolean not null default true;
alter table public.machines add column if not exists machine_type_id uuid references public.machine_types(id) on delete set null;
alter table public.machines add column if not exists active boolean not null default true;
alter table public.colors add column if not exists active boolean not null default true;
alter table public.suppliers add column if not exists state text;
alter table public.suppliers add column if not exists active boolean not null default true;

alter table public.orders add column if not exists order_type_id uuid references public.order_types(id) on delete set null;
alter table public.orders add column if not exists broker_id uuid references public.brokers(id) on delete set null;
alter table public.orders add column if not exists payment_terms_id uuid references public.payment_terms(id) on delete set null;
alter table public.orders add column if not exists currency_id uuid references public.currencies(id) on delete set null;
alter table public.orders add column if not exists currency_code text not null default 'INR';
alter table public.orders add column if not exists parent_sample_id uuid references public.orders(id) on delete set null;
alter table public.orders add column if not exists converted_enquiry_id uuid;
alter table public.orders add column if not exists delivery_date_1 date;
alter table public.orders add column if not exists delivery_date_2 date;
alter table public.orders add column if not exists delivery_date_3 date;
alter table public.orders add column if not exists total_charges numeric(14,2) not null default 0;
alter table public.orders add column if not exists total_item_discount numeric(14,2) not null default 0;
alter table public.orders add column if not exists order_discount_type text not null default 'flat';
alter table public.orders add column if not exists order_discount_value numeric(14,2) not null default 0;
alter table public.orders add column if not exists order_discount_amount numeric(14,2) not null default 0;
alter table public.orders add column if not exists gst_type text not null default 'intra_state';
alter table public.orders add column if not exists customer_notes text;
alter table public.orders add column if not exists internal_notes text;
alter table public.orders add column if not exists production_notes text;
alter table public.orders add column if not exists shipping_address jsonb;
alter table public.orders add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.orders add column if not exists approved_at timestamptz;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orders' and column_name = 'order_type'
  ) then
    alter table public.orders alter column order_type set default 'standard';
  end if;
end $$;
alter table public.orders drop constraint if exists orders_nature_check;
update public.orders set nature = 'production' where nature = 'full_production';
alter table public.orders add constraint orders_nature_check check (nature in ('sample', 'production'));

alter table public.order_line_items add column if not exists sort_order integer not null default 0;
alter table public.order_line_items add column if not exists calculator_profile_id uuid;
alter table public.order_line_items add column if not exists item_discount_type text not null default 'flat';
alter table public.order_line_items add column if not exists item_discount_value numeric(14,2) not null default 0;
alter table public.order_line_items add column if not exists item_discount_amount numeric(14,2) not null default 0;
alter table public.order_line_items add column if not exists gst_rate numeric(5,2) not null default 0;
alter table public.order_line_items add column if not exists gst_amount numeric(14,2) not null default 0;
alter table public.order_line_items add column if not exists instructions text;

alter table public.enquiries add column if not exists order_type_id uuid references public.order_types(id) on delete set null;
alter table public.enquiries add column if not exists broker_id uuid references public.brokers(id) on delete set null;
alter table public.enquiries add column if not exists payment_terms_id uuid references public.payment_terms(id) on delete set null;
alter table public.enquiries add column if not exists assigned_to uuid references public.staff(id) on delete set null;
alter table public.enquiries add column if not exists contact_person_name text;
alter table public.enquiries add column if not exists contact_phone text;
alter table public.enquiries add column if not exists contact_role text;
alter table public.enquiries add column if not exists source_channel text;
alter table public.enquiries add column if not exists source_details text;
alter table public.enquiries add column if not exists stage text not null default 'new';
alter table public.enquiries add column if not exists outcome text not null default 'open';
alter table public.enquiries add column if not exists probability integer not null default 10;
alter table public.enquiries add column if not exists priority text not null default 'normal';
alter table public.enquiries add column if not exists expected_value numeric(14,2);
alter table public.enquiries add column if not exists expected_close_date date;
alter table public.enquiries add column if not exists lost_reason text;
alter table public.enquiries add column if not exists lost_reason_note text;
alter table public.enquiries add column if not exists competitor_info text;
alter table public.enquiries add column if not exists lost_at timestamptz;
alter table public.enquiries add column if not exists converted_order_id uuid references public.orders(id) on delete set null;

alter table public.enquiry_line_items add column if not exists product_name_override text;
alter table public.enquiry_line_items add column if not exists our_quoted_rate numeric(14,2);
alter table public.enquiry_line_items add column if not exists notes text;
alter table public.enquiry_activities add column if not exists body text;
alter table public.enquiry_activities add column if not exists direction text;
alter table public.enquiry_activities add column if not exists created_by uuid references public.profiles(id) on delete set null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'order_line_items_calculator_profile_id_fkey') then
    alter table public.order_line_items add constraint order_line_items_calculator_profile_id_fkey
      foreign key (calculator_profile_id) references public.calculator_profiles(id) on delete set null;
  end if;
end $$;

create index if not exists customers_user_idx on public.customers(user_id);
create index if not exists orders_customer_idx on public.orders(customer_id);
create index if not exists orders_created_idx on public.orders(created_at desc);
create index if not exists order_line_items_order_idx on public.order_line_items(order_id);
create index if not exists enquiries_customer_idx on public.enquiries(customer_id);
create index if not exists enquiries_created_idx on public.enquiries(created_at desc);
create index if not exists deliveries_order_idx on public.deliveries(order_id);
create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists activity_log_entity_idx on public.activity_log(entity_type, entity_id, created_at desc);
create index if not exists audit_log_created_idx on public.audit_log(created_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', new.email, 'User'))
  on conflict (id) do nothing;
  return new;
end
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
revoke all on function public.handle_new_user() from public;

create or replace function public.generate_order_number(p_user_id uuid, p_prefix text default 'ORD')
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_prefix text := upper(regexp_replace(coalesce(nullif(p_prefix, ''), 'ORD'), '[^A-Za-z0-9_-]', '', 'g'));
  v_next bigint;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':order:' || v_prefix, 0));
  select coalesce(max((substring(order_number from '([0-9]+)$'))::bigint), 0) + 1
    into v_next
    from public.orders
    where user_id = p_user_id and order_number ~ '[0-9]+$';
  return v_prefix || '-' || to_char(current_date, 'YYYYMM') || '-' || lpad(v_next::text, 6, '0');
end
$$;

create or replace function public.generate_enquiry_number(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_next bigint;
begin
  if auth.uid() is null or auth.uid() <> p_user_id then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':enquiry', 0));
  select coalesce(max((substring(enquiry_number from '([0-9]+)$'))::bigint), 0) + 1
    into v_next
    from public.enquiries
    where user_id = p_user_id and enquiry_number ~ '[0-9]+$';
  return 'ENQ-' || to_char(current_date, 'YYYYMM') || '-' || lpad(v_next::text, 6, '0');
end
$$;

revoke all on function public.generate_order_number(uuid, text) from public;
revoke all on function public.generate_enquiry_number(uuid) from public;
grant execute on function public.generate_order_number(uuid, text) to authenticated;
grant execute on function public.generate_enquiry_number(uuid) to authenticated;

commit;
