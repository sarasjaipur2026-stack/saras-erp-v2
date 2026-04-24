import { useState, useEffect, useMemo, useCallback } from 'react'
import { reports } from '../../lib/db'
import { Button, Input, Badge, PaginationBar } from '../../components/ui'
import {
  BarChart3, Calendar, Download, RefreshCw, FileText,
  TrendingUp, Receipt, Users, Package, ShoppingBag, Clock,
  Activity, Gauge,
} from 'lucide-react'

// ─── HELPERS ─────────────────────────────────────────────────
import { fmt, fmtMoney, fmtDate } from '../../lib/format'
import { todayIST, toISTDate, firstOfMonthIST, startOfFYIST } from '../../lib/dates'
import { usePagination } from '../../hooks/usePagination'
import { useStickyState } from '../../hooks/useStickyState'
const fmtMonth = (m) => {
  if (!m) return '—'
  const [y, mm] = m.split('-')
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}
const daysAgo = (iso) => {
  if (!iso) return 0
  const ms = Date.now() - new Date(iso).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

// Date range presets — all IST-based so the window aligns with the operator's
// wall clock, not UTC.
const todayISO = () => todayIST()
const monthsAgo = (n) => {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return toISTDate(d)
}
const startOfMonth = () => firstOfMonthIST()
const startOfFy = () => startOfFYIST()

const PRESETS = [
  { key: 'thisMonth', label: 'This Month', from: startOfMonth, to: todayISO },
  { key: 'last30', label: 'Last 30 Days', from: () => monthsAgo(1), to: todayISO },
  { key: 'last90', label: 'Last 90 Days', from: () => monthsAgo(3), to: todayISO },
  { key: 'fy', label: 'This FY', from: startOfFy, to: todayISO },
  { key: 'all', label: 'All Time', from: () => null, to: () => null },
]

// CSV download (no deps — small enough to inline)
const toCsv = (rows, columns) => {
  const escape = (v) => {
    if (v == null) return ''
    const s = String(v)
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
    return s
  }
  const header = columns.map(c => escape(c.label)).join(',')
  const body = rows.map(r => columns.map(c => escape(c.value(r))).join(',')).join('\n')
  return `${header}\n${body}`
}
const downloadCsv = (filename, csv) => {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─── REPORT DEFINITIONS ──────────────────────────────────────
const REPORT_TABS = [
  { key: 'sales', label: 'Sales Register', icon: Receipt, hasDateRange: true },
  { key: 'gst', label: 'GST Summary', icon: TrendingUp, hasDateRange: true },
  { key: 'outstanding', label: 'Customer Outstanding', icon: Users, hasDateRange: false },
  { key: 'ageing', label: 'Ageing Analysis', icon: Clock, hasDateRange: false },
  { key: 'yarn', label: 'Yarn Consumption', icon: Activity, hasDateRange: true },
  { key: 'machine', label: 'Machine Utilisation', icon: Gauge, hasDateRange: true },
  { key: 'stock', label: 'Stock Register', icon: Package, hasDateRange: false },
  { key: 'purchase', label: 'Purchase Register', icon: ShoppingBag, hasDateRange: true },
]

// ─── MAIN ────────────────────────────────────────────────────
export default function ReportsPage() {
  const [activeTab, setActiveTab] = useStickyState('reports.activeTab', 'sales')
  const [preset, setPreset] = useStickyState('reports.preset', 'thisMonth')
  const [from, setFrom] = useState(startOfMonth())
  const [to, setTo] = useState(todayISO())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  const currentTab = REPORT_TABS.find(t => t.key === activeTab)

  const applyPreset = (key) => {
    setPreset(key)
    const p = PRESETS.find(x => x.key === key)
    if (!p) return
    setFrom(p.from() || '')
    setTo(p.to() || '')
  }

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    setData(null)
    try {
      let result
      const range = currentTab?.hasDateRange
        ? { from: from ? `${from}T00:00:00` : undefined, to: to ? `${to}T23:59:59` : undefined }
        : {}
      switch (activeTab) {
        case 'sales':
          result = await reports.salesRegister(range); break
        case 'gst':
          result = await reports.gstSummary(range); break
        case 'outstanding':
          result = await reports.customerOutstanding(); break
        case 'ageing':
          result = await reports.ageing(); break
        case 'yarn':
          result = await reports.yarnConsumption(range); break
        case 'machine':
          result = await reports.machineUtilisation(range); break
        case 'stock':
          result = await reports.stockRegister(); break
        case 'purchase':
          // purchase uses po_date (date only, not timestamp)
          result = await reports.purchaseRegister({
            from: from || undefined,
            to: to || undefined,
          }); break
        default:
          result = { data: null, error: new Error('Unknown report') }
      }
      if (result?.error) throw result.error
      setData(result?.data ?? [])
    } catch (err) {
      setLoadError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [activeTab, currentTab, from, to])

  useEffect(() => { load() }, [load])

  return (
    <div className="fade-in max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <BarChart3 size={20} className="text-indigo-600" /> Reports
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            Sales · GST · Customer Outstanding · Stock · Purchase
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={load}>
          <RefreshCw size={14} /> Refresh
        </Button>
      </div>

      {/* Report tabs */}
      <div className="bg-white rounded-2xl border border-slate-200/80 mb-4 overflow-hidden">
        <div className="flex flex-wrap">
          {REPORT_TABS.map(t => {
            const Icon = t.icon
            const active = activeTab === t.key
            return (
              <button
                key={t.key}
                onClick={() => {
                  setData(null)
                  setLoadError(null)
                  if (t.key === activeTab) {
                    // Same tab click: activeTab reference unchanged, so the
                    // useEffect([load]) won't re-fire. Trigger a manual reload.
                    load()
                  } else {
                    setActiveTab(t.key)
                  }
                }}
                className={`flex items-center gap-2 px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors ${
                  active
                    ? 'border-indigo-500 text-indigo-700 bg-indigo-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Date range filters (only for date-aware reports) */}
      {currentTab?.hasDateRange && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Calendar size={14} className="text-slate-400" />
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              {PRESETS.map(p => (
                <button
                  key={p.key}
                  onClick={() => applyPreset(p.key)}
                  className={`px-3 py-1.5 text-[11px] font-semibold rounded-md transition ${
                    preset === p.key ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Input
                type="date"
                value={from}
                onChange={e => { setFrom(e.target.value); setPreset('custom') }}
                className="w-36"
              />
              <span className="text-slate-400 text-[12px]">→</span>
              <Input
                type="date"
                value={to}
                onChange={e => { setTo(e.target.value); setPreset('custom') }}
                className="w-36"
              />
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700">
          <strong>Failed to load:</strong> {loadError}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-sm text-slate-400">
          Loading {currentTab?.label.toLowerCase()}…
        </div>
      )}

      {/* Report bodies */}
      {!loading && !loadError && (
        <>
          {activeTab === 'sales' && <SalesRegister rows={Array.isArray(data) ? data : []} />}
          {activeTab === 'gst' && <GstSummary payload={data && !Array.isArray(data) ? data : null} />}
          {activeTab === 'outstanding' && <CustomerOutstanding rows={Array.isArray(data) ? data : []} />}
          {activeTab === 'ageing' && <AgeingReport payload={data && !Array.isArray(data) ? data : null} />}
          {activeTab === 'yarn' && <YarnConsumption payload={data && !Array.isArray(data) ? data : null} />}
          {activeTab === 'machine' && <MachineUtilisation payload={data && !Array.isArray(data) ? data : null} />}
          {activeTab === 'stock' && <StockRegister rows={Array.isArray(data) ? data : []} />}
          {activeTab === 'purchase' && <PurchaseRegister rows={Array.isArray(data) ? data : []} />}
        </>
      )}
    </div>
  )
}

// ─── SALES REGISTER ──────────────────────────────────────────
function SalesRegister({ rows }) {
  const { pageData: salesPageData, currentPage: salesPage, totalPages: salesTotalPages, needsPagination: salesNeedsPagination, rangeLabel: salesRangeLabel, setCurrentPage: setSalesPage } = usePagination(rows)
  const totals = useMemo(() => ({
    count: rows.length,
    taxable: rows.reduce((s, o) => s + Number(o.taxable_amount || o.subtotal || 0), 0),
    cgst: rows.reduce((s, o) => s + Number(o.cgst_amount || 0), 0),
    sgst: rows.reduce((s, o) => s + Number(o.sgst_amount || 0), 0),
    igst: rows.reduce((s, o) => s + Number(o.igst_amount || 0), 0),
    grand: rows.reduce((s, o) => s + Number(o.grand_total || 0), 0),
    paid: rows.reduce((s, o) => s + Number(o.advance_paid || 0), 0),
    balance: rows.reduce((s, o) => s + Number(o.balance_due || 0), 0),
  }), [rows])

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: 'Order #', value: r => r.order_number },
      { label: 'Date', value: r => r.created_at?.slice(0, 10) || '' },
      { label: 'Customer', value: r => r.customers?.firm_name || '' },
      { label: 'GSTIN', value: r => r.customers?.gstin || '' },
      { label: 'Status', value: r => r.status },
      { label: 'Taxable', value: r => Number(r.taxable_amount || r.subtotal || 0).toFixed(2) },
      { label: 'CGST', value: r => Number(r.cgst_amount || 0).toFixed(2) },
      { label: 'SGST', value: r => Number(r.sgst_amount || 0).toFixed(2) },
      { label: 'IGST', value: r => Number(r.igst_amount || 0).toFixed(2) },
      { label: 'Grand Total', value: r => Number(r.grand_total || 0).toFixed(2) },
      { label: 'Paid', value: r => Number(r.advance_paid || 0).toFixed(2) },
      { label: 'Balance', value: r => Number(r.balance_due || 0).toFixed(2) },
    ])
    downloadCsv(`sales-register-${todayISO()}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Orders" value={fmt(totals.count)} />
        <StatTile label="Taxable" value={fmtMoney(totals.taxable)} />
        <StatTile label="Total Tax" value={fmtMoney(totals.cgst + totals.sgst + totals.igst)} />
        <StatTile label="Grand Total" value={fmtMoney(totals.grand)} accent="indigo" />
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download size={13} /> Export CSV
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 border-b border-slate-100">
              <tr>
                {['Order #', 'Date', 'Customer', 'Status', 'Taxable', 'Tax', 'Grand Total', 'Balance'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salesPageData.map(o => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-[13px] font-semibold text-indigo-700">{o.order_number || '—'}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(o.created_at)}</td>
                  <td className="px-4 py-3 text-slate-700">{o.customers?.firm_name || '—'}</td>
                  <td className="px-4 py-3"><Badge variant="default">{o.status}</Badge></td>
                  <td className="px-4 py-3 font-mono text-[13px]">{fmtMoney(o.taxable_amount || o.subtotal)}</td>
                  <td className="px-4 py-3 font-mono text-[13px] text-slate-500">{fmtMoney((Number(o.cgst_amount || 0) + Number(o.sgst_amount || 0) + Number(o.igst_amount || 0)))}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800">{fmtMoney(o.grand_total)}</td>
                  <td className={`px-4 py-3 font-mono ${Number(o.balance_due) > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}`}>{fmtMoney(o.balance_due)}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr><td colSpan={8} className="text-center py-12 text-sm text-slate-400">No orders in this date range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {salesNeedsPagination && <PaginationBar currentPage={salesPage} totalPages={salesTotalPages} rangeLabel={salesRangeLabel} onPageChange={setSalesPage} />}
      </div>
    </div>
  )
}

// ─── GST SUMMARY ─────────────────────────────────────────────
function GstSummary({ payload }) {
  // Hooks must run unconditionally — compute monthly with safe fallback first.
  const monthly = payload?.monthly || []
  const { pageData: gstPageData, currentPage: gstPage, totalPages: gstTotalPages, needsPagination: gstNeedsPagination, rangeLabel: gstRangeLabel, setCurrentPage: setGstPage } = usePagination(monthly)

  // Guard against stale data leaking from a previous tab (e.g. an empty array
  // from Sales Register before the GST fetch fires).
  if (!payload || !payload.summary) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center text-sm text-slate-400">
        No GST data in this date range.
      </div>
    )
  }
  const { summary } = payload

  const exportCsv = () => {
    const csv = toCsv(monthly, [
      { label: 'Month', value: r => r.month },
      { label: 'Orders', value: r => r.count },
      { label: 'Taxable', value: r => r.taxable.toFixed(2) },
      { label: 'CGST', value: r => r.cgst.toFixed(2) },
      { label: 'SGST', value: r => r.sgst.toFixed(2) },
      { label: 'IGST', value: r => r.igst.toFixed(2) },
      { label: 'Grand Total', value: r => r.grand.toFixed(2) },
    ])
    downloadCsv(`gst-summary-${todayISO()}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatTile label="Orders" value={fmt(summary.order_count)} />
        <StatTile label="Taxable" value={fmtMoney(summary.total_taxable)} />
        <StatTile label="CGST" value={fmtMoney(summary.total_cgst)} />
        <StatTile label="SGST" value={fmtMoney(summary.total_sgst)} />
        <StatTile label="IGST" value={fmtMoney(summary.total_igst)} />
      </div>
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-5 border border-indigo-100">
        <div className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-2">Total Tax Collected</div>
        <div className="text-3xl font-mono font-bold text-indigo-800">{fmtMoney(summary.total_tax)}</div>
        <div className="text-[12px] text-slate-500 mt-1">on {fmtMoney(summary.total_taxable)} taxable value · grand total {fmtMoney(summary.total_grand)}</div>
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!monthly.length}>
          <Download size={13} /> Export CSV
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {['Month', 'Orders', 'Taxable', 'CGST', 'SGST', 'IGST', 'Grand Total'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gstPageData.map(m => (
              <tr key={m.month} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-[13px] font-semibold text-slate-700">{fmtMonth(m.month)}</td>
                <td className="px-4 py-3 font-mono">{m.count}</td>
                <td className="px-4 py-3 font-mono">{fmtMoney(m.taxable)}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{fmtMoney(m.cgst)}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{fmtMoney(m.sgst)}</td>
                <td className="px-4 py-3 font-mono text-[12px]">{fmtMoney(m.igst)}</td>
                <td className="px-4 py-3 font-mono font-semibold text-indigo-700">{fmtMoney(m.grand)}</td>
              </tr>
            ))}
            {!monthly.length && (
              <tr><td colSpan={7} className="text-center py-12 text-sm text-slate-400">No GST data in this date range.</td></tr>
            )}
          </tbody>
        </table>
        {gstNeedsPagination && <PaginationBar currentPage={gstPage} totalPages={gstTotalPages} rangeLabel={gstRangeLabel} onPageChange={setGstPage} />}
      </div>
    </div>
  )
}

// ─── CUSTOMER OUTSTANDING ────────────────────────────────────
function CustomerOutstanding({ rows }) {
  const { pageData: outPageData, currentPage: outPage, totalPages: outTotalPages, needsPagination: outNeedsPagination, rangeLabel: outRangeLabel, setCurrentPage: setOutPage } = usePagination(rows)
  const totals = useMemo(() => ({
    customers: rows.length,
    totalBilled: rows.reduce((s, r) => s + r.total_billed, 0),
    totalPaid: rows.reduce((s, r) => s + r.total_paid, 0),
    totalOutstanding: rows.reduce((s, r) => s + r.total_outstanding, 0),
  }), [rows])

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: 'Customer', value: r => r.firm_name },
      { label: 'Phone', value: r => r.phone },
      { label: 'Orders', value: r => r.order_count },
      { label: 'Total Billed', value: r => r.total_billed.toFixed(2) },
      { label: 'Paid', value: r => r.total_paid.toFixed(2) },
      { label: 'Outstanding', value: r => r.total_outstanding.toFixed(2) },
      { label: 'Oldest Open', value: r => r.oldest_open?.slice(0, 10) || '' },
      { label: 'Days Open', value: r => r.oldest_open ? daysAgo(r.oldest_open) : '' },
    ])
    downloadCsv(`customer-outstanding-${todayISO()}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatTile label="Customers" value={fmt(totals.customers)} />
        <StatTile label="Total Billed" value={fmtMoney(totals.totalBilled)} />
        <StatTile label="Collected" value={fmtMoney(totals.totalPaid)} />
        <StatTile label="Outstanding" value={fmtMoney(totals.totalOutstanding)} accent="amber" />
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download size={13} /> Export CSV
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {['Customer', 'Orders', 'Billed', 'Paid', 'Outstanding', 'Oldest Open', 'Aging'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {outPageData.map(r => {
              const days = r.oldest_open ? daysAgo(r.oldest_open) : 0
              const ageVariant = days > 90 ? 'danger' : days > 60 ? 'warning' : days > 30 ? 'info' : 'default'
              return (
                <tr key={r.customer_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-700">{r.firm_name}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{r.order_count}</td>
                  <td className="px-4 py-3 font-mono">{fmtMoney(r.total_billed)}</td>
                  <td className="px-4 py-3 font-mono text-emerald-700">{fmtMoney(r.total_paid)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-amber-700">{fmtMoney(r.total_outstanding)}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(r.oldest_open)}</td>
                  <td className="px-4 py-3">
                    {days > 0 ? <Badge variant={ageVariant}>{days}d</Badge> : <span className="text-[12px] text-slate-300">—</span>}
                  </td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={7} className="text-center py-12 text-sm text-slate-400">No outstanding balances.</td></tr>
            )}
          </tbody>
        </table>
        {outNeedsPagination && <PaginationBar currentPage={outPage} totalPages={outTotalPages} rangeLabel={outRangeLabel} onPageChange={setOutPage} />}
      </div>
    </div>
  )
}

// ─── STOCK REGISTER ──────────────────────────────────────────
function StockRegister({ rows }) {
  const { pageData: stockPageData, currentPage: stockPage, totalPages: stockTotalPages, needsPagination: stockNeedsPagination, rangeLabel: stockRangeLabel, setCurrentPage: setStockPage } = usePagination(rows)
  const totals = useMemo(() => ({
    items: rows.length,
    raw: rows.filter(r => !r.is_finished_good).length,
    fg: rows.filter(r => r.is_finished_good).length,
  }), [rows])

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: 'Item', value: r => r.product_name || r.material_name || '' },
      { label: 'Type', value: r => r.is_finished_good ? 'Finished Good' : 'Raw Material' },
      { label: 'Warehouse', value: r => r.warehouse_name || '' },
      { label: 'Quantity', value: r => Number(r.quantity).toFixed(3) },
      { label: 'Unit', value: r => r.unit || '' },
      { label: 'Last Move', value: r => r.last_move?.slice(0, 10) || '' },
    ])
    downloadCsv(`stock-register-${todayISO()}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="Total Items" value={fmt(totals.items)} />
        <StatTile label="Raw Materials" value={fmt(totals.raw)} accent="info" />
        <StatTile label="Finished Goods" value={fmt(totals.fg)} accent="indigo" />
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download size={13} /> Export CSV
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {['Item', 'Type', 'Warehouse', 'Quantity', 'Unit', 'Last Move'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stockPageData.map(b => (
              <tr key={b.key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                <td className="px-4 py-3 font-medium text-slate-700">{b.product_name || b.material_name || '—'}</td>
                <td className="px-4 py-3">
                  <Badge variant={b.is_finished_good ? 'primary' : 'info'}>{b.is_finished_good ? 'FG' : 'Raw'}</Badge>
                </td>
                <td className="px-4 py-3 text-slate-600 text-[13px]">{b.warehouse_name || '—'}</td>
                <td className={`px-4 py-3 font-mono font-semibold ${b.quantity < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmt(b.quantity)}</td>
                <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{b.unit || '—'}</td>
                <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(b.last_move)}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={6} className="text-center py-12 text-sm text-slate-400">No stock yet. Receive a PO or complete a production job to populate this register.</td></tr>
            )}
          </tbody>
        </table>
        {stockNeedsPagination && <PaginationBar currentPage={stockPage} totalPages={stockTotalPages} rangeLabel={stockRangeLabel} onPageChange={setStockPage} />}
      </div>
    </div>
  )
}

// ─── PURCHASE REGISTER ───────────────────────────────────────
function PurchaseRegister({ rows }) {
  const { pageData: prPageData, currentPage: prPage, totalPages: prTotalPages, needsPagination: prNeedsPagination, rangeLabel: prRangeLabel, setCurrentPage: setPrPage } = usePagination(rows)
  const totals = useMemo(() => ({
    count: rows.length,
    grand: rows.reduce((s, r) => s + Number(r.grand_total || 0), 0),
    tax: rows.reduce(
      (s, r) => s + Number(r.cgst_amount || 0) + Number(r.sgst_amount || 0) + Number(r.igst_amount || 0),
      0,
    ),
  }), [rows])

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: 'PO #', value: r => r.po_number },
      { label: 'Date', value: r => r.po_date },
      { label: 'Supplier', value: r => r.suppliers?.firm || r.suppliers?.name || '' },
      { label: 'Status', value: r => r.status },
      { label: 'Subtotal', value: r => Number(r.subtotal || 0).toFixed(2) },
      { label: 'CGST', value: r => Number(r.cgst_amount || 0).toFixed(2) },
      { label: 'SGST', value: r => Number(r.sgst_amount || 0).toFixed(2) },
      { label: 'IGST', value: r => Number(r.igst_amount || 0).toFixed(2) },
      { label: 'Grand Total', value: r => Number(r.grand_total || 0).toFixed(2) },
    ])
    downloadCsv(`purchase-register-${todayISO()}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatTile label="POs" value={fmt(totals.count)} />
        <StatTile label="Total Tax" value={fmtMoney(totals.tax)} />
        <StatTile label="Grand Total" value={fmtMoney(totals.grand)} accent="indigo" />
      </div>

      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download size={13} /> Export CSV
        </Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {['PO #', 'Date', 'Supplier', 'Status', 'Subtotal', 'Tax', 'Grand Total'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {prPageData.map(po => {
              const tax = Number(po.cgst_amount || 0) + Number(po.sgst_amount || 0) + Number(po.igst_amount || 0)
              return (
                <tr key={po.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-[13px] font-semibold text-indigo-700">{po.po_number}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(po.po_date)}</td>
                  <td className="px-4 py-3 text-slate-700">{po.suppliers?.firm || po.suppliers?.name || '—'}</td>
                  <td className="px-4 py-3"><Badge variant="default">{po.status}</Badge></td>
                  <td className="px-4 py-3 font-mono">{fmtMoney(po.subtotal)}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-slate-500">{fmtMoney(tax)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800">{fmtMoney(po.grand_total)}</td>
                </tr>
              )
            })}
            {!rows.length && (
              <tr><td colSpan={7} className="text-center py-12 text-sm text-slate-400">No purchase orders in this date range.</td></tr>
            )}
          </tbody>
        </table>
        {prNeedsPagination && <PaginationBar currentPage={prPage} totalPages={prTotalPages} rangeLabel={prRangeLabel} onPageChange={setPrPage} />}
      </div>
    </div>
  )
}

// ─── AGEING REPORT ───────────────────────────────────────────
function AgeingReport({ payload }) {
  const rows = payload?.rows || []
  const totals = payload?.totals || { total: 0, b0_30: 0, b31_60: 0, b61_90: 0, b90plus: 0 }
  const asOf = payload?.asOf || todayIST()
  const { pageData, currentPage, totalPages, needsPagination, rangeLabel, setCurrentPage } = usePagination(rows, 50)

  const pct = (part) => totals.total > 0 ? Math.round((part / totals.total) * 100) : 0

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: 'Customer', value: r => r.firm_name },
      { label: 'Phone', value: r => r.phone },
      { label: 'Credit Limit', value: r => Number(r.credit_limit || 0).toFixed(2) },
      { label: 'On Hold', value: r => r.credit_hold ? 'YES' : '' },
      { label: 'Invoices', value: r => r.invoice_count },
      { label: '0-30 days', value: r => Number(r.b0_30 || 0).toFixed(2) },
      { label: '31-60 days', value: r => Number(r.b31_60 || 0).toFixed(2) },
      { label: '61-90 days', value: r => Number(r.b61_90 || 0).toFixed(2) },
      { label: '90+ days', value: r => Number(r.b90plus || 0).toFixed(2) },
      { label: 'Total Outstanding', value: r => Number(r.total_outstanding || 0).toFixed(2) },
      { label: 'Oldest (days)', value: r => r.oldest_days_past },
    ])
    downloadCsv(`ageing-${asOf}.csv`, csv)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="text-[12px] text-slate-500">
          As of <span className="font-semibold text-slate-700">{asOf}</span> · {rows.length} customer{rows.length === 1 ? '' : 's'} with open balance
        </div>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatTile label="Total outstanding" value={fmtMoney(totals.total)} accent="indigo" />
        <StatTile label={`0–30 days · ${pct(totals.b0_30)}%`} value={fmtMoney(totals.b0_30)} accent="info" />
        <StatTile label={`31–60 days · ${pct(totals.b31_60)}%`} value={fmtMoney(totals.b31_60)} accent="info" />
        <StatTile label={`61–90 days · ${pct(totals.b61_90)}%`} value={fmtMoney(totals.b61_90)} accent="amber" />
        <StatTile label={`90+ days · ${pct(totals.b90plus)}%`} value={fmtMoney(totals.b90plus)} accent="amber" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Customer</th>
              <th className="text-right px-3 py-2">Invoices</th>
              <th className="text-right px-3 py-2">0–30</th>
              <th className="text-right px-3 py-2">31–60</th>
              <th className="text-right px-3 py-2">61–90</th>
              <th className="text-right px-3 py-2">90+</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-right px-3 py-2">Oldest</th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-10 text-slate-400">No outstanding invoices</td></tr>
            ) : pageData.map((r) => (
              <tr key={r.customer_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-slate-700 text-[13px]">{r.firm_name}</div>
                    {r.credit_hold && <Badge variant="danger">HOLD</Badge>}
                  </div>
                  <div className="text-[11px] text-slate-400">{r.phone || ''}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.invoice_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.b0_30)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.b31_60)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-amber-700">{fmtMoney(r.b61_90)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold text-red-700">{fmtMoney(r.b90plus)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">{fmtMoney(r.total_outstanding)}</td>
                <td className="px-3 py-2 text-right text-[12px] text-slate-500">{r.oldest_days_past}d</td>
              </tr>
            ))}
          </tbody>
        </table>
        {needsPagination && <PaginationBar currentPage={currentPage} totalPages={totalPages} rangeLabel={rangeLabel} onPageChange={setCurrentPage} />}
      </div>
    </div>
  )
}

// ─── YARN CONSUMPTION ────────────────────────────────────────
function YarnConsumption({ payload }) {
  const rows = payload?.rows || []
  const totals = payload?.totals || { actual: 0, std: 0, variance: 0, variance_pct: 0, value: 0 }
  const { pageData, currentPage, totalPages, needsPagination, rangeLabel, setCurrentPage } = usePagination(rows, 50)

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: 'Yarn', value: r => r.yarn_name },
      { label: 'Actual (kg)', value: r => Number(r.actual_qty || 0).toFixed(3) },
      { label: 'Standard (kg)', value: r => Number(r.std_qty || 0).toFixed(3) },
      { label: 'Variance (kg)', value: r => Number(r.variance_qty || 0).toFixed(3) },
      { label: 'Variance %', value: r => Number(r.variance_pct || 0).toFixed(2) },
      { label: 'Rate ₹/kg', value: r => Number(r.rate_per_kg || 0).toFixed(2) },
      { label: 'Value ₹', value: r => Number(r.actual_value || 0).toFixed(2) },
    ])
    downloadCsv(`yarn-consumption-${todayIST()}.csv`, csv)
  }

  const varianceColor = (pct) => {
    const a = Math.abs(pct || 0)
    if (a > 15) return 'text-red-700'
    if (a > 7) return 'text-amber-700'
    return 'text-emerald-700'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-slate-500">
          Standard = production plans completed in period. Variance = actual consumption − standard.
        </div>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} /> Export CSV
        </Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Actual consumed" value={`${fmt(totals.actual)} kg`} accent="indigo" />
        <StatTile label="Standard (expected)" value={`${fmt(totals.std)} kg`} accent="info" />
        <StatTile label="Variance" value={`${totals.variance >= 0 ? '+' : ''}${fmt(totals.variance)} kg · ${(totals.variance_pct || 0).toFixed(1)}%`} accent="amber" />
        <StatTile label="Value (actual)" value={fmtMoney(totals.value)} accent="indigo" />
      </div>
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Yarn</th>
              <th className="text-right px-3 py-2">Actual (kg)</th>
              <th className="text-right px-3 py-2">Std (kg)</th>
              <th className="text-right px-3 py-2">Variance</th>
              <th className="text-right px-3 py-2">Variance %</th>
              <th className="text-right px-3 py-2">Rate ₹/kg</th>
              <th className="text-right px-3 py-2">Value</th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">No consumption recorded in period</td></tr>
            ) : pageData.map((r) => (
              <tr key={r.yarn_type_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 text-[13px] text-slate-700">{r.yarn_name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.actual_qty)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(r.std_qty)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${varianceColor(r.variance_pct)}`}>
                  {r.variance_qty >= 0 ? '+' : ''}{fmt(r.variance_qty)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${varianceColor(r.variance_pct)}`}>
                  {(r.variance_pct || 0).toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.rate_per_kg)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtMoney(r.actual_value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {needsPagination && <PaginationBar currentPage={currentPage} totalPages={totalPages} rangeLabel={rangeLabel} onPageChange={setCurrentPage} />}
      </div>
    </div>
  )
}

// ─── MACHINE UTILISATION ─────────────────────────────────────
function MachineUtilisation({ payload }) {
  const rows = payload?.rows || []
  const { pageData, currentPage, totalPages, needsPagination, rangeLabel, setCurrentPage } = usePagination(rows, 50)

  const exportCsv = () => {
    const csv = toCsv(rows, [
      { label: 'Machine', value: r => r.machine_name },
      { label: 'Units', value: r => r.machine_count },
      { label: 'Runs', value: r => r.runs },
      { label: 'Hours run', value: r => Number(r.hours_run || 0).toFixed(1) },
      { label: 'Hours available', value: r => Number(r.hours_available || 0).toFixed(1) },
      { label: 'Util %', value: r => Number(r.util_pct || 0).toFixed(1) },
      { label: 'Planned qty', value: r => Number(r.planned_qty || 0).toFixed(2) },
      { label: 'Completed qty', value: r => Number(r.completed_qty || 0).toFixed(2) },
      { label: 'Efficiency %', value: r => Number(r.efficiency_pct || 0).toFixed(1) },
    ])
    downloadCsv(`machine-utilisation-${todayIST()}.csv`, csv)
  }

  const utilColor = (pct) => {
    if (pct >= 80) return 'bg-emerald-500'
    if (pct >= 50) return 'bg-indigo-500'
    if (pct >= 25) return 'bg-amber-500'
    return 'bg-red-400'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[12px] text-slate-500">
          Window: {payload?.from || '—'} → {payload?.to || '—'} · assumes 6-day week × 8h/day shift
        </div>
        <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!rows.length}>
          <Download size={14} /> Export CSV
        </Button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Machine</th>
              <th className="text-right px-3 py-2">Units</th>
              <th className="text-right px-3 py-2">Runs</th>
              <th className="text-right px-3 py-2">Hours run</th>
              <th className="text-right px-3 py-2">Available</th>
              <th className="text-left px-3 py-2 w-40">Utilisation</th>
              <th className="text-right px-3 py-2">Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {pageData.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-slate-400">No production runs in period</td></tr>
            ) : pageData.map((r) => (
              <tr key={r.machine_id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2 text-[13px] text-slate-700">{r.machine_name}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.machine_count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.runs}</td>
                <td className="px-3 py-2 text-right tabular-nums">{Number(r.hours_run || 0).toFixed(1)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{Number(r.hours_available || 0).toFixed(0)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${utilColor(r.util_pct)}`} style={{ width: `${Math.min(100, r.util_pct)}%` }} />
                    </div>
                    <span className="text-[11px] text-slate-500 tabular-nums w-10 text-right">{(r.util_pct || 0).toFixed(0)}%</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{(r.efficiency_pct || 0).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {needsPagination && <PaginationBar currentPage={currentPage} totalPages={totalPages} rangeLabel={rangeLabel} onPageChange={setCurrentPage} />}
      </div>
    </div>
  )
}

// ─── STAT TILE ───────────────────────────────────────────────
function StatTile({ label, value, accent }) {
  const accentClass = {
    indigo: 'text-indigo-700',
    amber: 'text-amber-700',
    info: 'text-blue-700',
  }[accent] || 'text-slate-800'
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 p-4">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</div>
      <div className={`text-xl font-mono font-bold mt-1 ${accentClass}`}>{value}</div>
    </div>
  )
}
