import { useState, useEffect, useMemo } from 'react'
import { stockMovements } from '../../lib/db'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { usePagination } from '../../hooks/usePagination'
import { Button, Input, Modal, Badge, PaginationBar } from '../../components/ui'
import { Package, Search, TrendingUp, TrendingDown, RotateCw, SlidersHorizontal, Plus, Minus } from 'lucide-react'
import { fmt, fmtDate } from '../../lib/format'

export default function StockPage() {
  const toast = useToast()
  const { yarnTypes, productTypes, warehouses } = useApp()
  const [balances, setBalances] = useState([])
  const [movements, setMovements] = useState([])
  const [search, setSearch] = useState('')
  const [view, setView] = useState('balances') // balances | movements
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Manual adjustment modal
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustForm, setAdjustForm] = useState({
    item_type: 'yarn', // yarn | product
    yarn_type_id: '',
    product_type_id: '',
    warehouse_id: '',
    direction: 'in', // in | out
    quantity: 0,
    unit: 'kg',
    notes: '',
  })

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

  const balPag = usePagination(filteredBalances)
  const movPag = usePagination(movements)

  const totalIn = movements.filter(m => m.kind === 'in').reduce((s, m) => s + Number(m.quantity || 0), 0)
  const totalOut = movements.filter(m => m.kind === 'out').reduce((s, m) => s + Number(m.quantity || 0), 0)

  const openAdjust = () => {
    setAdjustForm({
      item_type: 'yarn',
      yarn_type_id: '',
      product_type_id: '',
      warehouse_id: '',
      direction: 'in',
      quantity: 0,
      unit: 'kg',
      notes: '',
    })
    setShowAdjust(true)
  }

  const submitAdjust = async () => {
    const {
      item_type, yarn_type_id, product_type_id, warehouse_id,
      direction, quantity, unit, notes,
    } = adjustForm
    if (item_type === 'yarn' && !yarn_type_id) { toast.error('Select a yarn'); return }
    if (item_type === 'product' && !product_type_id) { toast.error('Select a product'); return }
    if (!(Number(quantity) > 0)) { toast.error('Enter a quantity greater than zero'); return }
    // Create a stock_movements row of kind='adjustment' with a signed sign — we
    // model corrections by inserting either an `in` or `out` movement explicitly
    // so computeBalances picks it up without special-casing the 'adjustment' kind.
    const { error } = await stockMovements.create({
      kind: direction, // 'in' or 'out'
      yarn_type_id: item_type === 'yarn' ? yarn_type_id : null,
      product_type_id: item_type === 'product' ? product_type_id : null,
      warehouse_id: warehouse_id || null,
      quantity: Number(quantity),
      unit: unit || 'kg',
      source_type: 'adjustment',
      source_id: null,
      notes: notes || `Manual ${direction === 'in' ? 'increase' : 'decrease'}`,
    })
    if (error) { toast.error(error.message || 'Adjustment failed'); return }
    toast.success(`Stock ${direction === 'in' ? 'increased' : 'decreased'} by ${quantity} ${unit}`)
    setShowAdjust(false)
    load()
  }

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
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={load}><RotateCw size={14} /> Refresh</Button>
          <Button size="sm" onClick={openAdjust}><SlidersHorizontal size={14} /> Adjust Stock</Button>
        </div>
      </div>

      {loadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <strong>Failed to load:</strong> {loadError}
          <button onClick={load} className="ml-auto text-red-600 hover:text-red-800 font-semibold text-[12px]">Retry</button>
        </div>
      )}

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
              {balPag.pageData.map(b => (
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
              {movPag.pageData.map(m => (
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
      {view === 'balances'
        ? balPag.needsPagination && <PaginationBar currentPage={balPag.currentPage} totalPages={balPag.totalPages} rangeLabel={balPag.rangeLabel} onPageChange={balPag.setCurrentPage} />
        : movPag.needsPagination && <PaginationBar currentPage={movPag.currentPage} totalPages={movPag.totalPages} rangeLabel={movPag.rangeLabel} onPageChange={movPag.setCurrentPage} />
      }

      {/* MANUAL ADJUSTMENT MODAL */}
      <Modal
        isOpen={showAdjust}
        onClose={() => setShowAdjust(false)}
        title="Manual Stock Adjustment"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowAdjust(false)}>Cancel</Button>
          <Button
            size="sm"
            variant={adjustForm.direction === 'out' ? 'danger' : 'success'}
            onClick={submitAdjust}
          >
            {adjustForm.direction === 'in' ? <><Plus size={13} /> Add to Stock</> : <><Minus size={13} /> Remove from Stock</>}
          </Button>
        </>}
      >
        <div className="space-y-4">
          {/* Direction toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {[
              { k: 'in', label: 'Increase (+)', variant: 'success' },
              { k: 'out', label: 'Decrease (−)', variant: 'danger' },
            ].map(d => (
              <button
                key={d.k}
                onClick={() => setAdjustForm(f => ({ ...f, direction: d.k }))}
                className={`flex-1 px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${
                  adjustForm.direction === d.k
                    ? d.k === 'in'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-sm'
                      : 'bg-red-50 text-red-700 border border-red-200 shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Item type toggle */}
          <div className="flex bg-slate-100 rounded-lg p-0.5">
            {[
              { k: 'yarn', label: 'Raw Material (Yarn)' },
              { k: 'product', label: 'Finished Good (Product)' },
            ].map(t => (
              <button
                key={t.k}
                onClick={() => setAdjustForm(f => ({
                  ...f,
                  item_type: t.k,
                  yarn_type_id: '',
                  product_type_id: '',
                  unit: t.k === 'yarn' ? 'kg' : 'pcs',
                }))}
                className={`flex-1 px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${
                  adjustForm.item_type === t.k ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Item picker */}
          {adjustForm.item_type === 'yarn' ? (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Yarn</label>
              <select
                value={adjustForm.yarn_type_id}
                onChange={e => setAdjustForm(f => ({ ...f, yarn_type_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
              >
                <option value="">— select yarn —</option>
                {(yarnTypes || []).map(y => (
                  <option key={y.id} value={y.id}>
                    {y.name}{y.count_or_denier ? ` · ${y.count_or_denier}` : ''}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Product</label>
              <select
                value={adjustForm.product_type_id}
                onChange={e => setAdjustForm(f => ({ ...f, product_type_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
              >
                <option value="">— select product —</option>
                {(productTypes || []).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Warehouse */}
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Warehouse (optional)</label>
            <select
              value={adjustForm.warehouse_id}
              onChange={e => setAdjustForm(f => ({ ...f, warehouse_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
            >
              <option value="">— none —</option>
              {(warehouses || []).map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* Quantity + unit */}
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Quantity"
              type="number"
              className="col-span-2"
              value={adjustForm.quantity}
              onChange={e => setAdjustForm(f => ({ ...f, quantity: parseFloat(e.target.value) || 0 }))}
            />
            <Input
              label="Unit"
              value={adjustForm.unit}
              onChange={e => setAdjustForm(f => ({ ...f, unit: e.target.value }))}
            />
          </div>

          <Input
            label="Reason / Notes"
            placeholder="Physical count correction, damaged goods, opening balance…"
            value={adjustForm.notes}
            onChange={e => setAdjustForm(f => ({ ...f, notes: e.target.value }))}
          />
          <p className="text-[11px] text-slate-400">
            This creates a ledger entry of kind <strong>{adjustForm.direction}</strong> with source <code>adjustment</code>.
            The balance on this item will shift by {Number(adjustForm.quantity) || 0} {adjustForm.unit} immediately.
          </p>
        </div>
      </Modal>
    </div>
  )
}
