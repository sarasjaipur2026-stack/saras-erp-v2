import { useState, useEffect, useMemo } from 'react'
import { invoices, orders as ordersApi } from '../../lib/db'
import { useToast } from '../../contexts/ToastContext'
import { usePagination } from '../../hooks/usePagination'
import { Button, Modal, Badge, Input, PaginationBar } from '../../components/ui'
import { FileText, Plus, Search } from 'lucide-react'
import { fmtMoney, fmtDate } from '../../lib/format'

const STATUS = {
  draft:          { variant: 'default', label: 'Draft' },
  issued:         { variant: 'info', label: 'Issued' },
  partially_paid: { variant: 'warning', label: 'Partial' },
  paid:           { variant: 'success', label: 'Paid' },
  cancelled:      { variant: 'danger', label: 'Cancelled' },
}

export default function InvoicesPage() {
  const toast = useToast()
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [availableOrders, setAvailableOrders] = useState([])
  const [picked, setPicked] = useState('')
  const [detail, setDetail] = useState(null)
  const [loadError, setLoadError] = useState(null)

  const load = async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const result = await invoices.getAll()
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
    setAvailableOrders((data || []).filter(o => ['dispatch', 'completed', 'approved', 'production'].includes(o.status)))
    setPicked('')
    setShowCreate(true)
  }

  const create = async () => {
    if (!picked) return
    try {
      const { data, error } = await invoices.createFromOrder(picked)
      if (error) { toast.error(error.message || 'Invoice creation failed'); return }
      toast.success(`Invoice ${data.invoice_number} created`)
      setShowCreate(false)
      load()
    } catch (err) {
      toast.error('Invoice creation failed — check connection')
    }
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(i =>
      (i.invoice_number || '').toLowerCase().includes(q) ||
      (i.customers?.firm_name || '').toLowerCase().includes(q) ||
      (i.orders?.order_number || '').toLowerCase().includes(q)
    )
  }, [list, search])

  const { pageData, currentPage, totalPages, needsPagination, rangeLabel, setCurrentPage } = usePagination(filtered)

  const totals = useMemo(() => ({
    invoiced: list.reduce((s, i) => s + Number(i.grand_total || 0), 0),
    collected: list.reduce((s, i) => s + Number(i.amount_paid || 0), 0),
    outstanding: list.reduce((s, i) => s + Number(i.balance_due || 0), 0),
  }), [list])

  return (
    <div className="fade-in max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText size={20} className="text-indigo-600" /> Invoices
          </h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {loading ? 'Loading…' : `${list.length} invoices`}
          </p>
        </div>
        <Button onClick={openCreate}><Plus size={15} /> New Invoice</Button>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invoiced</div>
          <div className="text-xl font-mono font-bold text-slate-800 mt-1">{fmtMoney(totals.invoiced)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Collected</div>
          <div className="text-xl font-mono font-bold text-emerald-700 mt-1">{fmtMoney(totals.collected)}</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 p-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Outstanding</div>
          <div className="text-xl font-mono font-bold text-amber-700 mt-1">{fmtMoney(totals.outstanding)}</div>
        </div>
      </div>

      <Input icon={Search} placeholder="Search invoice / order / customer…" value={search} onChange={e => setSearch(e.target.value)} className="mb-4" />

      <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50/60 border-b border-slate-100">
            <tr>
              {['Invoice #', 'Date', 'Customer', 'Order', 'Grand Total', 'Paid', 'Balance', 'Status'].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageData.map(inv => {
              const S = STATUS[inv.status] || STATUS.draft
              return (
                <tr key={inv.id} onClick={() => setDetail(inv)} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50 cursor-pointer">
                  <td className="px-4 py-3 font-mono text-[13px] font-semibold text-indigo-700">{inv.invoice_number}</td>
                  <td className="px-4 py-3 text-[12px] text-slate-500 font-mono">{fmtDate(inv.invoice_date)}</td>
                  <td className="px-4 py-3 text-slate-700">{inv.customers?.firm_name || '—'}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-slate-500">{inv.orders?.order_number || '—'}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-800">{fmtMoney(inv.grand_total)}</td>
                  <td className="px-4 py-3 font-mono text-emerald-700">{fmtMoney(inv.amount_paid)}</td>
                  <td className="px-4 py-3 font-mono text-amber-700">{fmtMoney(inv.balance_due)}</td>
                  <td className="px-4 py-3"><Badge variant={S.variant}>{S.label}</Badge></td>
                </tr>
              )
            })}
            {!filtered.length && !loading && (
              <tr><td colSpan={8} className="text-center py-12 text-sm text-slate-400">No invoices yet. Click “New Invoice” to generate one from an order.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {needsPagination && <PaginationBar currentPage={currentPage} totalPages={totalPages} rangeLabel={rangeLabel} onPageChange={setCurrentPage} />}

      {/* Create modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="Create Invoice from Order"
        footer={<>
          <Button variant="secondary" size="sm" onClick={() => setShowCreate(false)}>Cancel</Button>
          <Button size="sm" onClick={create} disabled={!picked}>Create Invoice</Button>
        </>}
      >
        {availableOrders.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No eligible orders. An order must be approved or further along to invoice.</p>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {availableOrders.map(o => (
              <label key={o.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition ${picked === o.id ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 hover:border-slate-300'}`}>
                <input type="radio" name="ord" checked={picked === o.id} onChange={() => setPicked(o.id)} className="mt-1" />
                <div className="flex-1">
                  <div className="font-mono text-[13px] font-semibold text-indigo-700">{o.order_number || 'Draft'}</div>
                  <div className="text-[12px] text-slate-600">{o.customers?.firm_name || '—'}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                    Grand Total: {fmtMoney(o.grand_total)} · {o.status}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}
      </Modal>

      {/* Detail modal */}
      <Modal isOpen={!!detail} onClose={() => setDetail(null)} title={detail ? `Invoice ${detail.invoice_number}` : ''} size="lg">
        {detail && (
          <div className="space-y-4 text-[13px]">
            <div className="grid grid-cols-2 gap-3">
              <div><div className="text-[10px] font-bold text-slate-400 uppercase">Customer</div><div className="font-medium">{detail.customers?.firm_name}</div></div>
              <div><div className="text-[10px] font-bold text-slate-400 uppercase">GSTIN</div><div className="font-mono">{detail.customers?.gstin || '—'}</div></div>
              <div><div className="text-[10px] font-bold text-slate-400 uppercase">Invoice Date</div><div className="font-mono">{fmtDate(detail.invoice_date)}</div></div>
              <div><div className="text-[10px] font-bold text-slate-400 uppercase">Due Date</div><div className="font-mono">{fmtDate(detail.due_date)}</div></div>
            </div>
            <div className="bg-slate-50/60 rounded-xl p-4 space-y-1.5">
              <div className="flex justify-between text-[12px]"><span className="text-slate-500">Subtotal</span><span className="font-mono">{fmtMoney(detail.subtotal)}</span></div>
              {detail.cgst_amount > 0 && <div className="flex justify-between text-[12px]"><span className="text-slate-500">CGST</span><span className="font-mono">{fmtMoney(detail.cgst_amount)}</span></div>}
              {detail.sgst_amount > 0 && <div className="flex justify-between text-[12px]"><span className="text-slate-500">SGST</span><span className="font-mono">{fmtMoney(detail.sgst_amount)}</span></div>}
              {detail.igst_amount > 0 && <div className="flex justify-between text-[12px]"><span className="text-slate-500">IGST</span><span className="font-mono">{fmtMoney(detail.igst_amount)}</span></div>}
              <div className="border-t border-slate-200/70 pt-1.5 flex justify-between text-sm font-bold"><span>Grand Total</span><span className="font-mono text-indigo-700">{fmtMoney(detail.grand_total)}</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-slate-500">Amount Paid</span><span className="font-mono text-emerald-700">{fmtMoney(detail.amount_paid)}</span></div>
              <div className="flex justify-between text-[12px]"><span className="text-slate-500">Balance Due</span><span className="font-mono text-amber-700 font-semibold">{fmtMoney(detail.balance_due)}</span></div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
