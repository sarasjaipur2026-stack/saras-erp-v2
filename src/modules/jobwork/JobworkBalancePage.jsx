import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Scissors, Download, RefreshCcw, CheckCircle2, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { jobworkJobs } from '../../lib/db'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, StatCard, Badge } from '../../components/ui'
import { useRealtimeTable } from '../../hooks/useRealtimeTable'
import { useSWRList, invalidateSWR } from '../../hooks/useSWRList'
import { perfMark } from '../../lib/perfMark'

/**
 * Jobwork return-balance. For every open job (inward / outward), shows how much
 * is still pending return. Overdue jobs surface to the top. Supports CSV export
 * for chasing jobworkers. Realtime-aware — a new jobwork_items row (e.g. partial
 * return) updates the balance live.
 */
export default function JobworkBalancePage() {
  const navigate = useNavigate()
  const toast = useToast()
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState('all') // all | inward | outward
  const [showClosed, setShowClosed] = useState(false)

  const cacheKey = `jobwork.returnBalance:${showClosed ? 'all' : 'open'}`
  const { data, error: loadError, refetch: load } = useSWRList(
    cacheKey,
    async () => {
      const res = await perfMark('jobworkJobs.returnBalance', () =>
        jobworkJobs.returnBalance({ includeClosed: showClosed }))
      if (res?.error) throw res.error
      return res?.data || { rows: [], totals: { openJobs: 0, overdueJobs: 0, outstandingQty: 0 } }
    },
  )
  const rows = useMemo(() => data?.rows || [], [data])
  const totals = data?.totals || { openJobs: 0, overdueJobs: 0, outstandingQty: 0 }

  // Realtime: silent refetch (no spinner) on jobwork mutations
  useRealtimeTable('jobwork_items', () => { invalidateSWR('jobwork.returnBalance:*'); load() }, { debounceMs: 500 })
  useRealtimeTable('jobwork_jobs', () => { invalidateSWR('jobwork.returnBalance:*'); load() }, { debounceMs: 500 })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter((r) => {
      if (direction !== 'all' && r.direction !== direction) return false
      if (!q) return true
      return (
        (r.job_number || '').toLowerCase().includes(q) ||
        (r.party || '').toLowerCase().includes(q)
      )
    })
  }, [rows, search, direction])

  const exportCsv = () => {
    if (!filtered.length) return toast.error('Nothing to export')
    const header = ['Job #', 'Direction', 'Status', 'Party', 'Start', 'Due', 'Inward Qty', 'Outward Qty', 'Balance', 'Overdue']
    const lines = filtered.map((r) => [
      r.job_number || '', r.direction, r.status, r.party, r.start_date || '', r.due_date || '',
      r.inward_qty.toFixed(3), r.outward_qty.toFixed(3), r.balance.toFixed(3), r.overdue ? 'YES' : '',
    ])
    const csv = [header, ...lines]
      .map((cols) => cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `jobwork-balance-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // No blocking spinner — always paint instantly from cache or zero-state.
  // Background refetch updates the UI when fresh data arrives.

  if (loadError && !data) {
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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Jobwork Return Balance</h1>
          <p className="text-[13px] text-slate-500 mt-1">
            Open jobs with material still out — chase jobworkers / track customer-owned stock
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => load()}><RefreshCcw size={14} /></Button>
          <Button variant="secondary" size="sm" onClick={exportCsv}><Download size={14} /> Export CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard label="Open jobs" value={totals.openJobs} icon={Scissors} color="indigo" />
        <StatCard label="Overdue jobs" value={totals.overdueJobs} icon={AlertTriangle} color={totals.overdueJobs > 0 ? 'red' : 'slate'} />
        <StatCard label="Outstanding qty" value={`${totals.outstandingQty.toFixed(2)} kg`} icon={Scissors} color="blue" />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <Input
          placeholder="Search job # or party…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <div className="flex gap-1">
          {['all', 'inward', 'outward'].map((d) => (
            <button
              key={d}
              onClick={() => setDirection(d)}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-medium capitalize transition-colors ${
                direction === d ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="w-4 h-4" />
          Include balanced jobs
        </label>
        <span className="ml-auto text-[12px] text-slate-400">{filtered.length} job{filtered.length === 1 ? '' : 's'}</span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="text-left px-3 py-2">Job #</th>
              <th className="text-left px-3 py-2">Dir.</th>
              <th className="text-left px-3 py-2">Party</th>
              <th className="text-right px-3 py-2">Inward</th>
              <th className="text-right px-3 py-2">Outward</th>
              <th className="text-right px-3 py-2">Balance</th>
              <th className="text-left px-3 py-2">Due</th>
              <th className="text-left px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-slate-400">
                  <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500" />
                  All jobwork balanced
                </td>
              </tr>
            ) : filtered.map((r) => (
              <tr
                key={r.id}
                onClick={() => navigate(`/jobwork?job=${r.id}`)}
                className={`border-t border-slate-100 hover:bg-slate-50 cursor-pointer ${r.overdue ? 'bg-red-50/40' : ''}`}
              >
                <td className="px-3 py-2">
                  <div className="font-mono text-[12px] font-semibold text-indigo-700">{r.job_number || '—'}</div>
                  <div className="text-[10px] text-slate-400">{r.start_date}</div>
                </td>
                <td className="px-3 py-2">
                  {r.direction === 'inward' ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-blue-700"><ArrowDownLeft size={12} /> in</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700"><ArrowUpRight size={12} /> out</span>
                  )}
                </td>
                <td className="px-3 py-2 text-[13px] text-slate-700 truncate max-w-[220px]">{r.party}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.inward_qty.toFixed(2)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.outward_qty.toFixed(2)}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.balance > 0.001 ? 'text-amber-700' : r.balance < -0.001 ? 'text-red-700' : 'text-slate-400'}`}>
                  {r.balance > 0 ? '+' : ''}{r.balance.toFixed(2)}
                </td>
                <td className="px-3 py-2 text-[12px]">
                  {r.due_date ? (
                    <span className={r.overdue ? 'text-red-600 font-medium' : 'text-slate-500'}>
                      {r.due_date}{r.overdue && <span className="ml-1">⚠</span>}
                    </span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2"><Badge>{r.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
