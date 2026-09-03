import { supabase } from '../supabase'
import { ensureFreshSession } from '../authGate'
import { isJwtStaleError } from './requestPolicy'

// ─── GENERIC CRUD FACTORY ──────────────────────────────────
// Creates list/get/create/update/delete for ANY Supabase table.
// Usage: const customers = createTable('customers', { orderBy: 'created_at' })

const REQUEST_TIMEOUT_MS = 15000

const safeOnce = async (fn) => {
  let timeoutId
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Request timed out — check your connection')),
          REQUEST_TIMEOUT_MS,
        )
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

// Detects PostgREST / Supabase Auth errors that mean "your JWT is stale".
// On background-tab throttled Chrome, auto-refresh timers don't fire — so
// users coming back after idle hit 401 on their first click. This function
// is used by `safe()` to silently refresh + retry.
// Coalesce concurrent refresh calls so 10 parallel queries getting 401
// don't trigger 10 refresh RPCs.
let inFlightRefresh = null
const refreshSessionOnce = () => {
  if (!inFlightRefresh) {
    inFlightRefresh = supabase.auth.refreshSession()
      .catch(() => null)
      .finally(() => { inFlightRefresh = null })
  }
  return inFlightRefresh
}

export const safe = async (fn) => {
  // GATE: block until the JWT is guaranteed fresh. Coalesced across all
  // concurrent callers — 10 parallel queries share one refresh. This is
  // the authoritative fix for the post-idle lag: it eliminates the race
  // where a user's click fires a query with a stale JWT while a separate
  // refresh is in flight.
  try {
    await ensureFreshSession()
    const result = await safeOnce(fn)
    // Belt-and-braces: if the gate missed (e.g. server clock skew, token
    // rotated mid-flight), still self-heal on 401.
    if (result && result.error && isJwtStaleError(result.error)) {
      await refreshSessionOnce()
      return await safeOnce(fn)
    }
    return result
  } catch (firstErr) {
    if (isJwtStaleError(firstErr)) {
      await refreshSessionOnce()
      try { return await safeOnce(fn) }
      catch { return { data: null, error: firstErr } }
    }
    // Never retry an ambiguous network/timeout failure here. The server may
    // already have committed a write even though its response was lost.
    return { data: null, error: firstErr }
  }
}

// Helper: get current auth user id (cached per call via getSession)
const getUid = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user?.id || null
  } catch { return null }
}

// Inject user_id into row data if the table uses owner filtering
const withUid = async (data, shouldInject) => {
  if (!shouldInject) return data
  const uid = await getUid()
  if (!uid) return data
  if (Array.isArray(data)) return data.map(row => ({ ...row, user_id: uid }))
  return { ...data, user_id: uid }
}

// Page through all rows in chunks. PostgREST enforces a server-side
// `db-max-rows` cap (default 1000 on Supabase) that silently truncates
// any `.limit()` above it. We loop with `.range(from, to)` until we
// see a short page or cross a hard safety cap, so masters pages
// (which filter client-side) always get the full dataset.
const PAGE_SIZE = 1000
const HARD_CAP = 50000

export const fetchAll = async (buildQuery) => {
  const all = []
  for (let from = 0; from < HARD_CAP; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await buildQuery().range(from, to)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    if (all.length >= HARD_CAP) {
      return {
        data: null,
        error: new Error(`Result exceeds the ${HARD_CAP.toLocaleString('en-IN')} row safety limit. Narrow the query or use a server-side report.`),
      }
    }
  }
  return { data: all, error: null }
}

export function createTable(table, opts = {}) {
  const { orderBy = 'created_at', orderAsc = false, select = '*', ownerFilter = true } = opts

  return {
    list: async (userId) => safe(() => fetchAll(() => {
      let q = supabase.from(table).select(select)
      if (ownerFilter && userId) q = q.eq('user_id', userId)
      return q.order(orderBy, { ascending: orderAsc })
    })),

    getAll: async () => safe(() => fetchAll(() =>
      supabase.from(table).select(select).order(orderBy, { ascending: orderAsc })
    )),

    getPage: async ({ page = 0, pageSize = 50, userId = null } = {}) => safe(() => {
      const from = Math.max(0, page) * pageSize
      const to = from + pageSize - 1
      let q = supabase.from(table).select(select, { count: 'exact' })
      if (ownerFilter && userId) q = q.eq('user_id', userId)
      return q.order(orderBy, { ascending: orderAsc }).range(from, to)
    }),

    get: async (id) => safe(() =>
      supabase.from(table).select(select).eq('id', id).single()
    ),

    create: async (data) => {
      const row = await withUid(data, ownerFilter)
      return safe(() =>
        supabase.from(table).insert(Array.isArray(row) ? row : [row]).select().single()
      )
    },

    createMany: async (items) => {
      const rows = await withUid(items, ownerFilter)
      return safe(() =>
        supabase.from(table).insert(rows).select()
      )
    },

    update: async (id, data) => safe(() =>
      supabase.from(table).update(data).eq('id', id).select().single()
    ),

    delete: async (id) => safe(() =>
      supabase.from(table).delete().eq('id', id)
    ),

    // Convenience: query with custom filters
    query: (builder) => safe(() => builder(supabase.from(table))),
  }
}
