import { supabase } from '../supabase'
import { safe } from './core'

// ─── GLOBAL SEARCH ─────────────────────────────────────────
// Thin wrapper around the `search_entities` Postgres RPC.
// The RPC already unions 9 entity types, applies ranking, and
// returns (entity_type, entity_id, primary_label, secondary, metadata, rank).

// Short-code aliases — typing `ord 0412` in Cmd+K should scope the search
// to orders and turn "0412" into the identifier match. Also handles forms
// like `ord-0412`, `ord/0412`, `ORD-25-26-0412`, etc.
//
// Returned { types, cleanedQuery } is fed into search_entities so results
// rank the exact identifier hit first.
const ALIAS_TYPE = {
  ord: 'order', order: 'order',
  enq: 'enquiry', enquiry: 'enquiry',
  inv: 'invoice', invoice: 'invoice',
  pay: 'payment', payment: 'payment',
  chn: 'delivery', challan: 'delivery', dispatch: 'delivery',
  po:  'purchase_order', purchase: 'purchase_order',
  prod: 'product', product: 'product',
  cust: 'customer', customer: 'customer',
}

const ALIAS_RE = /^(ord|order|enq|enquiry|inv|invoice|pay|payment|chn|challan|dispatch|po|purchase|prod|product|cust|customer)[\s:/-]+(.+)$/i

const parseAlias = (q) => {
  const m = ALIAS_RE.exec(q.trim())
  if (!m) return null
  const alias = m[1].toLowerCase()
  const rest = m[2].trim()
  return {
    type: ALIAS_TYPE[alias],
    cleanedQuery: rest,
  }
}

export const search = {
  /**
   * Search across all entity types (or a scoped subset).
   * If the query starts with a known short-code alias (`ord`, `inv`, `enq`,
   * `chn`, `pay`, `po`, `prod`, `cust`), the rest of the query is treated
   * as the identifier and search is scoped to that entity type only.
   *
   * @param {string} q — user's query string
   * @param {Object} [opts]
   * @param {string[]} [opts.types] — limit to specific entity_types
   * @param {number} [opts.maxPer=5] — max rows per entity type
   */
  entities: async (q, { types = null, maxPer = 5 } = {}) => {
    if (!q || !q.trim()) return { data: [], error: null }
    const alias = parseAlias(q)
    const finalTypes = types ?? (alias ? [alias.type] : null)
    const finalQuery = alias ? alias.cleanedQuery : q.trim()
    const finalMax = alias ? 10 : maxPer   // when scoped, show more
    return safe(() =>
      supabase.rpc('search_entities', {
        q: finalQuery,
        types: finalTypes,
        max_per: finalMax,
      })
    )
  },
  parseAlias,   // exposed for tests
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
