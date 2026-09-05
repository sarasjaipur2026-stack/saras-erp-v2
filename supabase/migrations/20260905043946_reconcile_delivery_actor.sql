begin;
do $$ declare definition text; begin
select pg_get_functiondef('public.record_delivery_transactional(uuid,uuid,date,numeric,text,text,text,uuid)'::regprocedure) into definition;
definition:=replace(definition,'values (auth.uid(), auth.uid(), ''order'', p_order_id','values (auth.uid(), null, ''order'', p_order_id');
execute definition;
end $$;
commit;
