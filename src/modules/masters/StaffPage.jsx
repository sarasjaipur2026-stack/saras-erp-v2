import { useState, useEffect } from 'react'
import { staff } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal } from '../../components/ui'
import { Plus, Edit2, Trash2 } from 'lucide-react'

export default function StaffPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const emptyForm = { name: '', phone: '', email: '', role: '', department: '', active: true }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { if (user?.id) fetchData() }, [user?.id])

  const fetchData = async () => {
    setIsLoading(true)
    const { data, error } = await staff.list(user.id)
    if (error) toast.error('Failed to load staff')
    else setList(data || [])
    setIsLoading(false)
  }

  const openModal = (member = null) => {
    if (member) { setEditingId(member.id); setForm({ ...member }) }
    else { setEditingId(null); setForm(emptyForm) }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name) { toast.error('Staff name required'); return }
    setSaving(true)
    try {
      const { error } = editingId
        ? await staff.update(editingId, form)
        : await staff.create({ ...form, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Staff member updated' : 'Staff member added')
      setShowModal(false); fetchData()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this staff member?')) return
    const { error } = await staff.delete(id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Staff member deleted'); fetchData() }
  }

  const filtered = list.filter(s =>
    (s.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.role || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (s.department || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const columns = [
    { key: 'name', label: 'Name', render: v => <div className="font-medium text-slate-700 text-[13px]">{v}</div> },
    { key: 'phone', label: 'Phone', render: v => v ? <span className="tabular-nums">{v}</span> : <span className="text-slate-300">-</span> },
    { key: 'role', label: 'Role', render: v => v ? <span className="text-slate-600 text-[12px]">{v}</span> : <span className="text-slate-300">-</span> },
    { key: 'department', label: 'Department', render: v => v ? <span className="text-slate-600 text-[12px] bg-slate-100 px-2 py-1 rounded">{v}</span> : <span className="text-slate-300">-</span> },
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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Staff</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{list.length} staff members</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus size={15} /> Add Staff Member
        </Button>
      </div>

      <div className="mb-4">
        <Input placeholder="Search by name, role, or department..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No staff members found" />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Staff Member' : 'Add Staff Member'} size="lg"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>{editingId ? 'Update' : 'Add'}</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="Phone" value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} />
          <Input label="Email" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <Input label="Role" value={form.role || ''} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} />
          <Input label="Department" value={form.department || ''} onChange={e => setForm(p => ({ ...p, department: e.target.value }))} />
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
