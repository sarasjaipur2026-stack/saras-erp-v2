import { useState, useEffect } from 'react'
import { brokers } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal } from '../../components/ui'
import { Plus, Edit2, Trash2 } from 'lucide-react'

export default function BrokersPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const emptyForm = { name: '', phone: '', email: '', commission_rate: '', city: '', is_active: true }
  const [form, setForm] = useState(emptyForm)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setIsLoading(true)
    const { data, error } = await brokers.getAll()
    if (error) toast.error('Failed to load brokers')
    else setList(data || [])
    setIsLoading(false)
  }

  const openModal = (broker = null) => {
    if (broker) { setEditingId(broker.id); setForm({ ...broker }) }
    else { setEditingId(null); setForm(emptyForm) }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name) { toast.error('Broker name required'); return }
    setSaving(true)
    try {
      const { error } = editingId
        ? await brokers.update(editingId, form)
        : await brokers.create({ ...form, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Broker updated' : 'Broker added')
      setShowModal(false); fetchData()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleDelete = async (e, id, row) => {
    e.stopPropagation()
    // Deferred-delete + undo: optimistic UI, commits to DB after 6s, undoable.
    setList(prev => prev.filter(b => b.id !== id))
    let cancelled = false
    setTimeout(async () => {
      if (cancelled) return
      const { error } = await brokers.delete(id)
      if (error) { toast.error(error.message || 'Failed to delete'); fetchData() }
    }, 6000)
    toast.action(`${row?.name || 'Broker'} removed`, {
      label: 'Undo', duration: 6000,
      onClick: () => { cancelled = true; setList(prev => [...prev, row]) },
    })
  }

  const filtered = list.filter(b =>
    (b.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.city || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const columns = [
    { key: 'name', label: 'Name', render: v => <div className="font-medium text-slate-700 text-[13px]">{v}</div> },
    { key: 'phone', label: 'Phone', render: v => v ? <span className="tabular-nums">{v}</span> : <span className="text-slate-300">-</span> },
    { key: 'commission_rate', label: 'Commission %', render: v => v !== null ? <span>{v}%</span> : <span className="text-slate-300">-</span> },
    { key: 'city', label: 'City', render: v => v || <span className="text-slate-300">-</span> },
    { key: 'is_active', label: 'Active', render: v => <span className={`text-[12px] font-medium ${v ? 'text-green-600' : 'text-slate-400'}`}>{v ? 'Yes' : 'No'}</span> },
    { key: 'actions', label: '', render: (_, r) => (
      <div className="flex gap-0.5">
        <button onClick={() => openModal(r)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14} /></button>
        <button onClick={(e) => handleDelete(e, r.id, r)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
      </div>
    )},
  ]

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Brokers</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{list.length} brokers</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus size={15} /> Add Broker
        </Button>
      </div>

      <div className="mb-4">
        <Input placeholder="Search by name or city..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No brokers found" />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Broker' : 'Add Broker'} size="lg"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>{editingId ? 'Update' : 'Add'}</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="Phone" value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} />
          <Input label="Email" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <Input label="Commission %" type="number" step="0.01" value={form.commission_rate || ''} onChange={e => setForm(p => ({ ...p, commission_rate: e.target.value ? parseFloat(e.target.value) : '' }))} />
          <Input label="City" value={form.city || ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_active} onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))} className="rounded border-slate-300" />
              <span className="text-sm text-slate-600">Active</span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
