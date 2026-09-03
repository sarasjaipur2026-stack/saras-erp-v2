-- Add supporting indexes for every public-schema foreign key.
-- PostgreSQL does not create these automatically; without them, joins and
-- parent-row updates/deletes can degrade into full table scans.

begin;

do $$
declare
  fk record;
  index_name text;
begin
  for fk in
    select
      c.oid as constraint_oid,
      ns.nspname as schema_name,
      rel.relname as table_name,
      c.conname as constraint_name,
      string_agg(quote_ident(att.attname), ', ' order by key_column.ordinality) as column_list
    from pg_constraint c
    join pg_class rel on rel.oid = c.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    cross join lateral unnest(c.conkey) with ordinality as key_column(attnum, ordinality)
    join pg_attribute att
      on att.attrelid = c.conrelid
     and att.attnum = key_column.attnum
    where c.contype = 'f'
      and ns.nspname = 'public'
      and not exists (
        select 1
        from pg_index i
        where i.indrelid = c.conrelid
          and i.indisvalid
          and i.indisready
          and i.indkey::smallint[] @> c.conkey
      )
    group by c.oid, ns.nspname, rel.relname, c.conname
    order by ns.nspname, rel.relname, c.conname
  loop
    index_name := left(
      format('idx_fk_%s_%s', fk.table_name, fk.constraint_name),
      53
    ) || '_' || substr(
      md5(format('%s.%s.%s', fk.schema_name, fk.table_name, fk.constraint_name)),
      1,
      8
    );

    execute format(
      'create index if not exists %I on %I.%I (%s)',
      index_name,
      fk.schema_name,
      fk.table_name,
      fk.column_list
    );
  end loop;
end
$$;

commit;
