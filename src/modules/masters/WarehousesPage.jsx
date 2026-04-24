import { useState, useEffect } from 'react'
import { warehouses } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal } from '../../components/ui'
import { Plus, Edit2, Trash2 } from 'lucide-react'

export default function WarehousesPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const emptyForm = { name: '', code: '', address: '', city: '', is_active: true }
  const [form, setForm] = useState(emptyForm)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user?.id) fetchData() }, [user?.id])

  const fetchData = async () => {
    setIsLoading(true)
    const { data, error } = await warehouses.list(user.id)
    if (error) toast.error('Failed to load warehouses')
    else setList(data || [])
    setIsLoading(false)
  }

  const openModal = (warehouse = null) => {
    if (warehouse) { setEditingId(warehouse.id); setForm({ ...warehouse }) }
    else { setEditingId(null); setForm(emptyForm) }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.code) { toast.error('Name and code required'); return }
    setSaving(true)
    try {
      const { error } = editingId
        ? await warehouses.update(editingId, form)
        : await warehouses.create({ ...form, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Warehouse updated' : 'Warehouse added')
      setShowModal(false); fetchData()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleDelete = async (e, id, row) => {
    e.stopPropagation()
    setList(prev => prev.filter(w => w.id !== id))
    let cancelled = false
    setTimeout(async () => {
      if (cancelled) return
      const { error } = await warehouses.delete(id)
      if (error) { toast.error(error.message || 'Failed to delete'); fetchData() }
    }, 6000)
    toast.action(`${row?.name || 'Warehouse'} removed`, {
      label: 'Undo', duration: 6000,
      onClick: () => { cancelled = true; setList(prev => [...prev, row]) },
    })
  }

  const filtered = list.filter(w =>
    (w.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (w.code || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const columns = [
    { key: 'name', label: 'Name', render: v => <div className="font-medium text-slate-700 text-[13px]">{v}</div> },
    { key: 'code', label: 'Code', render: v => <span className="font-mono text-[12px] bg-slate-100 px-2 py-1 rounded">{v}</span> },
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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Warehouses</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{list.length} {list.length === 1 ? 'warehouse' : 'warehouses'}</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus size={15} /> Add Warehouse
        </Button>
      </div>

      <div className="mb-4">
        <Input placeholder="Search by name or code..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No warehouses found" />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Warehouse' : 'Add Warehouse'} size="lg"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>{editingId ? 'Update' : 'Add'}</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="Code" required value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
          <Input label="City" value={form.city || ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
          <Input label="Address" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="col-span-2" />
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
