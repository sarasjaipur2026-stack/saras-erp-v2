import { useState, useEffect, useMemo } from 'react'
import { stockMovements } from '../../lib/db'
import { Button, Input, Badge } from '../../components/ui'
import { Package, Search, TrendingUp, TrendingDown, RotateCw } from 'lucide-react'

const fmt = (v) => Number.isFinite(+v)
  ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 })
  : '—'
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'

export default function StockPage() {
  const [balances, setBalances] = useState([])
  const [movements, setMovements] = useState([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState('balances') // balances | movements
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [bal, mv] = await Promise.all([
        stockMovements.computeBalances(),
        stockMovements.getAll(),
      ])
      if (bal?.error) throw bal.error
      if (mv?.error) throw mv.error
      setBalances((bal?.data || []).filter(b => Math.abs(b.quantity) > 0.001))
      setMovements(mv?.data || [])
    } catch (err) {
      setLoadError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const filteredBalances = useMemo(() => {
    if (!search.trim()) return balances
    const q = search.toLowerCase()
    return balances.filter(b =>
      (b.product_name || b.material_name || '').toLowerCase().includes(q) ||
      (b.warehouse_name || '').toLowerCase().includes(q)
    )
  }, [balances, search])

  const totalIn = movements.filter(m => m.kind === 'in').reduce((s, m) => s + Number(m.quantity || 0), 0)
  const totalOut = movements.filter(m => m.kind === 'out').reduce((s, m) => s + Number(m.quantity || 0), 0)

  return (
    <div className="fade-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Package size={20} className="text-indigo-600" /> Stock
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${balances.length} line items · ${movements.length} movements`}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={load}><RotateCw size={14} /> Refresh</Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><TrendingUp size={11} className="text-emerald-500" /> Total In</div>
          <div className="text-2xl font-mono font-bold text-emerald-700 mt-1">{fmt(totalIn)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1"><TrendingDown size={11} className="text-red-500" /> Total Out</div>
          <div className="text-2xl font-mono font-bold text-red-700 mt-1">{fmt(totalOut)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Net Balance</div>
          <div className="text-2xl font-mono font-bold text-indigo-700 mt-1">{fmt(totalIn - totalOut)}</div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {['balances', 'movements'].map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${view === v ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
            >
              {v === 'balances' ? 'Balances' : 'Movements'}
            </button>
          ))}
        </div>
        <div className="flex-1">
          <Input icon={Search} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        {view === 'balances' ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 border-b border-slate-100">
              <tr>
                {['Item', 'Type', 'Warehouse', 'Quantity', 'Unit', 'Last Move'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredBalances.map(b => (
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
              {!filteredBalances.length && !loading && (
                <tr><td colSpan={6} className="text-center py-12 text-sm text-slate-400">No stock yet. Stock is populated automatically by dispatches, production, and purchases.</td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 border-b border-slate-100">
              <tr>
                {['Date', 'Item', 'Kind', 'Qty', 'Source', 'Notes'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {movements.map(m => (
                <tr key={m.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(m.created_at)}</td>
                  <td className="px-4 py-3 font-medium text-slate-700">{m.products?.name || m.product_types?.name || m.yarn_types?.name || m.materials?.name || '—'}</td>
                  <td className="px-4 py-3">
                    <Badge variant={m.kind === 'in' ? 'success' : m.kind === 'out' ? 'danger' : 'default'}>{m.kind}</Badge>
                  </td>
                  <td className={`px-4 py-3 font-mono font-semibold ${m.kind === 'out' ? 'text-red-600' : 'text-emerald-700'}`}>
                    {m.kind === 'out' ? '−' : '+'}{fmt(m.quantity)} {m.unit}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-500">{m.source_type || '—'}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500">{m.notes || '—'}</td>
                </tr>
              ))}
              {!movements.length && !loading && (
                <tr><td colSpan={6} className="text-center py-12 text-sm text-slate-400">No movements yet.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
