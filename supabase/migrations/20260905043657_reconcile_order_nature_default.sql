begin;
-- The original installation retained a default rejected by the current nature constraint.
alter table public.orders alter column nature set default 'production';
commit;
