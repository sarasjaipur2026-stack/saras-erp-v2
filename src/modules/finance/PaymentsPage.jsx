import { useState, useEffect, useMemo } from 'react'
import { payments, orders as ordersApi } from '../../lib/db'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { usePagination } from '../../hooks/usePagination'
import { Button, Modal, Badge, Input, PaginationBar } from '../../components/ui'
import { CreditCard, Plus, Search } from 'lucide-react'
import { fmtMoney, fmtDate } from '../../lib/format'

// NOTE: must match DB constraint `payments_payment_mode_check`
// Allowed: cash | cheque | upi | neft | rtgs | card | other
const MODES = ['cash', 'neft', 'rtgs', 'upi', 'cheque', 'card', 'other']

export default function PaymentsPage() {
  const toast = useToast()
  const { banks } = useApp()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [orderOptions, setOrderOptions] = useState([])
  const [form, setForm] = useState({
    order_id: '', amount: 0, payment_mode: 'neft',
    payment_date: new Date().toISOString().slice(0, 10),
    reference_number: '', bank_id: '', notes: '',
  })

  const [loadError, setLoadError] = useState(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await payments.getAll()
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
    try {
      const { data, error } = await ordersApi.getAll()
      if (error) { toast.error('Failed to load orders'); return }
      setOrderOptions((data || []).filter(o => (o.balance_due || 0) > 0))
      setForm(f => ({ ...f, order_id: '', amount: 0, reference_number: '', notes: '' }))
      setShowCreate(true)
    } catch {
      toast.error('Failed to load orders — check connection')
    }
  }

  const [saving, setSaving] = useState(false)

  const record = async () => {
    if (!form.order_id) { toast.error('Select an order'); return }
    if (!form.amount || form.amount <= 0) { toast.error('Enter a valid amount'); return }
    if (saving) return
    setSaving(true)
    try {
      const { error } = await payments.record(form)
      if (error) { toast.error(error.message || 'Save failed'); return }
      toast.success(`Payment of ${fmtMoney(form.amount)} recorded`)
      setShowCreate(false)
      load()
    // eslint-disable-next-line no-unused-vars
    } catch (err) {
      toast.error('Payment failed — check connection')
    } finally {
      setSaving(false)
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(p =>
      (p.orders?.order_number || '').toLowerCase().includes(q) ||
      (p.orders?.customers?.firm_name || '').toLowerCase().includes(q) ||
      (p.reference_number || '').toLowerCase().includes(q)
    )
  }, [list, search])

  const { pageData, currentPage, totalPages, needsPagination, rangeLabel, setCurrentPage } = usePagination(filtered)

  const total = list.reduce((s, p) => s + Number(p.amount || 0), 0)
  const selectedOrder = orderOptions.find(o => o.id === form.order_id)

  return (
    <div className="fade-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard size={20} className="text-indigo-600" /> Payments
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${list.length} payments · Total ${fmtMoney(total)}`}
          </p>
        </div>
        <Button onClick={openCreate}><Plus size={15} /> Record Payment</Button>
      </div>

      {loadError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-sm text-red-700">
          <strong>Failed to load:</strong> {loadError}
          <button onClick={load} className="ml-auto text-red-600 hover:text-red-800 font-semibold text-[12px]">Retry</button>
        </div>
      )}

      <Input icon={Search} placeholder="Search order / customer / reference…" value={search} onChange={e => setSearch(e.target.value)} className="mb-4" />

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {['Date', 'Order', 'Customer', 'Amount', 'Mode', 'Bank', 'Reference'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map(p => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(p.payment_date)}</td>
                <td className="px-4 py-3 font-mono text-[13px] text-indigo-700">{p.orders?.order_number || '—'}</td>
                <td className="px-4 py-3 text-slate-700">{p.orders?.customers?.firm_name || '—'}</td>
                <td className="px-4 py-3 font-mono font-semibold text-emerald-700">{fmtMoney(p.amount)}</td>
                <td className="px-4 py-3"><Badge variant="info">{p.payment_mode}</Badge></td>
                <td className="px-4 py-3 text-[12px] text-slate-600">{p.banks?.bank_name || '—'}</td>
                <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{p.reference_number || '—'}</td>
              </tr>
            ))}
            {!filtered.length && !loading && (
              <tr><td colSpan={7} className="text-center py-12 text-sm text-slate-400">No payments recorded yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {needsPagination && <PaginationBar currentPage={currentPage} totalPages={totalPages} rangeLabel={rangeLabel} onPageChange={setCurrentPage} />}

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Record Payment" size="lg"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button size="sm" onClick={record} disabled={saving}>{saving ? 'Recording…' : 'Record'}</Button>
        </>}
      >
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Order (with balance due)</label>
            {orderOptions.length === 0 ? (
              <p className="text-sm text-slate-400 py-4">No orders have outstanding balances.</p>
            ) : (
              <select
                value={form.order_id}
                onChange={e => {
                  const o = orderOptions.find(x => x.id === e.target.value)
                  setForm(f => ({ ...f, order_id: e.target.value, amount: o?.balance_due || 0 }))
                }}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
              >
                <option value="">— select order —</option>
                {orderOptions.map(o => (
                  <option key={o.id} value={o.id}>
                    {o.order_number || 'Draft'} — {o.customers?.firm_name || ''} — {fmtMoney(o.balance_due)} due
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedOrder && (
            <div className="bg-indigo-50/50 rounded-lg p-3 text-[12px] font-mono">
              <div className="flex justify-between"><span className="text-slate-500">Grand Total</span><span>{fmtMoney(selectedOrder.grand_total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Already Paid</span><span>{fmtMoney(selectedOrder.advance_paid)}</span></div>
              <div className="flex justify-between font-semibold"><span className="text-slate-600">Balance Due</span><span className="text-amber-700">{fmtMoney(selectedOrder.balance_due)}</span></div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Input label="Amount" type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) || 0 }))} />
            <Input label="Date" type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Mode</label>
              <select value={form.payment_mode} onChange={e => setForm(f => ({ ...f, payment_mode: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
              >
                {MODES.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide block mb-1.5">Bank</label>
              <select value={form.bank_id} onChange={e => setForm(f => ({ ...f, bank_id: e.target.value }))}
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 focus:outline-none"
              >
                <option value="">— none —</option>
                {(banks || []).map(b => <option key={b.id} value={b.id}>{b.bank_name}</option>)}
              </select>
            </div>
          </div>

          <Input label="Reference / Cheque / UTR" value={form.reference_number} onChange={e => setForm(f => ({ ...f, reference_number: e.target.value }))} />
          <Input label="Notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          <p className="text-[11px] text-slate-400">Automatically updates the order's balance due and any linked invoice. When balance reaches zero, the order is marked completed.</p>
        </div>
      </Modal>
    </div>
  )
}
