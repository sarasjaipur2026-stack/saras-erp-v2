begin;

alter table public.calculator_profiles
  add column if not exists payload jsonb,
  add column if not exists order_id uuid,
  add column if not exists actual_sell_per_kg numeric(14,2),
  add column if not exists calculated_sell_per_kg numeric(14,2),
  add column if not exists calculated_cost_per_kg numeric(14,2);

update public.calculator_profiles
set payload = '{}'::jsonb
where payload is null;

alter table public.calculator_profiles
  alter column payload set default '{}'::jsonb,
  alter column payload set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.calculator_profiles'::regclass
      and conname = 'calculator_profiles_order_id_fkey'
  ) then
    alter table public.calculator_profiles
      add constraint calculator_profiles_order_id_fkey
      foreign key (order_id) references public.orders(id) on delete set null;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_index
    where indrelid = 'public.calculator_profiles'::regclass
      and pg_get_indexdef(indexrelid) like '%(order_id)%'
  ) then
    create index calculator_profiles_order_id_idx
      on public.calculator_profiles(order_id);
  end if;
end
$$;

commit;
