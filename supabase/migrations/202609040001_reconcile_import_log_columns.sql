-- Reconcile legacy production import_log names with the transactional API/UI.
-- Fresh databases already use filename/record_count; older databases used
-- file_name/total_rows. Preserve all existing rows while converging on one API.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'import_log' and column_name = 'file_name'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'import_log' and column_name = 'filename'
  ) then
    alter table public.import_log rename column file_name to filename;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'import_log' and column_name = 'total_rows'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'import_log' and column_name = 'record_count'
  ) then
    alter table public.import_log rename column total_rows to record_count;
  end if;
end
$$;

alter table public.import_log
  add column if not exists imported_rows integer not null default 0,
  add column if not exists skipped_rows integer not null default 0,
  add column if not exists error_rows integer not null default 0,
  add column if not exists errors jsonb not null default '[]'::jsonb,
  add column if not exists completed_at timestamptz;

update public.import_log
set completed_at = coalesce(completed_at, created_at)
where status = 'completed' and completed_at is null;

