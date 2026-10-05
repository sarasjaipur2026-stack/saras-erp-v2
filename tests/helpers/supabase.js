import assert from 'node:assert/strict'
import { readdir,readFile } from 'node:fs/promises'
const migrationDir=new URL('../../supabase/migrations/',import.meta.url)
export async function createSupabaseHarness(db) {
  await db.exec(`
    create role authenticated;
    create role anon;
    create role service_role;

    create schema auth;
    create table auth.users (
      id uuid primary key default gen_random_uuid(),
      email text,
      raw_user_meta_data jsonb not null default '{}'::jsonb
    );
    create function auth.uid() returns uuid
      language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;

    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text not null references storage.buckets(id),
      name text not null
    );
    create function storage.foldername(name text) returns text[]
      language sql immutable as $$
        select case
          when strpos(name, '/') = 0 then array[]::text[]
          else string_to_array(regexp_replace(name, '/[^/]*$', ''), '/')
        end
      $$;
    grant usage on schema storage to authenticated;
    grant select,insert,delete on storage.objects to authenticated;
    alter table storage.objects enable row level security;
  `)
}

export async function runMigrations(db) {
  const files = (await readdir(migrationDir))
    .filter(file => file.endsWith('.sql'))
    .sort()

  assert.ok(files.length >= 3, 'expected the versioned database migrations')
  for (const file of files) {
    const sql = await readFile(new URL(file, migrationDir), 'utf8')
    await db.exec(sql)
  }
}

