import { useState, useEffect } from 'react'
import { paymentTerms } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal } from '../../components/ui'
import { Plus, Edit2, Trash2 } from 'lucide-react'

export default function PaymentTermsPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const emptyForm = { name: '', days: '', description: '', is_default: false, active: true }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { if (user?.id) fetchData() }, [user?.id])

  const fetchData = async () => {
    setIsLoading(true)
    const { data, error } = await paymentTerms.list(user.id)
    if (error) toast.error('Failed to load payment terms')
    else setList(data || [])
    setIsLoading(false)
  }

  const openModal = (term = null) => {
    if (term) { setEditingId(term.id); setForm({ ...term }) }
    else { setEditingId(null); setForm(emptyForm) }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name || form.days === '') { toast.error('Name and days required'); return }
    setSaving(true)
    try {
      const { error } = editingId
        ? await paymentTerms.update(editingId, form)
        : await paymentTerms.create({ ...form, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Payment term updated' : 'Payment term added')
      setShowModal(false); fetchData()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this payment term?')) return
    const { error } = await paymentTerms.delete(id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Payment term deleted'); fetchData() }
  }

  const filtered = list.filter(p =>
    (p.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const columns = [
    { key: 'name', label: 'Name', render: v => <div className="font-medium text-slate-700 text-[13px]">{v}</div> },
    { key: 'days', label: 'Days', render: v => <span className="tabular-nums font-medium">{v}</span> },
    { key: 'description', label: 'Description', render: v => v ? <span className="text-slate-600 text-[12px]">{v}</span> : <span className="text-slate-300">-</span> },
    { key: 'is_default', label: 'Default', render: v => <span className={`text-[12px] font-medium ${v ? 'text-indigo-600' : 'text-slate-400'}`}>{v ? 'Yes' : 'No'}</span> },
    { key: 'active', label: 'Active', render: v => <span className={`text-[12px] font-medium ${v ? 'text-green-600' : 'text-slate-400'}`}>{v ? 'Yes' : 'No'}</span> },
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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Payment Terms</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{list.length} payment terms</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus size={15} /> Add Payment Term
        </Button>
      </div>

      <div className="mb-4">
        <Input placeholder="Search by name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No payment terms found" />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Payment Term' : 'Add Payment Term'} size="lg"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>{editingId ? 'Update' : 'Add'}</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="Days" required type="number" value={form.days || ''} onChange={e => setForm(p => ({ ...p, days: e.target.value ? parseInt(e.target.value) : '' }))} />
          <Input label="Description" value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="col-span-2" />
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_default} onChange={e => setForm(p => ({ ...p, is_default: e.target.checked }))} className="rounded border-slate-300" />
              <span className="text-sm text-slate-600">Default</span>
            </label>
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.active} onChange={e => setForm(p => ({ ...p, active: e.target.checked }))} className="rounded border-slate-300" />
              <span className="text-sm text-slate-600">Active</span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
