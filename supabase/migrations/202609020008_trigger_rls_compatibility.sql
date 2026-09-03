-- Allow trusted workflow triggers to write their protected side-effect rows.
-- The live v2 schema owns these trigger functions, while clean installs may not.

begin;

do $$
begin
  if to_regprocedure('public.notify_order_approval()') is not null then
    alter function public.notify_order_approval() security definer;
    alter function public.notify_order_approval() set search_path = pg_catalog, public;
    revoke all on function public.notify_order_approval() from public;
  end if;

  if to_regprocedure('public.log_order_status_change()') is not null then
    alter function public.log_order_status_change() security definer;
    alter function public.log_order_status_change() set search_path = pg_catalog, public;
    revoke all on function public.log_order_status_change() from public;
  end if;
end
$$;

commit;
