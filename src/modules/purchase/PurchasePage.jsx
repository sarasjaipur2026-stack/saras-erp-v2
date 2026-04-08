import { useState, useEffect, useMemo } from 'react'
import { purchaseOrders, goodsReceipts } from '../../lib/db'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Modal, Input, Badge } from '../../components/ui'
import {
  ShoppingBag, Plus, FileText, Search, Truck, X,
} from 'lucide-react'

const fmtMoney = (v) =>
  Number.isFinite(+v)
    ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    : '—'
const fmt = (v) =>
  Number.isFinite(+v)
    ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 })
    : '—'
const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—'

const PO_STATUS = {
  draft: { variant: 'default', label: 'Draft' },
  issued: { variant: 'info', label: 'Issued' },
  partially_received: { variant: 'warning', label: 'Partial' },
  received: { variant: 'success', label: 'Received' },
  cancelled: { variant: 'danger', label: 'Cancelled' },
}

const emptyLine = () => ({
  id: crypto.randomUUID(),
  yarn_type_id: '',
  description: '',
  quantity: 0,
  unit: 'kg',
  rate_per_unit: 0,
})

export default function PurchasePage() {
  const toast = useToast()
  const { suppliers, yarnTypes, warehouses } = useApp()
  const [view, setView] = useState('pos') // pos | grns
  const [poList, setPoList] = useState([])
  const [grnList, setGrnList] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)

  // Create PO state
  const [showCreatePo, setShowCreatePo] = useState(false)
  const [poForm, setPoForm] = useState({
    supplier_id: '',
    po_date: new Date().toISOString().slice(0, 10),
    expected_date: '',
    notes: '',
    items: [emptyLine()],
  })

  // Create GRN state
  const [showCreateGrn, setShowCreateGrn] = useState(false)
  const [grnSourcePo, setGrnSourcePo] = useState(null)
  const [grnForm, setGrnForm] = useState({
    received_date: new Date().toISOString().slice(0, 10),
    vehicle_number: '',
    warehouse_id: '',
    notes: '',
  })

  // Detail modal
  const [detail, setDetail] = useState(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const [poRes, grnRes] = await Promise.all([
        purchaseOrders.getAll(),
        goodsReceipts.getAll(),
      ])
      if (poRes?.error) throw poRes.error
      if (grnRes?.error) throw grnRes.error
      setPoList(poRes?.data || [])
      setGrnList(grnRes?.data || [])
    } catch (err) {
      setLoadError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  // ─── PO CREATE ──────────────────────────────────────────
  const openCreatePo = () => {
    setPoForm({
      supplier_id: '',
      po_date: new Date().toISOString().slice(0, 10),
      expected_date: '',
      notes: '',
      items: [emptyLine()],
    })
    setShowCreatePo(true)
  }

  const addPoLine = () =>
    setPoForm(f => ({ ...f, items: [...f.items, emptyLine()] }))

  const removePoLine = (id) =>
    setPoForm(f => ({
      ...f,
      items: f.items.length > 1 ? f.items.filter(it => it.id !== id) : f.items,
    }))

  const updatePoLine = (id, patch) =>
    setPoForm(f => ({
      ...f,
      items: f.items.map(it => (it.id === id ? { ...it, ...patch } : it)),
    }))

  const onYarnChange = (lineId, yarnId) => {
    const yt = yarnTypes?.find(y => y.id === yarnId)
    updatePoLine(lineId, {
      yarn_type_id: yarnId,
      rate_per_unit: yt?.default_rate_per_kg || 0,
    })
  }

  const poSubtotal = useMemo(
    () =>
      poForm.items.reduce(
        (s, it) => s + Number(it.quantity || 0) * Number(it.rate_per_unit || 0),
        0,
      ),
    [poForm.items],
  )
  const poCgst = +(poSubtotal * 0.06).toFixed(2)
  const poSgst = +(poSubtotal * 0.06).toFixed(2)
  const poGrand = +(poSubtotal + poCgst + poSgst).toFixed(2)

  const submitPo = async () => {
    if (!poForm.supplier_id) {
      toast.error('Select a supplier')
      return
    }
    const valid = poForm.items.filter(it => it.yarn_type_id && Number(it.quantity) > 0)
    if (!valid.length) {
      toast.error('Add at least one yarn line with quantity')
      return
    }
    const { data, error } = await purchaseOrders.createWithItems({
      supplier_id: poForm.supplier_id,
      po_date: poForm.po_date,
      expected_date: poForm.expected_date || null,
      notes: poForm.notes,
      items: valid,
    })
    if (error) {
      toast.error(error.message || 'Failed to create PO')
      return
    }
    toast.success(`PO ${data.po_number} created`)
    setShowCreatePo(false)
    load()
  }

  // ─── GRN CREATE ─────────────────────────────────────────
  const openCreateGrn = (po) => {
    setGrnSourcePo(po)
    setGrnForm({
      received_date: new Date().toISOString().slice(0, 10),
      vehicle_number: '',
      warehouse_id: '',
      notes: '',
    })
    setShowCreateGrn(true)
  }

  const submitGrn = async () => {
    if (!grnSourcePo) return
    const { data, error } = await goodsReceipts.createFromPo({
      po_id: grnSourcePo.id,
      received_date: grnForm.received_date,
      vehicle_number: grnForm.vehicle_number,
      warehouse_id: grnForm.warehouse_id || null,
      notes: grnForm.notes,
    })
    if (error) {
      toast.error(error.message || 'Failed to record GRN')
      return
    }
    toast.success(`GRN ${data.grn_number} recorded — stock updated`)
    setShowCreateGrn(false)
    setGrnSourcePo(null)
    load()
  }

  // ─── FILTERS / TOTALS ───────────────────────────────────
  const filteredPos = useMemo(() => {
    if (!search.trim()) return poList
    const q = search.toLowerCase()
    return poList.filter(po =>
      (po.po_number || '').toLowerCase().includes(q) ||
      (po.suppliers?.firm || po.suppliers?.name || '').toLowerCase().includes(q)
    )
  }, [poList, search])

  const filteredGrns = useMemo(() => {
    if (!search.trim()) return grnList
    const q = search.toLowerCase()
    return grnList.filter(g =>
      (g.grn_number || '').toLowerCase().includes(q) ||
      (g.suppliers?.firm || g.suppliers?.name || '').toLowerCase().includes(q) ||
      (g.purchase_orders?.po_number || '').toLowerCase().includes(q)
    )
  }, [grnList, search])

  const totals = useMemo(() => ({
    poTotal: poList.reduce((s, p) => s + Number(p.grand_total || 0), 0),
    openPos: poList.filter(p => ['issued', 'partially_received'].includes(p.status)).length,
    grnCount: grnList.length,
  }), [poList, grnList])

  return (
    <div className="fade-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingBag size={20} className="text-indigo-600" /> Purchase
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${poList.length} POs · ${grnList.length} GRNs`}
          </p>
        </div>
        <Button onClick={openCreatePo}>
          <Plus size={15} /> New Purchase Order
        </Button>
      </div>

      {loadError && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-[13px] text-red-700">
          <strong>Failed to load:</strong> {loadError}
        </div>
      )}

      {/* Stat tiles */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Ordered</div>
          <div className="text-xl font-mono font-bold text-slate-800 mt-1">{fmtMoney(totals.poTotal)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Open POs</div>
          <div className="text-xl font-mono font-bold text-amber-700 mt-1">{totals.openPos}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRNs Recorded</div>
          <div className="text-xl font-mono font-bold text-emerald-700 mt-1">{totals.grnCount}</div>
        </div>
      </div>

      {/* View toggle + search */}
      <div className="flex items-center gap-2 mb-4">
        <div className="flex bg-slate-100 rounded-lg p-0.5">
          {[
            { k: 'pos', label: 'Purchase Orders' },
            { k: 'grns', label: 'Goods Receipts' },
          ].map(t => (
            <button
              key={t.k}
              onClick={() => setView(t.k)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${
                view === t.k ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1">
          <Input
            icon={Search}
            placeholder={view === 'pos' ? 'Search PO / supplier…' : 'Search GRN / PO / supplier…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        {view === 'pos' ? (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 border-b border-slate-100">
              <tr>
                {['PO #', 'Date', 'Supplier', 'Items', 'Grand Total', 'Status', ''].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPos.map(po => {
                const S = PO_STATUS[po.status] || PO_STATUS.draft
                const itemCount = (po.purchase_order_items || []).length
                const canReceive = ['issued', 'partially_received'].includes(po.status)
                return (
                  <tr key={po.id} onClick={() => setDetail(po)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 cursor-pointer">
                    <td className="px-4 py-3 font-mono text-[13px] font-semibold text-indigo-700">{po.po_number}</td>
                    <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(po.po_date)}</td>
                    <td className="px-4 py-3 text-slate-700">{po.suppliers?.firm || po.suppliers?.name || '—'}</td>
                    <td className="px-4 py-3 font-mono text-[13px]">{itemCount}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-800">{fmtMoney(po.grand_total)}</td>
                    <td className="px-4 py-3"><Badge variant={S.variant}>{S.label}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {canReceive && (
                        <button
                          onClick={e => { e.stopPropagation(); openCreateGrn(po) }}
                          className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-700"
                        >
                          Receive →
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {!filteredPos.length && !loading && (
                <tr><td colSpan={7} className="text-center py-12 text-sm text-slate-400">No purchase orders yet. Click &ldquo;New Purchase Order&rdquo; to create one.</td></tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50/60 border-b border-slate-100">
              <tr>
                {['GRN #', 'Date', 'Supplier', 'PO #', 'Items', 'Vehicle'].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredGrns.map(g => (
                <tr key={g.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-[13px] font-semibold text-indigo-700 flex items-center gap-2">
                    <FileText size={13} /> {g.grn_number}
                  </td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(g.received_date)}</td>
                  <td className="px-4 py-3 text-slate-700">{g.suppliers?.firm || g.suppliers?.name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-slate-500">{g.purchase_orders?.po_number || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[13px]">{(g.goods_receipt_items || []).length}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-600 font-mono">{g.vehicle_number || '—'}</td>
                </tr>
              ))}
              {!filteredGrns.length && !loading && (
                <tr><td colSpan={6} className="text-center py-12 text-sm text-slate-400">No goods receipts yet. Create a PO then click &ldquo;Receive&rdquo; on it.</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE PO MODAL */}
      <Modal
        isOpen={showCreatePo}
        onClose={() => setShowCreatePo(false)}
        title="New Purchase Order"
        size="2xl"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowCreatePo(false)}>Cancel</Button>
          <Button size="sm" onClick={submitPo}>Issue PO</Button>
        </>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-3">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Supplier</label>
              <select
                value={poForm.supplier_id}
                onChange={e => setPoForm(f => ({ ...f, supplier_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
              >
                <option value="">— select supplier —</option>
                {(suppliers || []).map(s => (
                  <option key={s.id} value={s.id}>{s.firm || s.name}</option>
                ))}
              </select>
            </div>
            <Input label="PO Date" type="date" value={poForm.po_date} onChange={e => setPoForm(f => ({ ...f, po_date: e.target.value }))} />
            <Input label="Expected Date" type="date" value={poForm.expected_date} onChange={e => setPoForm(f => ({ ...f, expected_date: e.target.value }))} />
            <Input label="Notes" value={poForm.notes} onChange={e => setPoForm(f => ({ ...f, notes: e.target.value }))} />
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Line Items</label>
              <button onClick={addPoLine} className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1">
                <Plus size={12} /> Add Line
              </button>
            </div>
            <div className="space-y-2">
              {poForm.items.map((it) => {
                const amt = Number(it.quantity || 0) * Number(it.rate_per_unit || 0)
                return (
                  <div key={it.id} className="grid grid-cols-12 gap-2 items-end bg-slate-50/60 rounded-lg p-2">
                    <div className="col-span-5">
                      <select
                        value={it.yarn_type_id}
                        onChange={e => onYarnChange(it.id, e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                      >
                        <option value="">— yarn —</option>
                        {(yarnTypes || []).map(y => (
                          <option key={y.id} value={y.id}>
                            {y.name}{y.count_or_denier ? ` · ${y.count_or_denier}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        step="0.001"
                        value={it.quantity}
                        onChange={e => updatePoLine(it.id, { quantity: parseFloat(e.target.value) || 0 })}
                        placeholder="Qty"
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1">
                      <input
                        type="text"
                        value={it.unit}
                        onChange={e => updatePoLine(it.id, { unit: e.target.value })}
                        className="w-full px-2 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-2">
                      <input
                        type="number"
                        step="0.01"
                        value={it.rate_per_unit}
                        onChange={e => updatePoLine(it.id, { rate_per_unit: parseFloat(e.target.value) || 0 })}
                        placeholder="Rate"
                        className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
                      />
                    </div>
                    <div className="col-span-1 text-right text-[12px] font-mono text-slate-700 font-semibold">
                      {fmtMoney(amt)}
                    </div>
                    <button
                      onClick={() => removePoLine(it.id)}
                      className="col-span-1 p-2 text-slate-400 hover:text-red-600 justify-self-end"
                    >
                      <X size={14} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Totals */}
          <div className="bg-indigo-50/50 rounded-xl p-4 space-y-1.5 font-mono text-[12px]">
            <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmtMoney(poSubtotal)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">CGST (6%)</span><span>{fmtMoney(poCgst)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">SGST (6%)</span><span>{fmtMoney(poSgst)}</span></div>
            <div className="border-t border-indigo-200/60 pt-1.5 flex justify-between text-sm font-bold">
              <span className="text-slate-700">Grand Total</span>
              <span className="text-indigo-700">{fmtMoney(poGrand)}</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400">GST defaults to 12% (split 6/6) — matches standard yarn HSN codes. Adjust manually after creation if your supplier is interstate (IGST) or a different rate applies.</p>
        </div>
      </Modal>

      {/* CREATE GRN MODAL */}
      <Modal
        isOpen={showCreateGrn}
        onClose={() => { setShowCreateGrn(false); setGrnSourcePo(null) }}
        title={grnSourcePo ? `Receive Goods — ${grnSourcePo.po_number}` : 'Receive Goods'}
        size="lg"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => { setShowCreateGrn(false); setGrnSourcePo(null) }}>Cancel</Button>
          <Button size="sm" onClick={submitGrn}>Record GRN</Button>
        </>}
      >
        {grnSourcePo && (
          <div className="space-y-4">
            <div className="bg-slate-50/60 rounded-xl p-3 text-[12px]">
              <div className="flex justify-between font-semibold text-slate-700">
                <span>{grnSourcePo.suppliers?.firm || grnSourcePo.suppliers?.name}</span>
                <span className="font-mono text-indigo-700">{grnSourcePo.po_number}</span>
              </div>
              <div className="mt-2 space-y-1">
                {(grnSourcePo.purchase_order_items || []).map(it => {
                  const remaining = Number(it.quantity) - Number(it.quantity_received || 0)
                  return (
                    <div key={it.id} className="flex justify-between text-[12px] font-mono">
                      <span className="text-slate-600">{it.yarn_types?.name || 'Unknown yarn'}</span>
                      <span className={`${remaining > 0 ? 'text-amber-700 font-semibold' : 'text-slate-400'}`}>
                        {fmt(remaining)} {it.unit} remaining
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">All remaining quantities will be received in this GRN. For partial receipts, edit after creation.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Input label="Received Date" type="date" value={grnForm.received_date} onChange={e => setGrnForm(f => ({ ...f, received_date: e.target.value }))} />
              <Input label="Vehicle Number" placeholder="RJ14-XX-1234" value={grnForm.vehicle_number} onChange={e => setGrnForm(f => ({ ...f, vehicle_number: e.target.value }))} />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Warehouse</label>
              <select
                value={grnForm.warehouse_id}
                onChange={e => setGrnForm(f => ({ ...f, warehouse_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
              >
                <option value="">— none —</option>
                {(warehouses || []).map(w => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <Input label="Notes" value={grnForm.notes} onChange={e => setGrnForm(f => ({ ...f, notes: e.target.value }))} />
            <p className="text-[11px] text-slate-400">On save: auto-generates GRN number, bumps PO quantities, inserts stock-in movements, and marks the PO as <strong>received</strong> / <strong>partial</strong>.</p>
          </div>
        )}
      </Modal>

      {/* DETAIL MODAL */}
      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title={detail ? `PO ${detail.po_number}` : ''}
        size="lg"
      >
        {detail && (
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Supplier</div>
                <div className="font-medium">{detail.suppliers?.firm || detail.suppliers?.name}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">GSTIN</div>
                <div className="font-mono">{detail.suppliers?.gstin || '—'}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">PO Date</div>
                <div className="font-mono">{fmtDate(detail.po_date)}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase">Expected</div>
                <div className="font-mono">{fmtDate(detail.expected_date)}</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-bold text-slate-400 uppercase mb-2">Line Items</div>
              <div className="bg-slate-50/60 rounded-xl divide-y divide-slate-100">
                {(detail.purchase_order_items || []).map(it => (
                  <div key={it.id} className="px-3 py-2 flex items-center justify-between text-[12px]">
                    <div className="flex-1">
                      <div className="font-medium text-slate-700">{it.yarn_types?.name || 'Unknown yarn'}</div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {fmt(it.quantity_received || 0)} / {fmt(it.quantity)} {it.unit} received
                      </div>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-slate-700 font-semibold">{fmtMoney(it.amount)}</div>
                      <div className="text-[11px] text-slate-400">@ {fmtMoney(it.rate_per_unit)}/{it.unit}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-50/60 rounded-xl p-3 space-y-1.5 font-mono text-[12px]">
              <div className="flex justify-between"><span className="text-slate-500">Subtotal</span><span>{fmtMoney(detail.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">CGST</span><span>{fmtMoney(detail.cgst_amount)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">SGST</span><span>{fmtMoney(detail.sgst_amount)}</span></div>
              {detail.igst_amount > 0 && <div className="flex justify-between"><span className="text-slate-500">IGST</span><span>{fmtMoney(detail.igst_amount)}</span></div>}
              <div className="border-t border-slate-200 pt-1.5 flex justify-between text-sm font-bold">
                <span>Grand Total</span>
                <span className="text-indigo-700">{fmtMoney(detail.grand_total)}</span>
              </div>
            </div>

            {['issued', 'partially_received'].includes(detail.status) && (
              <div className="flex justify-end">
                <Button size="sm" onClick={() => { setDetail(null); openCreateGrn(detail) }}>
                  <Truck size={14} /> Receive Goods
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
