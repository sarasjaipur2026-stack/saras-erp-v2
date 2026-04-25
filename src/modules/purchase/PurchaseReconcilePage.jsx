import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Package, Download, RefreshCcw, CheckCircle2 } from 'lucide-react'
import { purchaseOrders } from '../../lib/db'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, StatCard, Currency } from '../../components/ui'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { useSWRList, invalidateSWR } from '../../hooks/useSWRList'
import { perfMark } from '../../lib/perfMark'

/**
 * PO reconciliation — one row per outstanding PO line.
 *
 * Outstanding = ordered qty - received qty. Lines with pending <= 0 are hidden
 * by default (toggle in the header). Sorted overdue-first so the team chasing
 * suppliers sees the urgent rows immediately.
 *
 * Realtime: re-fetches silently on any PO / PO-item / GRN change so a GRN
 * created in another tab updates the pending quantity live.
 */
export default function PurchaseReconcilePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [showClosed, setShowClosed] = useState(false)

  const cacheKey = `purchase.reconciliation:${showClosed ? 'all' : 'open'}`
  const { data: rowsData, error: loadError, refetch: load } = useSWRList(
    cacheKey,
    async () => {
      const res = await perfMark('purchaseOrders.reconciliation', () =>
        purchaseOrders.reconciliation({ includeClosed: showClosed }))
      if (res?.error) throw res.error
      return res?.data || []
    },
  )
  // useMemo so referential identity is stable when SWR returns the same array
  const rows = useMemo(() => rowsData || [], [rowsData])

  // Realtime: silent refetch on PO / GRN changes — no spinner.
  useRealtimeTable('purchase_order_items', () => { invalidateSWR('purchase.reconciliation:*'); load() }, { debounceMs: 500 })
  useRealtimeTable('goods_receipt_items', () => { invalidateSWR('purchase.reconciliation:*'); load() }, { debounceMs: 500 })

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((r) =>
      (r.po_number || '').toLowerCase().includes(q) ||
      (r.supplier || '').toLowerCase().includes(q) ||
      (r.yarn || '').toLowerCase().includes(q),
    )
  }, [rows, search])

  const stats = useMemo(() => {
    const openLines = rows.filter((r) => r.pending > 0)
    const overdueLines = openLines.filter((r) => r.overdue)
    const openValue = openLines.reduce((s, r) => s + r.pending_value, 0)
    const overdueValue = overdueLines.reduce((s, r) => s + r.pending_value, 0)
    return {
      openLines: openLines.length,
      overdueLines: overdueLines.length,
      openValue,
      overdueValue,
    }
  }, [rows])

  const exportCsv = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const header = [
      'PO Number', 'PO Date', 'Expected', 'Supplier', 'Item', 'Ordered', 'Received', 'Pending', '% Received', 'Rate', 'Pending Value', 'Overdue',
    ]
    const lines = filtered.map((r) => [
      r.po_number || '',
      r.po_date || '',
      r.expected_date || '',
      r.supplier || '',
      r.yarn || '',
      r.ordered,
      r.received,
      r.pending,
      `${r.pct}%`,
      r.rate,
      r.pending_value.toFixed(2),
      r.overdue ? 'YES' : '',
    ])
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `po-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // No blocking spinner — paint instantly from cache or zero-state, refetch silently.
  if (loadError && !rowsData) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
          <p className="text-sm text-red-700">{loadError?.message || String(loadError)}</p>
          <button onClick={load} className="mt-2 text-sm text-red-600 underline">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 fade-in">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">PO Reconciliation</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Outstanding purchase-order lines — what's ordered vs what's landed in the warehouse
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => load()} title="Refresh">
            <RefreshCcw size={14} />
          </Button>
          <Button variant="secondary" size="sm" onClick={exportCsv}>
            <Download size={14} /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Open lines" value={stats.openLines} icon={Package} color="indigo" />
        <StatCard label="Overdue lines" value={stats.overdueLines} icon={AlertTriangle} color={stats.overdueLines > 0 ? 'red' : 'slate'} />
        <StatCard label="Open value" value={<Currency amount={stats.openValue} />} icon={Package} color="blue" />
        <StatCard label="Overdue value" value={<Currency amount={stats.overdueValue} />} icon={AlertTriangle} color={stats.overdueValue > 0 ? 'red' : 'slate'} />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search PO / supplier / item…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="w-4 h-4"
          />
          Include closed lines
        </label>
        <span className="ml-auto text-[12px] text-slate-400">{filtered.length} row{filtered.length === 1 ? '' : 's'}</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">PO</th>
              <th className="text-left px-3 py-2">Supplier</th>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Ordered</th>
              <th className="text-right px-3 py-2">Received</th>
              <th className="text-right px-3 py-2">Pending</th>
              <th className="text-left px-3 py-2 w-32">Progress</th>
              <th className="text-right px-3 py-2">Value</th>
              <th className="text-left px-3 py-2">Expected</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="text-center py-12 text-slate-400">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500" />
                  All PO lines fully received
                </td>
              </tr>
            ) : filtered.map((r) => (
              <tr
                key={r.po_item_id}
                onClick={() => navigate(`/purchase?po=${r.po_id}`)}
                className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${r.overdue ? 'bg-red-50/40' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="font-mono text-[12px] font-semibold text-indigo-700">{r.po_number || '—'}</div>
                  <div className="text-[10px] text-slate-400">{r.po_date}</div>
                </td>
                <td className="px-3 py-2 text-[13px] text-slate-700 truncate max-w-[180px]">{r.supplier}</td>
                <td className="px-3 py-2 text-[13px] text-slate-700 truncate max-w-[200px]">{r.yarn}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.ordered.toLocaleString('en-IN')} {r.unit}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-700">{r.received.toLocaleString('en-IN')}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.pending > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                  {r.pending.toLocaleString('en-IN')}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${r.pct >= 100 ? 'bg-emerald-500' : r.overdue ? 'bg-red-500' : 'bg-indigo-500'}`}
                        style={{ width: `${Math.min(100, r.pct)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 tabular-nums">{r.pct}%</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <Currency amount={r.pending_value} />
                </td>
                <td className="px-3 py-2 text-[12px]">
                  {r.expected_date ? (
                    <span className={r.overdue ? 'text-red-600 font-medium' : 'text-slate-500'}>
                      {r.expected_date}
                      {r.overdue && <span className="ml-1">⚠</span>}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
