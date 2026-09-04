-- Keep the product importer aligned with the products table constraint.
-- The table accepts per_piece, but the legacy RPC rejected it.

do $migration$
declare
  function_definition text;
  old_check constant text := 'not in (''per_meter'', ''per_kg'')';
  new_check constant text := 'not in (''per_meter'', ''per_kg'', ''per_piece'')';
begin
  select pg_get_functiondef(p.oid)
  into function_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'import_master_rows'
    and pg_get_function_identity_arguments(p.oid) = 'p_table text, p_rows jsonb, p_filename text, p_request_id uuid';

  if function_definition is null then
    raise exception 'public.import_master_rows(text,jsonb,text,uuid) was not found';
  end if;

  if position(new_check in function_definition) > 0 then
    return;
  end if;

  if position(old_check in function_definition) = 0 then
    raise exception 'Expected legacy product rate-unit validation was not found';
  end if;

  execute replace(function_definition, old_check, new_check);
end
$migration$;

