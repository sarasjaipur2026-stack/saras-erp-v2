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
// Helper: count orders by status using head:true (no row data transferred)
const countByStatus = (status) =>
  supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', status)

export const stats = {
  getDashboard: async () => {
    try {
      const statuses = ['draft', 'booking', 'approved', 'production', 'qc', 'dispatch', 'completed', 'cancelled']

      const queries = Promise.all([
        // Total order count
        supabase.from('orders').select('id', { count: 'exact', head: true }),
        // Per-status counts (lightweight head-only queries)
        ...statuses.map(s => countByStatus(s)),
        // Financial totals — only fetch the two numeric columns, no full rows
        supabase.from('orders').select('grand_total, balance_due')
          .not('status', 'in', '("cancelled")').limit(5000),
        // Overdue: has balance and not completed/cancelled
        supabase.from('orders').select('id', { count: 'exact', head: true })
          .gt('balance_due', 0)
          .not('status', 'in', '("completed","cancelled")'),
        // New enquiries count
        supabase.from('enquiries').select('id', { count: 'exact', head: true }).eq('status', 'new'),
        // Customers count
        supabase.from('customers').select('id', { count: 'exact', head: true }),
      ])

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Dashboard query timeout')), 8000)
      )
      const results = await Promise.race([queries, timeout])

      // Unpack results
      const totalOrdersRes = results[0]
      const statusResults = results.slice(1, 1 + statuses.length)
      const financialsRes = results[1 + statuses.length]
      const overdueRes = results[2 + statuses.length]
      const enquiriesRes = results[3 + statuses.length]
      const customersRes = results[4 + statuses.length]

      const statusCounts = {}
      statuses.forEach((s, i) => { statusCounts[s] = statusResults[i].count || 0 })

      const finRows = financialsRes.data || []
      const totalRevenue = finRows.reduce((sum, o) => sum + (o.grand_total || 0), 0)
      const outstandingBalance = finRows.reduce((sum, o) => sum + (o.balance_due || 0), 0)

      const pendingOrders = (totalOrdersRes.count || 0)
        - (statusCounts.completed || 0)
        - (statusCounts.cancelled || 0)
        - (statusCounts.draft || 0)

      return {
        totalOrders: totalOrdersRes.count || 0,
        newEnquiries: enquiriesRes.count || 0,
        pendingOrders,
        urgentOrders: overdueRes.count || 0,
        totalCustomers: customersRes.count || 0,
        statusCounts,
        financialTotals: {
          totalRevenue,
          outstandingBalance,
          totalPayments: 0,
        },
        overdueCount: overdueRes.count || 0,
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
