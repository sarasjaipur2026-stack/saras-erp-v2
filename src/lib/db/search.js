/**
 * Universal search DAL — wraps the existing search_entities Postgres RPC
 * with a JS-side domain grouping helper.
 *
 * search_entities returns rows of:
 *   { entity_type, entity_id, primary_label, secondary, metadata, rank }
 *
 * We group by domain:
 *   navigate : (synthetic, computed client-side from NAV_ITEMS, not from RPC)
 *   people   : customer, supplier (supplier not in RPC today; Phase 6+ work)
 *   records  : order, invoice, enquiry, payment, delivery, purchase_order
 *   products : product, material (material not in RPC today)
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.3
 */

import { supabase } from '../supabase'
import { safe } from './core'

export const DOMAINS = ['navigate', 'people', 'records', 'products']

const ENTITY_TO_DOMAIN = {
  customer: 'people',
  supplier: 'people',
  order: 'records',
  invoice: 'records',
  enquiry: 'records',
  payment: 'records',
  delivery: 'records',
  purchase_order: 'records',
  product: 'products',
  material: 'products',
}

/**
 * Query search_entities + group by domain.
 *
 * @param {string} q
 * @param {{ types?: string[], maxPer?: number }} opts
 * @returns {Promise<{ data: { navigate: [], people: [], records: [], products: [] } | null, error: any }>}
 */
export async function searchAcrossDomains(q, { types = null, maxPer = 6 } = {}) {
  if (!q || q.length < 1) return { data: emptyGroups(), error: null }

  const { data, error } = await safe(() =>
    supabase.rpc('search_entities', {
      q,
      types,
      max_per: maxPer,
      // p_user_id defaults to auth.uid() server-side
    }),
  )
  if (error) return { data: null, error }

  const grouped = emptyGroups()
  for (const row of data || []) {
    const dom = ENTITY_TO_DOMAIN[row.entity_type] || 'records'
    grouped[dom].push(row)
  }
  return { data: grouped, error: null }
}

function emptyGroups() {
  return { navigate: [], people: [], records: [], products: [] }
}

/**
 * Format a result row's display fields for the palette / drawer.
 *
 * @param {object} row search_entities row
 * @returns {{ title: string, subtitle: string, path: string }}
 */
export function formatResult(row) {
  const meta = row.metadata || {}
  let subtitle = row.secondary || ''
  let path = '#'

  switch (row.entity_type) {
    case 'customer':
      subtitle = [meta.city, meta.state, meta.gstin].filter(Boolean).join(' · ')
      path = `/masters/customers?focus=${row.entity_id}`
      break
    case 'supplier':
      subtitle = [meta.city, meta.gstin].filter(Boolean).join(' · ')
      path = `/masters/suppliers?focus=${row.entity_id}`
      break
    case 'order':
      subtitle = `${meta.order_number || row.secondary} · ${meta.status || ''} · ₹${fmt(meta.grand_total)}`
      path = `/orders/${row.entity_id}`
      break
    case 'invoice':
      subtitle = `${meta.invoice_number || row.secondary} · ${meta.status || ''} · ₹${fmt(meta.grand_total)}`
      path = `/invoices?focus=${row.entity_id}`
      break
    case 'enquiry':
      subtitle = `${meta.enquiry_number || row.secondary} · ${meta.status || ''}`
      path = `/enquiries/${row.entity_id}`
      break
    case 'payment':
      subtitle = `${meta.payment_mode || ''} · ₹${fmt(meta.amount)} · ${meta.payment_date || ''}`
      path = `/payments?focus=${row.entity_id}`
      break
    case 'delivery':
      subtitle = `${meta.challan_number || row.secondary} · ${meta.delivery_date || ''}`
      path = `/dispatch?focus=${row.entity_id}`
      break
    case 'purchase_order':
      subtitle = `${meta.po_number || row.secondary} · ${meta.status || ''} · ₹${fmt(meta.grand_total)}`
      path = `/purchase?focus=${row.entity_id}`
      break
    case 'product':
      subtitle = [meta.category, meta.hsn_code, meta.default_rate ? `₹${meta.default_rate}` : null].filter(Boolean).join(' · ')
      path = `/masters/products?focus=${row.entity_id}`
      break
    default:
      path = '#'
  }
  return { title: row.primary_label || row.entity_type, subtitle, path }
}

function fmt(v) {
  if (v == null) return ''
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}
