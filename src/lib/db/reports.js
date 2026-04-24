import { supabase } from '../supabase'
import { fetchAllPaged } from './core'
import { stockMovements } from './inventory'

// ─── REPORTS ───────────────────────────────────────────────
export const reports = {
  salesRegister: async ({ from, to } = {}) => fetchAllPaged((lo, hi) => {
    let q = supabase
      .from('orders')
      .select('id, order_number, created_at, status, customer_id, customers(firm_name, gstin), subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, grand_total, advance_paid, balance_due')
      .order('created_at', { ascending: false })
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)
    return q.range(lo, hi)
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
    const { data, error } = await fetchAllPaged((lo, hi) =>
      supabase
        .from('orders')
        .select('customer_id, customers(firm_name, phone), grand_total, advance_paid, balance_due, created_at, status')
        .order('created_at', { ascending: false })
        .range(lo, hi)
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

  purchaseRegister: async ({ from, to } = {}) => fetchAllPaged((lo, hi) => {
    let q = supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, status, suppliers(name, firm), subtotal, cgst_amount, sgst_amount, igst_amount, grand_total')
      .order('po_date', { ascending: false })
    if (from) q = q.gte('po_date', from)
    if (to) q = q.lte('po_date', to)
    return q.range(lo, hi)
  }),

  // Yarn consumption vs standard.
  // Actual = stock_movements kind='out' grouped by yarn_type_id in period.
  // Standard (expected) = production_plans.completed_qty in same period
  //   (1:1 nominal — real waste shows up as variance). If a plan ties to a
  //   material_id, the expected is attributed to that yarn; otherwise lumped
  //   into "unallocated". Variance_pct = (actual - std) / std * 100.
  yarnConsumption: async ({ from, to } = {}) => {
    const fromISO = from || null
    const toISO = to || null

    // Actual consumption — stock out rows for yarn_type_id
    const { data: movements, error: mErr } = await fetchAllPaged((lo, hi) => {
      let q = supabase
        .from('stock_movements')
        .select('yarn_type_id, quantity, unit, event_date, kind')
        .eq('kind', 'out')
        .not('yarn_type_id', 'is', null)
        .order('event_date', { ascending: false })
      if (fromISO) q = q.gte('event_date', fromISO)
      if (toISO) q = q.lte('event_date', toISO)
      return q.range(lo, hi)
    })
    if (mErr) return { data: null, error: mErr }

    // Standard consumption — production_plans completed in period,
    // attributed by material_id (≈ yarn for most production plans).
    const { data: plans, error: pErr } = await fetchAllPaged((lo, hi) => {
      let q = supabase
        .from('production_plans')
        .select('material_id, completed_qty, planned_qty, actual_end')
        .order('actual_end', { ascending: false })
      if (fromISO) q = q.gte('actual_end', fromISO)
      if (toISO) q = q.lte('actual_end', toISO)
      return q.range(lo, hi)
    })
    if (pErr) return { data: null, error: pErr }

    // Yarn name lookup
    const { data: yarnRows } = await supabase
      .from('yarn_types')
      .select('id, name, default_rate_per_kg')
      .limit(500)
    const yarnMap = new Map((yarnRows || []).map((y) => [y.id, y]))

    const byYarn = new Map()
    for (const m of movements || []) {
      const id = m.yarn_type_id
      if (!id) continue
      const y = yarnMap.get(id)
      const cur = byYarn.get(id) || {
        yarn_type_id: id,
        yarn_name: y?.name || '—',
        rate_per_kg: Number(y?.default_rate_per_kg || 0),
        actual_qty: 0,
        std_qty: 0,
        variance_qty: 0,
        variance_pct: 0,
        actual_value: 0,
      }
      cur.actual_qty += Number(m.quantity || 0)
      byYarn.set(id, cur)
    }
    for (const p of plans || []) {
      // NOTE: material_id is expected to be a yarn_type_id in current schema.
      // If a plan isn't tied to a yarn, it's skipped here. Fine for MVP.
      const id = p.material_id
      if (!id) continue
      const cur = byYarn.get(id) || {
        yarn_type_id: id,
        yarn_name: yarnMap.get(id)?.name || '—',
        rate_per_kg: Number(yarnMap.get(id)?.default_rate_per_kg || 0),
        actual_qty: 0,
        std_qty: 0,
        variance_qty: 0,
        variance_pct: 0,
        actual_value: 0,
      }
      cur.std_qty += Number(p.completed_qty || 0)
      byYarn.set(id, cur)
    }

    const rows = Array.from(byYarn.values()).map((r) => {
      const variance = r.actual_qty - r.std_qty
      const variancePct = r.std_qty > 0 ? (variance / r.std_qty) * 100 : (r.actual_qty > 0 ? 100 : 0)
      return {
        ...r,
        variance_qty: variance,
        variance_pct: variancePct,
        actual_value: r.actual_qty * r.rate_per_kg,
      }
    }).sort((a, b) => b.actual_qty - a.actual_qty)

    const totals = rows.reduce(
      (t, r) => ({
        actual: t.actual + r.actual_qty,
        std: t.std + r.std_qty,
        value: t.value + r.actual_value,
      }),
      { actual: 0, std: 0, value: 0 },
    )
    totals.variance = totals.actual - totals.std
    totals.variance_pct = totals.std > 0 ? (totals.variance / totals.std) * 100 : 0

    return { data: { rows, totals }, error: null }
  },

  // Machine-hour utilisation — production_plans aggregated by machine in period.
  // Hours_run = sum(actual_end - actual_start) where both present.
  // Hours_available = working_days × 8 × machine_count (simple assumption).
  machineUtilisation: async ({ from, to } = {}) => {
    const fromISO = from || null
    const toISO = to || null
    const { data: plans, error } = await fetchAllPaged((lo, hi) => {
      let q = supabase
        .from('production_plans')
        .select('machine_id, planned_start, planned_end, actual_start, actual_end, planned_qty, completed_qty, status')
        .not('machine_id', 'is', null)
        .order('actual_start', { ascending: false })
      if (fromISO) q = q.gte('actual_start', fromISO)
      if (toISO) q = q.lte('actual_start', toISO)
      return q.range(lo, hi)
    })
    if (error) return { data: null, error }

    const { data: machineRows } = await supabase
      .from('machines')
      .select('id, name, machine_count, default_speed_m_per_min')
      .limit(500)
    const machineMap = new Map((machineRows || []).map((m) => [m.id, m]))

    const byMachine = new Map()
    for (const p of plans || []) {
      const id = p.machine_id
      if (!id) continue
      const m = machineMap.get(id)
      const cur = byMachine.get(id) || {
        machine_id: id,
        machine_name: m?.name || '—',
        machine_count: Number(m?.machine_count || 1),
        runs: 0,
        completed_qty: 0,
        planned_qty: 0,
        hours_run: 0,
      }
      const start = p.actual_start ? new Date(p.actual_start).getTime() : null
      const end = p.actual_end ? new Date(p.actual_end).getTime() : null
      if (start && end && end > start) {
        cur.hours_run += (end - start) / (1000 * 60 * 60)
      }
      cur.runs += 1
      cur.completed_qty += Number(p.completed_qty || 0)
      cur.planned_qty += Number(p.planned_qty || 0)
      byMachine.set(id, cur)
    }

    // Window size — difference between from/to, default to 30 days
    const fromDate = fromISO ? new Date(fromISO) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const toDate = toISO ? new Date(toISO) : new Date()
    const spanDays = Math.max(1, Math.ceil((toDate - fromDate) / (24 * 60 * 60 * 1000)))
    // Assume 6-day week, 8h shift
    const workingDays = Math.ceil(spanDays * (6 / 7))
    const hoursPerMachine = workingDays * 8

    const rows = Array.from(byMachine.values()).map((r) => {
      const available = hoursPerMachine * Math.max(1, r.machine_count)
      const utilPct = available > 0 ? Math.min(100, (r.hours_run / available) * 100) : 0
      const efficiencyPct = r.planned_qty > 0 ? (r.completed_qty / r.planned_qty) * 100 : 0
      return {
        ...r,
        hours_available: available,
        util_pct: utilPct,
        efficiency_pct: efficiencyPct,
      }
    }).sort((a, b) => b.util_pct - a.util_pct)

    return {
      data: {
        rows,
        spanDays,
        workingDays,
        from: fromDate.toISOString().slice(0, 10),
        to: toDate.toISOString().slice(0, 10),
      },
      error: null,
    }
  },

  // Ageing analysis — open invoices bucketed by days-since-due.
  // Uses payment_due_date when available, falls back to created_at + 30 days.
  // Returns per-customer rows with buckets 0-30, 31-60, 61-90, 90+.
  ageing: async ({ asOf } = {}) => {
    const { data, error } = await fetchAllPaged((lo, hi) =>
      supabase
        .from('orders')
        .select('id, order_number, customer_id, customers(firm_name, phone, credit_limit, credit_hold), grand_total, advance_paid, balance_due, created_at, payment_due_date, status')
        .gt('balance_due', 0)
        .not('status', 'in', '(cancelled)')
        .order('created_at', { ascending: true })
        .range(lo, hi),
    )
    if (error) return { data: null, error }
    const refDate = asOf ? new Date(asOf) : new Date()
    const refTs = refDate.getTime()
    const DAY_MS = 24 * 60 * 60 * 1000
    const byCustomer = new Map()
    for (const o of data || []) {
      const bal = Number(o.balance_due || 0)
      if (bal <= 0) continue
      const due = o.payment_due_date
        ? new Date(o.payment_due_date).getTime()
        : new Date(o.created_at || Date.now()).getTime() + 30 * DAY_MS
      const daysPast = Math.max(0, Math.floor((refTs - due) / DAY_MS))
      let bucket
      if (daysPast <= 30) bucket = 'b0_30'
      else if (daysPast <= 60) bucket = 'b31_60'
      else if (daysPast <= 90) bucket = 'b61_90'
      else bucket = 'b90plus'

      const cid = o.customer_id || '(unknown)'
      const cur = byCustomer.get(cid) || {
        customer_id: cid,
        firm_name: o.customers?.firm_name || '—',
        phone: o.customers?.phone || '',
        credit_limit: Number(o.customers?.credit_limit || 0),
        credit_hold: !!o.customers?.credit_hold,
        invoice_count: 0,
        total_outstanding: 0,
        oldest_days_past: 0,
        b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0,
      }
      cur.invoice_count += 1
      cur.total_outstanding += bal
      cur[bucket] += bal
      if (daysPast > cur.oldest_days_past) cur.oldest_days_past = daysPast
      byCustomer.set(cid, cur)
    }
    const rows = Array.from(byCustomer.values()).sort(
      (a, b) => b.b90plus - a.b90plus || b.total_outstanding - a.total_outstanding,
    )
    const totals = rows.reduce(
      (t, r) => ({
        total: t.total + r.total_outstanding,
        b0_30: t.b0_30 + r.b0_30,
        b31_60: t.b31_60 + r.b31_60,
        b61_90: t.b61_90 + r.b61_90,
        b90plus: t.b90plus + r.b90plus,
      }),
      { total: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 },
    )
    return { data: { rows, totals, asOf: refDate.toISOString().slice(0, 10) }, error: null }
  },
}

// ─── DASHBOARD STATS ───────────────────────────────────────
export const stats = {
  getDashboard: async () => {
    try {
      // Race against a 12s timeout so the dashboard never shows an infinite spinner
      const queries = Promise.all([
        fetchAllPaged((lo, hi) => supabase.from('orders').select('id, status, grand_total, balance_due, payment_due_date, created_at').range(lo, hi)),
        supabase.from('enquiries').select('id, status', { count: 'exact' }).eq('status', 'new').limit(1000),
        supabase.from('customers').select('id', { count: 'exact', head: true }),
        fetchAllPaged((lo, hi) => supabase.from('payments').select('amount').range(lo, hi)),
      ])
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Dashboard query timeout')), 12000)
      )
      const [ordersRes, enquiriesRes, customersRes, paymentsRes] = await Promise.race([queries, timeout])

      const orderData = ordersRes.data || []
      const paymentsData = paymentsRes.data || []

      const statusCounts = {
        draft: orderData.filter(o => o.status === 'draft').length,
        booking: orderData.filter(o => o.status === 'booking').length,
        approved: orderData.filter(o => o.status === 'approved').length,
        production: orderData.filter(o => o.status === 'production').length,
        qc: orderData.filter(o => o.status === 'qc').length,
        dispatch: orderData.filter(o => o.status === 'dispatch').length,
        completed: orderData.filter(o => o.status === 'completed').length,
        cancelled: orderData.filter(o => o.status === 'cancelled').length,
      }

      const totalRevenue = orderData.reduce((sum, o) => sum + (o.grand_total || 0), 0)
      const outstandingBalance = orderData.reduce((sum, o) => sum + (o.balance_due || 0), 0)
      const totalPayments = paymentsData.reduce((sum, p) => sum + (p.amount || 0), 0)

      // Overdue = open order, balance still due, AND past its payment_due_date.
      // Missing due_date falls back to 30 days from created_at (defensive — the
      // old logic treated *every* unpaid open order as overdue, which is wrong
      // and made the Dashboard KPI useless).
      const todayMs = Date.now()
      const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
      const isOverdue = (o) => {
        if (['completed', 'cancelled'].includes(o.status)) return false
        if (Number(o.balance_due || 0) <= 0) return false
        let dueMs
        if (o.payment_due_date) {
          dueMs = new Date(o.payment_due_date).getTime()
        } else if (o.created_at) {
          dueMs = new Date(o.created_at).getTime() + THIRTY_DAYS_MS
        } else {
          return false
        }
        return Number.isFinite(dueMs) && todayMs > dueMs
      }
      const overdueCount = orderData.filter(isOverdue).length

      const pendingOrders = orderData.filter(
        o => !['completed', 'cancelled', 'draft'].includes(o.status)
      ).length

      return {
        totalOrders: orderData.length,
        newEnquiries: enquiriesRes.count || (enquiriesRes.data || []).length,
        pendingOrders,
        urgentOrders: overdueCount,
        totalCustomers: customersRes.count || 0,
        statusCounts,
        financialTotals: {
          totalRevenue,
          outstandingBalance,
          totalPayments,
        },
        overdueCount,
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
