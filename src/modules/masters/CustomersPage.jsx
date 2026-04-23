import { useState, useEffect } from 'react'
import { customers } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal } from '../../components/ui'
import { Plus, Edit2, Trash2, Users, Search } from 'lucide-react'

export default function CustomersPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  // QA audit H-04 — legacy Busy-Win imports include rows prefixed
  // "(C A N C E L L E D) -". Hide them from the working list by default.
  const [showCancelled, setShowCancelled] = useState(false)
  const emptyForm = { firm_name: '', contact_name: '', phone: '', email: '', city: '', address: '', gstin: '', pan: '' }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { if (user?.id) fetchData() }, [user?.id])

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
    setSaving(true)
    try {
      const { error } = editingId
        ? await customers.update(editingId, form)
        : await customers.create({ ...form, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Customer updated' : 'Customer added')
      setShowModal(false); fetchData()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    // Referential integrity pre-check — prevent FK crash or silent cascade
    const [oc, ic, ec] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('customer_id', id),
      supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('customer_id', id),
      supabase.from('enquiries').select('id', { count: 'exact', head: true }).eq('customer_id', id),
    ])
    const total = (oc.count || 0) + (ic.count || 0) + (ec.count || 0)
    if (total > 0) {
      toast.error(`Cannot delete — customer has ${oc.count || 0} orders, ${ic.count || 0} invoices, ${ec.count || 0} enquiries.`)
      return
    }
    if (!confirm('Delete this customer? This cannot be undone.')) return
    const { error } = await customers.delete(id)
    if (error) toast.error(error.message || 'Failed to delete')
    else { toast.success('Customer deleted'); fetchData() }
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
    { key: 'actions', label: '', render: (_, r) => (
      <div className="flex gap-0.5">
        <button onClick={() => openModal(r)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14} /></button>
        <button onClick={(e) => handleDelete(e, r.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
      </div>
    )},
  ]

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
          <Input label="Phone" value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} />
          <Input label="Email" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <Input label="City" value={form.city || ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
          <Input label="GSTIN" value={form.gstin || ''} onChange={e => setForm(p => ({ ...p, gstin: e.target.value.toUpperCase().slice(0, 15) }))} />
          <Input label="PAN" value={form.pan || ''} onChange={e => setForm(p => ({ ...p, pan: e.target.value.toUpperCase().slice(0, 10) }))} className="col-span-2" />
          <Input label="Address" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="col-span-2" />
        </div>
      </Modal>
    </div>
  )
}
