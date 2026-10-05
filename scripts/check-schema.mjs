import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'
import { pathToFileURL } from 'node:url'

export const EXPECTED_SCHEMA = '20261005095632'

export async function checkSchema(env, request = fetch) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase URL/key missing; cannot verify database compatibility')
  const response = await request(`${url.replace(/\/$/, '')}/rest/v1/rpc/erp_schema_version`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: '{}', signal: AbortSignal.timeout(15000),
  })
  if (!response.ok || await response.json() !== EXPECTED_SCHEMA) {
    throw new Error(`Database unavailable or migration ${EXPECTED_SCHEMA} not installed; production build blocked`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.env.VERCEL === '1' || process.env.REQUIRE_SCHEMA_CHECK === '1') {
    let pulled = {}
    try { pulled = parseEnv(await readFile('.vercel/.env.production.local', 'utf8')) } catch { /* native Vercel supplies env */ }
    await checkSchema({ ...pulled, ...process.env })
    console.log('Database migration compatibility verified')
  } else {
    console.log('Local build: database gate runs for production deployments')
  }
}
