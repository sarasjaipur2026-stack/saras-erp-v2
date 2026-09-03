begin;

-- The original v2 schema used line_items_calc_profile_fkey. The baseline
-- migration later added the canonical constraint name, which can leave two
-- equivalent relationships for PostgREST and make nested order reads
-- ambiguous. Keep the canonical relationship when both definitions match.
do $$
begin
  if exists (
    select 1
    from pg_constraint legacy
    join pg_constraint canonical
      on canonical.conrelid = legacy.conrelid
     and canonical.confrelid = legacy.confrelid
     and canonical.conkey = legacy.conkey
     and canonical.confkey = legacy.confkey
     and canonical.confupdtype = legacy.confupdtype
     and canonical.confdeltype = legacy.confdeltype
     and canonical.confmatchtype = legacy.confmatchtype
    where legacy.conrelid = 'public.order_line_items'::regclass
      and legacy.contype = 'f'
      and legacy.conname = 'line_items_calc_profile_fkey'
      and canonical.contype = 'f'
      and canonical.conname = 'order_line_items_calculator_profile_id_fkey'
  ) then
    alter table public.order_line_items
      drop constraint line_items_calc_profile_fkey;
  end if;
end
$$;

-- Ask PostgREST to forget the duplicate relationship immediately after commit.
notify pgrst, 'reload schema';

commit;
