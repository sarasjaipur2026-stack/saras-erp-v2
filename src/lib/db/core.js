import { supabase, withRetry } from '../supabase'

// ─── GENERIC CRUD FACTORY ──────────────────────────────────
// Creates list/get/create/update/delete for ANY Supabase table.
// Usage: const customers = createTable('customers', { orderBy: 'created_at' })

const REQUEST_TIMEOUT_MS = 15000

export const safe = async (fn) => {
  let timeoutId
  try {
    const result = await Promise.race([
      withRetry(fn),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Request timed out after 15s — check your connection or Supabase project status')),
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
