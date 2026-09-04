begin;

-- These owner-scoped POS RPCs predate the v2 migration chain. Preserve them
-- for the connected POS client while removing mutable-schema lookup risk.
do $$
declare fn record;
begin
  for fn in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('pos_close_session', 'pos_create_sale', 'pos_recall_sale')
  loop
    execute format('alter function %s set search_path = pg_catalog, public', fn.signature);
  end loop;
end $$;

commit;
