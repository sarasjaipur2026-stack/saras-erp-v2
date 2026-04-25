import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { customers, setCustomerCreditHold, safe } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal } from '../../components/ui'
import { Plus, Edit2, Trash2, Search, Lock, Unlock } from 'lucide-react'

// GSTIN pattern: 2-digit state + 10-char PAN + 1 entity + 1 'Z' + 1 checksum.
// https://docs.gst.gov.in/Laws-and-Rules/gstin-format
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

const validateGstin = (v) => {
  if (!v) return null // optional
  if (v.length !== 15) return 'GSTIN must be 15 characters'
  if (!GSTIN_RE.test(v)) return 'Invalid GSTIN format'
  return null
}

const validatePan = (v) => {
  if (!v) return null
  if (!/^[A-Z]{5}\d{4}[A-Z]{1}$/.test(v)) return 'Invalid PAN format'
  return null
}

const validatePhone = (v) => {
  if (!v) return null
  if (!/^\d{10}$/.test(v)) return 'Phone must be 10 digits'
  return null
}

export default function CustomersPage() {
  const { user, canManage } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  // Credit-hold toggle modal
  const [holdTarget, setHoldTarget] = useState(null)
  const [holdReason, setHoldReason] = useState('')
  const [holdSaving, setHoldSaving] = useState(false)
  // QA audit H-04 — legacy Busy-Win imports include rows prefixed
  // "(C A N C E L L E D) -". Hide them from the working list by default.
  const [showCancelled, setShowCancelled] = useState(false)
  const emptyForm = { firm_name: '', contact_name: '', phone: '', email: '', city: '', address: '', gstin: '', pan: '' }
  const [form, setForm] = useState(emptyForm)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user?.id) fetchData() }, [user?.id])

  // Honor ?new=1 from Ctrl+K palette quick-action — auto-open the Add modal
  // on first mount when the param is present.
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    if (searchParams.get('new') === '1') {
      openModal()
      // Strip the param so a refresh doesn't re-trigger.
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    const { data, error } = await customers.list(user.id)
    if (error) toast.error('Failed to load customers')
    else setList(data || [])
    setIsLoading(false)
  }

  const openModal = (customer = null) => {
    if (customer) { setEditingId(customer.id); setForm({ ...customer }) }
    else { setEditingId(null); setForm(emptyForm) }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.firm_name || !form.contact_name) { toast.error('Firm name and contact name required'); return }
    // Soft-validate optional fields — block on malformed not missing
    const gstinErr = validateGstin(form.gstin)
    const panErr = validatePan(form.pan)
    const phoneErr = validatePhone(form.phone)
    if (gstinErr) { toast.error(gstinErr); return }
    if (panErr) { toast.error(panErr); return }
    if (phoneErr) { toast.error(phoneErr); return }

    setSaving(true)
    try {
      const payload = { ...form }
      // GSTIN first 2 digits = state code. Keep state_code in sync automatically
      // so intra/inter-state GST split in orders uses the right rate.
      if (form.gstin && form.gstin.length >= 2) {
        payload.state_code = form.gstin.slice(0, 2)
      }
      const { error } = editingId
        ? await customers.update(editingId, payload)
        : await customers.create({ ...payload, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Customer updated' : 'Customer added')
      setShowModal(false); fetchData()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleDelete = async (e, id, customer) => {
    e.stopPropagation()
    // Referential integrity pre-check — prevent FK crash or silent cascade
    const [oc, ic, ec] = await Promise.all([
      safe(() => supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', id)),
      safe(() => supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('customer_id', id)),
      safe(() => supabase.from('enquiries').select('id', { count: 'exact', head: true }).eq('customer_id', id)),
    ])
    const total = (oc.count || 0) + (ic.count || 0) + (ec.count || 0)
    if (total > 0) {
      toast.error(`Cannot delete — customer has ${oc.count || 0} orders, ${ic.count || 0} invoices, ${ec.count || 0} enquiries.`)
      return
    }

    // Deferred-delete + undo: remove from UI immediately, commit to DB after 6s,
    // operator can undo within the window. Better than modal confirm() because
    // the common case ("oops, wrong one") is one click and no dialog flow.
    setList(prev => prev.filter(c => c.id !== id))
    let cancelled = false
    setTimeout(async () => {
      if (cancelled) return
      const { error } = await customers.delete(id)
      if (error) {
        toast.error(error.message || 'Failed to delete')
        fetchData() // refetch to restore UI from server truth
      }
    }, 6000)

    toast.action(`${customer.firm_name || 'Customer'} removed`, {
      label: 'Undo',
      duration: 6000,
      onClick: () => {
        cancelled = true
        setList(prev => [...prev, customer])
      },
    })
  }

  const isCancelled = (c) => /^\(\s*C\s*A\s*N\s*C\s*E\s*L\s*L\s*E\s*D\s*\)/i.test(c.firm_name || '')
  const cancelledCount = list.filter(isCancelled).length
  const activeList = showCancelled ? list : list.filter(c => !isCancelled(c))
  const filtered = activeList.filter(c =>
    (c.contact_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.firm_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const columns = [
    { key: 'firm_name', label: 'Firm', render: (v, r) => (
      <div><div className="font-medium text-slate-700 text-[13px]">{v}</div><div className="text-[11px] text-slate-400 mt-0.5">{r.contact_name}</div></div>
    )},
    { key: 'phone', label: 'Phone', render: v => v ? <span className="tabular-nums">{v}</span> : <span className="text-slate-300">-</span> },
    { key: 'city', label: 'City', render: v => v || <span className="text-slate-300">-</span> },
    { key: 'gstin', label: 'GSTIN', render: v => v
      ? <span className="font-mono text-[11px] text-slate-500">{v}</span>
      : <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-1.5 py-0.5">⚠ Missing</span>
    },
    { key: 'credit_hold', label: 'Credit', render: (v, r) => r.credit_hold
      ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-red-700 bg-red-50 border border-red-200 rounded-md px-1.5 py-0.5" title={r.credit_hold_reason || 'On credit hold'}><Lock size={10} /> On hold</span>
      : <span className="text-[11px] text-slate-400">OK</span>
    },
    { key: 'actions', label: '', render: (_, r) => (
      <div className="flex gap-0.5">
        {canManage && (
          <button
            onClick={() => { setHoldTarget(r); setHoldReason(r.credit_hold_reason || '') }}
            className={`p-1.5 rounded-lg transition-colors ${r.credit_hold ? 'hover:bg-green-50 text-green-600' : 'hover:bg-red-50 text-slate-400 hover:text-red-600'}`}
            title={r.credit_hold ? 'Release credit hold' : 'Place on credit hold'}
          >
            {r.credit_hold ? <Unlock size={14} /> : <Lock size={14} />}
          </button>
        )}
        <button onClick={() => openModal(r)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14} /></button>
        <button onClick={(e) => handleDelete(e, r.id, r)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
      </div>
    )},
  ]

  const handleHoldConfirm = async () => {
    if (!holdTarget || holdSaving) return
    setHoldSaving(true)
    try {
      const placing = !holdTarget.credit_hold
      if (placing && !holdReason.trim()) {
        toast.error('Reason required when placing on hold')
        setHoldSaving(false)
        return
      }
      const { data, error } = await setCustomerCreditHold(holdTarget.id, {
        onHold: placing,
        reason: holdReason.trim(),
      })
      if (error) throw error
      setList(prev => prev.map(c => c.id === holdTarget.id ? { ...c, credit_hold: data?.credit_hold ?? placing, credit_hold_reason: data?.credit_hold_reason ?? null } : c))
      toast.success(placing ? 'Customer placed on credit hold' : 'Credit hold released')
      setHoldTarget(null)
      setHoldReason('')
    } catch (err) {
      toast.error(err?.message || 'Failed to update credit hold')
    } finally {
      setHoldSaving(false)
    }
  }

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Customers</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">
            {activeList.length.toLocaleString('en-IN')} customers
            {cancelledCount > 0 && !showCancelled && (
              <> · <button type="button" onClick={() => setShowCancelled(true)}
                className="text-indigo-600 hover:underline">+{cancelledCount} cancelled hidden</button></>
            )}
            {showCancelled && cancelledCount > 0 && (
              <> · <button type="button" onClick={() => setShowCancelled(false)}
                className="text-indigo-600 hover:underline">hide cancelled</button></>
            )}
          </p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus size={15} /> Add Customer
        </Button>
      </div>

      <div className="mb-4">
        <Input icon={Search} placeholder="Search by name or firm..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No customers found" />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Customer' : 'Add Customer'} size="lg"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>{editingId ? 'Update' : 'Add'}</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Firm Name" required value={form.firm_name} onChange={e => setForm(p => ({ ...p, firm_name: e.target.value }))} />
          <Input label="Contact Person" required value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} />
          <Input label="Phone" placeholder="10-digit mobile" value={form.phone || ''} error={validatePhone(form.phone)} onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} />
          <Input label="Email" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <Input label="City" value={form.city || ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
          <Input label="GSTIN" placeholder="22AAAAA0000A1Z5" value={form.gstin || ''} error={validateGstin(form.gstin)} onChange={e => setForm(p => ({ ...p, gstin: e.target.value.toUpperCase().slice(0, 15) }))} />
          <Input label="PAN" placeholder="AAAAA0000A" value={form.pan || ''} error={validatePan(form.pan)} onChange={e => setForm(p => ({ ...p, pan: e.target.value.toUpperCase().slice(0, 10) }))} className="col-span-2" />
          <Input label="Address" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="col-span-2" />
        </div>
      </Modal>

      {/* Credit hold toggle modal */}
      <Modal
        isOpen={!!holdTarget}
        onClose={() => { if (!holdSaving) { setHoldTarget(null); setHoldReason('') } }}
        title={holdTarget?.credit_hold ? 'Release credit hold' : 'Place on credit hold'}
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setHoldTarget(null); setHoldReason('') }} disabled={holdSaving}>Cancel</Button>
            <Button
              variant={holdTarget?.credit_hold ? 'primary' : 'danger'}
              size="sm"
              onClick={handleHoldConfirm}
              disabled={holdSaving || (!holdTarget?.credit_hold && !holdReason.trim())}
            >
              {holdSaving ? 'Saving…' : (holdTarget?.credit_hold ? 'Release' : 'Place on hold')}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="text-slate-700">
            <span className="font-semibold">{holdTarget?.firm_name}</span>
          </div>
          {holdTarget?.credit_hold ? (
            <>
              <p className="text-slate-600">Currently on hold{holdTarget?.credit_hold_reason ? `: "${holdTarget.credit_hold_reason}"` : ''}.</p>
              <p className="text-slate-600">Releasing will allow new orders without manager override.</p>
            </>
          ) : (
            <>
              <p className="text-slate-600">Blocks all new orders for this customer until released. Managers can override on a per-order basis; staff cannot.</p>
              <label className="block">
                <span className="block text-xs font-semibold text-slate-700 mb-1">Reason (required)</span>
                <textarea
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="e.g. cheque bounced, disputed invoice, insolvency notice…"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  disabled={holdSaving}
                />
              </label>
            </>
          )}
        </div>
      </Modal>
    </div>
  )
}
