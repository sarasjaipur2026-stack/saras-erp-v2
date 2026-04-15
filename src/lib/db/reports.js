import { supabase } from '../supabase'
import { safe } from './core'
import { stockMovements } from './inventory'

// ─── REPORTS ───────────────────────────────────────────────
export const reports = {
  salesRegister: async ({ from, to } = {}) => safe(() => {
    let q = supabase
      .from('orders')
      .select('id, order_number, created_at, status, customer_id, customers(firm_name, gstin), subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, grand_total, advance_paid, balance_due')
      .order('created_at', { ascending: false })
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)
    return q.limit(5000)
  }),

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
    const { data, error } = await safe(() =>
      supabase
        .from('orders')
        .select('customer_id, customers(firm_name, phone), grand_total, advance_paid, balance_due, created_at, status')
        .limit(5000)
    )
    if (error) return { data: null, error }
    const rows = data || []
    const map = new Map()
    for (const o of rows) {
      if (!o.customer_id) continue
      const cur = map.get(o.customer_id) || {
        customer_id: o.customer_id,
        firm_name: o.customers?.firm_name || '—',
        phone: o.customers?.phone || '',
        order_count: 0,
        total_billed: 0,
        total_paid: 0,
        total_outstanding: 0,
        oldest_open: null,
      }
      cur.order_count += 1
      cur.total_billed += Number(o.grand_total || 0)
      cur.total_paid += Number(o.advance_paid || 0)
      cur.total_outstanding += Number(o.balance_due || 0)
      if (Number(o.balance_due || 0) > 0) {
        if (!cur.oldest_open || o.created_at < cur.oldest_open) cur.oldest_open = o.created_at
      }
      map.set(o.customer_id, cur)
    }
    const out = Array.from(map.values())
      .filter(r => r.total_billed > 0)
      .sort((a, b) => b.total_outstanding - a.total_outstanding)
    return { data: out, error: null }
  },

  stockRegister: async () => {
    const { data, error } = await stockMovements.computeBalances()
    if (error) return { data: null, error }
    const filtered = (data || []).filter(b => Math.abs(b.quantity) > 0.001)
    return { data: filtered, error: null }
  },

  purchaseRegister: async ({ from, to } = {}) => safe(() => {
    let q = supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, status, suppliers(name, firm), subtotal, cgst_amount, sgst_amount, igst_amount, grand_total')
      .order('po_date', { ascending: false })
    if (from) q = q.gte('po_date', from)
    if (to) q = q.lte('po_date', to)
    return q.limit(5000)
  }),
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
          totalPayments: 0,
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
