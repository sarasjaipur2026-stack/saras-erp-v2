begin;
alter table public.order_charges add column if not exists name text;
alter table public.order_charges alter column name set default 'Additional charge';
create or replace function public.fill_order_charge_name() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if new.name is null or new.name='Additional charge' or new.charge_type_id is distinct from old.charge_type_id then
    new.name := coalesce((select name from public.charge_types where id=new.charge_type_id),'Additional charge');
  end if;
  return new;
end $$;
revoke all on function public.fill_order_charge_name() from public,anon,authenticated;
create trigger fill_order_charge_name before insert or update on public.order_charges
for each row execute function public.fill_order_charge_name();
commit;
