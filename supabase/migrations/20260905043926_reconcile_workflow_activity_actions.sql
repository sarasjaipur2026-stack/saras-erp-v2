begin;
-- Match the original activity_action enum as well as clean installations using text.
do $$
declare definition text;
begin
  select pg_get_functiondef('public.record_delivery_transactional(uuid,uuid,date,numeric,text,text,text,uuid)'::regprocedure) into definition;
  definition := replace(definition, '''delivery'', ''Delivery of ''', '''delivery_added'', ''Delivery of ''');
  execute definition;
end $$;
commit;
