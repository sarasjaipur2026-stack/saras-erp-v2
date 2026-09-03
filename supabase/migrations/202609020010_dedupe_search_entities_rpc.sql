-- PostgREST cannot resolve an RPC call when a legacy overload differs only by
-- an optional trailing argument. The application uses the canonical,
-- auth-scoped three-argument function created by 202609020003.
drop function if exists public.search_entities(text, text[], integer, uuid);

revoke all on function public.search_entities(text, text[], integer) from public;
grant execute on function public.search_entities(text, text[], integer) to authenticated;
