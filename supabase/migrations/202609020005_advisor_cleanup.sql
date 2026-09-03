-- Resolve actionable Supabase performance-advisor findings.

begin;

-- Wrap stable authentication helpers in scalar subqueries so PostgreSQL can
-- evaluate them once per statement instead of once per candidate row.
alter policy profiles_select_secure on public.profiles
  using (id = (select auth.uid()) or (select public.is_admin()));

alter policy profiles_update_secure on public.profiles
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));

alter policy notifications_select_secure on public.notifications
  using (
    user_id = (select auth.uid())
    or staff_id = (select auth.uid())
    or staff_id is null
  );

alter policy notifications_insert_secure on public.notifications
  with check (user_id = (select auth.uid()));

alter policy notifications_update_secure on public.notifications
  using (user_id = (select auth.uid()) or staff_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) or staff_id = (select auth.uid()));

alter policy import_log_select_secure on public.import_log
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Remove only indexes whose complete definition is duplicated in the current
-- database. Schema variants can use similarly named indexes for different
-- columns, so deciding from names alone is unsafe.
do $$
declare
  duplicate_index record;
begin
  for duplicate_index in
    with ranked_indexes as (
      select
        idx_ns.nspname as schema_name,
        idx.relname as index_name,
        dependent.oid is not null as backed_by_constraint,
        row_number() over (
          partition by
            i.indrelid,
            i.indisunique,
            i.indisprimary,
            i.indkey,
            i.indclass,
            i.indcollation,
            i.indoption,
            pg_get_expr(i.indexprs, i.indrelid),
            pg_get_expr(i.indpred, i.indrelid)
          order by (dependent.oid is not null) desc, idx.relname
        ) as duplicate_rank
      from pg_index i
      join pg_class rel on rel.oid = i.indrelid
      join pg_namespace rel_ns on rel_ns.oid = rel.relnamespace
      join pg_class idx on idx.oid = i.indexrelid
      join pg_namespace idx_ns on idx_ns.oid = idx.relnamespace
      left join pg_constraint dependent on dependent.conindid = i.indexrelid
      where rel_ns.nspname = 'public'
        and i.indisvalid
        and i.indisready
    )
    select schema_name, index_name
    from ranked_indexes
    where duplicate_rank > 1 and not backed_by_constraint
    order by schema_name, index_name
  loop
    execute format(
      'drop index %I.%I',
      duplicate_index.schema_name,
      duplicate_index.index_name
    );
  end loop;
end
$$;

commit;
