import { supabase } from '../supabase'
import { safe } from './core'

// ─── GLOBAL SEARCH ─────────────────────────────────────────
// Thin wrapper around the `search_entities` Postgres RPC.
// The RPC already unions 9 entity types, applies ranking, and
// returns (entity_type, entity_id, primary_label, secondary, metadata, rank).

export const search = {
  /**
   * Search across all entity types (or a scoped subset).
   * @param {string} q — user's query string
   * @param {Object} [opts]
   * @param {string[]} [opts.types] — limit to specific entity_types, e.g. ['customer','order']
   * @param {number} [opts.maxPer=5] — max rows per entity type
   */
  entities: async (q, { types = null, maxPer = 5 } = {}) => {
    if (!q || !q.trim()) return { data: [], error: null }
    return safe(() =>
      supabase.rpc('search_entities', {
        q: q.trim(),
        types,
        max_per: maxPer,
      })
    )
  },
}

// Map entity_type -> route builder so the palette knows where to navigate on click.
export const ENTITY_ROUTES = {
  customer: (id) => `/customers/${id}`,
  order: (id) => `/orders/${id}`,
  enquiry: (id) => `/enquiries/${id}`,
  invoice: (id) => `/invoices?highlight=${id}`,
  payment: (id) => `/payments?highlight=${id}`,
  delivery: (id) => `/dispatch?highlight=${id}`,
  purchase_order: (id) => `/purchase?highlight=${id}`,
  product: (id) => `/stock?product=${id}`,
}

// Display labels for each entity group heading (matches palette UX in spec section 5.1)
export const ENTITY_LABELS = {
  customer: 'Customers',
  order: 'Orders',
  enquiry: 'Enquiries',
  invoice: 'Invoices',
  payment: 'Payments',
  delivery: 'Deliveries',
  purchase_order: 'Purchase Orders',
  product: 'Products',
}

// Entity group display order — matches spec section 5.2
export const ENTITY_ORDER = [
  'customer', 'order', 'enquiry', 'invoice',
  'payment', 'delivery', 'purchase_order', 'product',
]

// Group a flat result list by entity_type, preserving rank order within each group.
export const groupResults = (rows) => {
  const groups = new Map()
  for (const row of rows || []) {
    if (!groups.has(row.entity_type)) groups.set(row.entity_type, [])
    groups.get(row.entity_type).push(row)
  }
  return ENTITY_ORDER
    .filter((t) => groups.has(t))
    .map((t) => ({ type: t, label: ENTITY_LABELS[t], rows: groups.get(t) }))
}
