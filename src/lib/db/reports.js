import { supabase } from '../supabase'
import { aggregateCustomerOutstanding, isMissingRpcError } from '../reportFallback'
import { fetchAll, safe } from './core'
import { stockMovements } from './inventory'

const legacySalesRegister = ({ from, to } = {}) => safe(() => fetchAll(() => {
  let query = supabase
    .from('orders')
    .select('*, customers(firm_name, gstin)')
    .order('created_at', { ascending: false })
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)
  return query
}))

const legacyPurchaseRegister = ({ from, to } = {}) => safe(() => fetchAll(() => {
  let query = supabase
    .from('purchase_orders')
    .select('*, suppliers(name, firm, gstin)')
    .order('po_date', { ascending: false })
  if (from) query = query.gte('po_date', from)
  if (to) query = query.lte('po_date', to)
  return query
}))

// ─── REPORTS ───────────────────────────────────────────────
export const reports = {
  salesRegister: async ({ from, to } = {}) => {
    const result = await safe(() => supabase.rpc('report_sales_register', {
      p_from: from || null,
      p_to: to || null,
    }))
    return isMissingRpcError(result?.error) ? legacySalesRegister({ from, to }) : result
  },

  gstSummary: async ({ from, to } = {}) => {
    const { data, error } = await reports.salesRegister({ from, to })
    if (error) return { data: null, error }
    const rows = data || []
    const summary = {
      order_count: rows.length,
      total_taxable: rows.reduce((s, o) => s + Number(o.taxable_amount || o.subtotal || 0), 0),
      total_cgst: rows.reduce((s, o) => s + Number(o.cgst_amount || 0), 0),
      total_sgst: rows.reduce((s, o) => s + Number(o.sgst_amount || 0), 0),
      total_igst: rows.reduce((s, o) => s + Number(o.igst_amount || 0), 0),
      total_grand: rows.reduce((s, o) => s + Number(o.grand_total || 0), 0),
    }
    summary.total_tax = summary.total_cgst + summary.total_sgst + summary.total_igst
    const monthly = new Map()
    for (const o of rows) {
      const key = (o.created_at || '').slice(0, 7)
      const cur = monthly.get(key) || { month: key, count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, grand: 0 }
      cur.count += 1
      cur.taxable += Number(o.taxable_amount || o.subtotal || 0)
      cur.cgst += Number(o.cgst_amount || 0)
      cur.sgst += Number(o.sgst_amount || 0)
      cur.igst += Number(o.igst_amount || 0)
      cur.grand += Number(o.grand_total || 0)
      monthly.set(key, cur)
    }
    return {
      data: { summary, monthly: Array.from(monthly.values()).sort((a, b) => b.month.localeCompare(a.month)) },
      error: null,
    }
  },

  customerOutstanding: async () => {
    const result = await safe(() => supabase.rpc('report_customer_outstanding'))
    if (!isMissingRpcError(result?.error)) return result

    const fallback = await safe(() => fetchAll(() => supabase
      .from('orders')
      .select('customer_id, grand_total, advance_paid, balance_due, created_at, customers(firm_name, phone)')
      .order('created_at', { ascending: false })
    ))
    if (fallback.error) return fallback
    return { data: aggregateCustomerOutstanding(fallback.data), error: null }
  },

  stockRegister: async () => {
    const { data, error } = await stockMovements.computeBalances()
    if (error) return { data: null, error }
    const filtered = (data || []).filter(b => Math.abs(b.quantity) > 0.001)
    return { data: filtered, error: null }
  },

  purchaseRegister: async ({ from, to } = {}) => {
    const result = await safe(() => supabase.rpc('report_purchase_register', {
      p_from: from || null,
      p_to: to || null,
    }))
    return isMissingRpcError(result?.error) ? legacyPurchaseRegister({ from, to }) : result
  },
}

// ─── DASHBOARD STATS ───────────────────────────────────────
// Single RPC round-trip. Postgres aggregates counts/sums server-side
// instead of sending thousands of rows to the browser.
export const stats = {
  getDashboard: async () => {
    try {
      const { data, error } = await supabase.rpc('dashboard_stats')
      if (error) throw error
      const d = data || {}
      return {
        totalOrders: d.total_orders || 0,
        newEnquiries: d.new_enquiries || 0,
        pendingOrders: d.pending_orders || 0,
        urgentOrders: d.urgent_orders || 0,
        totalCustomers: d.total_customers || 0,
        statusCounts: d.status_counts || {},
        financialTotals: {
          totalRevenue: Number(d.total_revenue || 0),
          outstandingBalance: Number(d.outstanding_balance || 0),
          totalPayments: Number(d.total_payments || 0),
        },
        overdueCount: d.overdue_count || 0,
      }
    } catch (error) {
      return {
        totalOrders: 0,
        newEnquiries: 0,
        totalCustomers: 0,
        statusCounts: {},
        financialTotals: { totalRevenue: 0, outstandingBalance: 0, totalPayments: 0 },
        overdueCount: 0,
        error,
      }
    }
  },
}
