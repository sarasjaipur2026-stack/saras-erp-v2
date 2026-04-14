import { supabase } from '../supabase'

// ─── GENERIC CRUD FACTORY ──────────────────────────────────
// Creates list/get/create/update/delete for ANY Supabase table.
// Usage: const customers = createTable('customers', { orderBy: 'created_at' })

const REQUEST_TIMEOUT_MS = 15000

const safeOnce = async (fn) => {
  let timeoutId
  const result = await Promise.race([
    fn(),
    new Promise((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Request timed out — check your connection')),
        REQUEST_TIMEOUT_MS,
      )
    }),
  ])
  if (timeoutId) clearTimeout(timeoutId)
  return result
}

export const safe = async (fn) => {
  try {
    return await safeOnce(fn)
  } catch (firstErr) {
    // One automatic retry after a short pause (handles stale connections after idle)
    try {
      await new Promise(r => setTimeout(r, 800))
      return await safeOnce(fn)
    } catch {
      return { data: null, error: firstErr }
    }
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
  if (Array.isArray(data)) return data.map(row => ({ user_id: uid, ...row }))
  return { user_id: uid, ...data }
}

// Page through all rows in chunks. PostgREST enforces a server-side
// `db-max-rows` cap (default 1000 on Supabase) that silently truncates
// any `.limit()` above it. We loop with `.range(from, to)` until we
// see a short page or cross a hard safety cap, so masters pages
// (which filter client-side) always get the full dataset.
const PAGE_SIZE = 1000
const HARD_CAP = 50000

const fetchAll = async (buildQuery) => {
  const all = []
  for (let from = 0; from < HARD_CAP; from += PAGE_SIZE) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await buildQuery().range(from, to)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
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
