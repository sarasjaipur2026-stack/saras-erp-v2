import { useState, useEffect } from 'react'
import { chargeTypes } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal } from '../../components/ui'
import { Plus, Edit2, Trash2 } from 'lucide-react'

export default function ChargeTypesPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const emptyForm = { name: '', scope: 'per_order', default_amount: '', is_taxable: false, is_active: true }
  const [form, setForm] = useState(emptyForm)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user?.id) fetchData() }, [user?.id])

  const fetchData = async () => {
    setIsLoading(true)
    const { data, error } = await chargeTypes.list(user.id)
    if (error) toast.error('Failed to load charge types')
    else setList(data || [])
    setIsLoading(false)
  }

  const openModal = (chargeType = null) => {
    if (chargeType) { setEditingId(chargeType.id); setForm({ ...chargeType }) }
    else { setEditingId(null); setForm(emptyForm) }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name) { toast.error('Charge type name required'); return }
    setSaving(true)
    try {
      const { error } = editingId
        ? await chargeTypes.update(editingId, form)
        : await chargeTypes.create({ ...form, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Charge type updated' : 'Charge type added')
      setShowModal(false); fetchData()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleDelete = async (e, id, row) => {
    e.stopPropagation()
    setList(prev => prev.filter(c => c.id !== id))
    let cancelled = false
    setTimeout(async () => {
      if (cancelled) return
      const { error } = await chargeTypes.delete(id)
      if (error) { toast.error(error.message || 'Failed to delete'); fetchData() }
    }, 6000)
    toast.action(`${row?.name || 'Charge type'} removed`, {
      label: 'Undo', duration: 6000,
      onClick: () => { cancelled = true; setList(prev => [...prev, row]) },
    })
  }

  const filtered = list.filter(c =>
    (c.name || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const columns = [
    { key: 'name', label: 'Name', render: v => <div className="font-medium text-slate-700 text-[13px]">{v}</div> },
    { key: 'scope', label: 'Scope', render: v => <span className="text-[12px] text-slate-600 bg-slate-100 px-2 py-1 rounded">{v === 'per_order' ? 'Per Order' : 'Per Item'}</span> },
    { key: 'default_amount', label: 'Default Amount', render: v => v !== null ? <span className="tabular-nums font-medium">{v}</span> : <span className="text-slate-300">-</span> },
    { key: 'is_taxable', label: 'Taxable', render: v => <span className={`text-[12px] font-medium ${v ? 'text-green-600' : 'text-slate-400'}`}>{v ? 'Yes' : 'No'}</span> },
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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Charge Types</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{list.length} charge types</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus size={15} /> Add Charge Type
        </Button>
      </div>

      <div className="mb-4">
        <Input placeholder="Search by name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No charge types found" />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Charge Type' : 'Add Charge Type'} size="lg"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>{editingId ? 'Update' : 'Add'}</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Scope</label>
            <select value={form.scope} onChange={e => setForm(p => ({ ...p, scope: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="per_order">Per Order</option>
              <option value="per_item">Per Item</option>
            </select>
          </div>
          <Input label="Default Amount" type="number" step="0.01" value={form.default_amount || ''} onChange={e => setForm(p => ({ ...p, default_amount: e.target.value ? parseFloat(e.target.value) : '' }))} />
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_taxable} onChange={e => setForm(p => ({ ...p, is_taxable: e.target.checked }))} className="rounded border-slate-300" />
              <span className="text-sm text-slate-600">Taxable</span>
            </label>
          </div>
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
