import { supabase } from '../supabase'
import { ensureFreshSession } from '../authGate'

// ─── GENERIC CRUD FACTORY ──────────────────────────────────
// Creates list/get/create/update/delete for ANY Supabase table.
// Usage: const customers = createTable('customers', { orderBy: 'created_at' })

const REQUEST_TIMEOUT_MS = 30000

// Safety cap — reports should warn beyond this and switch to server-side RPC
const MAX_PAGED_ROWS = 50000
const PAGE_SIZE = 1000

/**
 * Paginates through a Supabase query using .range() to bypass the 1000-row default.
 * buildQuery(from, to) must return a chainable query with identical filters each call.
 * Stops at MAX_PAGED_ROWS (50k) safety cap.
 */
export const fetchAllPaged = async (buildQuery) => {
  const all = []
  let from = 0
  while (from < MAX_PAGED_ROWS) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await buildQuery(from, to)
    if (error) return { data: null, error }
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  const truncated = all.length >= MAX_PAGED_ROWS
  return { data: all, error: null, truncated }
}

export const safe = async (fn) => {
  // Every DB call awaits the auth gate first. Warm path = μs; cold path = one
  // coalesced refresh shared by all concurrent callers. See src/lib/authGate.js.
  try {
    await ensureFreshSession()
  } catch {
    // Refresh failure is non-fatal here — the query will bubble the real error
    // (e.g. RLS rejection) instead of a generic session error.
  }
  let timeoutId
  try {
    const result = await Promise.race([
      fn(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Request timed out after 30s — check your connection or Supabase project status')),
          REQUEST_TIMEOUT_MS,
        )
      }),
    ])
    return result
  } catch (error) {
    return { data: null, error }
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

export function createTable(table, opts = {}) {
  const { orderBy = 'created_at', orderAsc = false, select = '*', ownerFilter = true } = opts

  return {
    list: async (userId) => safe(() => {
      let q = supabase.from(table).select(select)
      if (ownerFilter && userId) q = q.eq('user_id', userId)
      return q.order(orderBy, { ascending: orderAsc }).limit(1000)
    }),

    getAll: async () => safe(() =>
      supabase.from(table).select(select).order(orderBy, { ascending: orderAsc }).limit(1000)
    ),

    get: async (id) => safe(() =>
      supabase.from(table).select(select).eq('id', id).single()
    ),

    create: async (data) => safe(() =>
      supabase.from(table).insert(Array.isArray(data) ? data : [data]).select().single()
    ),

    createMany: async (items) => safe(() =>
      supabase.from(table).insert(items).select()
    ),

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
