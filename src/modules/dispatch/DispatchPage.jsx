import { useState, useEffect } from 'react'
import { deliveries, orders as ordersApi } from '../../lib/db'
import { useToast } from '../../contexts/ToastContext'
import { Button, Modal, Input, Badge } from '../../components/ui'
import { Truck, Plus, FileText } from 'lucide-react'
import { fmt, fmtDate } from '../../lib/format'

export default function DispatchPage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [availableOrders, setAvailableOrders] = useState([])
  const [form, setForm] = useState({ order_id: '', vehicle_number: '', driver_name: '', delivery_note: '' })
  const [loadError, setLoadError] = useState(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await deliveries.getAll()
      if (result?.error) throw result.error
      setList(result?.data || [])
    } catch (err) {
      setLoadError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const openCreate = async () => {
    const { data } = await ordersApi.getAll()
    setAvailableOrders((data || []).filter(o => ['approved', 'production', 'qc', 'booking'].includes(o.status)))
    setForm({ order_id: '', vehicle_number: '', driver_name: '', delivery_note: '' })
    setShowCreate(true)
  }

  const create = async () => {
    if (!form.order_id) { toast.error('Select an order'); return }
    const { data, error } = await deliveries.createFromOrder(form)
    if (error) { toast.error(error.message || 'Dispatch failed'); return }
    toast.success(`Dispatched — challan ${data.challan_number}`)
    setShowCreate(false)
    load()
  }

  // Group rows by challan_number for readability
  const groups = list.reduce((acc, d) => {
    const key = d.challan_number || d.id
    if (!acc[key]) acc[key] = { challan_number: d.challan_number, order: d.orders, rows: [], date: d.delivery_date, vehicle: d.vehicle_number, driver: d.driver_name }
    acc[key].rows.push(d)
    return acc
  }, {})
  const grouped = Object.values(groups).sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  return (
    <div className="fade-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Truck size={20} className="text-indigo-600" /> Dispatch
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${grouped.length} challans · ${list.length} line deliveries`}
          </p>
        </div>
        <Button onClick={openCreate}><Plus size={15} /> New Dispatch</Button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {['Challan', 'Date', 'Order', 'Customer', 'Lines', 'Vehicle', 'Driver'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.map(g => (
              <tr key={g.challan_number} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                <td className="px-4 py-3 font-mono text-[13px] font-semibold text-indigo-700 flex items-center gap-2">
                  <FileText size={13} /> {g.challan_number || '—'}
                </td>
                <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(g.date)}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-indigo-700">{g.order?.order_number || '—'}</td>
                <td className="px-4 py-3 text-slate-700">{g.order?.customers?.firm_name || '—'}</td>
                <td className="px-4 py-3 font-mono text-[13px]">
                  {g.rows.length} × {fmt(g.rows.reduce((s, r) => s + Number(r.quantity_delivered || 0), 0))}
                </td>
                <td className="px-4 py-3 text-[12px] text-slate-600 font-mono">{g.vehicle || '—'}</td>
                <td className="px-4 py-3 text-[12px] text-slate-600">{g.driver || '—'}</td>
              </tr>
            ))}
            {!grouped.length && !loading && (
              <tr><td colSpan={7} className="text-center py-12 text-sm text-slate-400">No dispatches yet. Click “New Dispatch” to create a challan from an approved order.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        title="Create Dispatch Challan"
        size="lg"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button size="sm" onClick={create} disabled={!form.order_id}>Create Challan</Button>
        </>}
      >
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Order</label>
            {availableOrders.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">No eligible orders. Approve an order first.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2 border border-slate-200 rounded-xl p-2">
                {availableOrders.map(o => (
                  <label key={o.id} className={`flex items-start gap-3 p-2.5 rounded-lg cursor-pointer transition ${form.order_id === o.id ? 'bg-indigo-50/70 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'}`}>
                    <input type="radio" checked={form.order_id === o.id} onChange={() => setForm(f => ({ ...f, order_id: o.id }))} className="mt-1" />
                    <div className="flex-1">
                      <div className="font-mono text-[13px] font-semibold text-indigo-700">{o.order_number || 'Draft'}</div>
                      <div className="text-[12px] text-slate-600">{o.customers?.firm_name || '—'}</div>
                      <div className="text-[11px] text-slate-400">{o.order_line_items?.length || 0} lines · {o.status}</div>
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Vehicle Number" placeholder="RJ14-XX-1234" value={form.vehicle_number} onChange={e => setForm(f => ({ ...f, vehicle_number: e.target.value }))} />
            <Input label="Driver Name" value={form.driver_name} onChange={e => setForm(f => ({ ...f, driver_name: e.target.value }))} />
          </div>
          <Input label="Delivery Note" placeholder="Handle with care…" value={form.delivery_note} onChange={e => setForm(f => ({ ...f, delivery_note: e.target.value }))} />
          <p className="text-[11px] text-slate-400">Creates one delivery row per line item, auto-generates challan number, records stock-out movement, and moves order to <strong>dispatch</strong> status.</p>
        </div>
      </Modal>
    </div>
  )
}
