import { useState, useEffect } from 'react'
import { banks } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal } from '../../components/ui'
import { Plus, Edit2, Trash2 } from 'lucide-react'

export default function BanksPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const emptyForm = { name: '', account_number: '', ifsc_code: '', branch: '', account_type: 'current', is_active: true }
  const [form, setForm] = useState(emptyForm)

  useEffect(() => { if (user?.id) fetchData() }, [user?.id])

  const fetchData = async () => {
    setIsLoading(true)
    const { data, error } = await banks.list(user.id)
    if (error) toast.error('Failed to load banks')
    else setList(data || [])
    setIsLoading(false)
  }

  const openModal = (bank = null) => {
    if (bank) { setEditingId(bank.id); setForm({ ...bank }) }
    else { setEditingId(null); setForm(emptyForm) }
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.account_number) { toast.error('Name and account number required'); return }
    setSaving(true)
    try {
      const { error } = editingId
        ? await banks.update(editingId, form)
        : await banks.create({ ...form, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Bank updated' : 'Bank added')
      setShowModal(false); fetchData()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this bank account?')) return
    const { error } = await banks.delete(id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Bank deleted'); fetchData() }
  }

  const filtered = list.filter(b =>
    (b.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.account_number || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const columns = [
    { key: 'name', label: 'Name', render: v => <div className="font-medium text-slate-700 text-[13px]">{v}</div> },
    { key: 'account_number', label: 'Account No', render: v => <span className="font-mono text-[12px]">{v}</span> },
    { key: 'ifsc_code', label: 'IFSC', render: v => <span className="font-mono text-[12px] bg-slate-100 px-2 py-1 rounded">{v}</span> },
    { key: 'branch', label: 'Branch', render: v => v || <span className="text-slate-300">-</span> },
    { key: 'account_type', label: 'Type', render: v => <span className="text-[12px] text-slate-600 bg-slate-100 px-2 py-1 rounded capitalize">{v}</span> },
    { key: 'is_active', label: 'Active', render: v => <span className={`text-[12px] font-medium ${v ? 'text-green-600' : 'text-slate-400'}`}>{v ? 'Yes' : 'No'}</span> },
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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Banks</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{list.length} bank accounts</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus size={15} /> Add Bank
        </Button>
      </div>

      <div className="mb-4">
        <Input placeholder="Search by name or account number..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No banks found" />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Bank' : 'Add Bank'} size="lg"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>{editingId ? 'Update' : 'Add'}</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Bank Name" required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <Input label="Account Number" required value={form.account_number} onChange={e => setForm(p => ({ ...p, account_number: e.target.value }))} />
          <Input label="IFSC Code" value={form.ifsc_code || ''} onChange={e => setForm(p => ({ ...p, ifsc_code: e.target.value.toUpperCase() }))} />
          <Input label="Branch" value={form.branch || ''} onChange={e => setForm(p => ({ ...p, branch: e.target.value }))} />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Account Type</label>
            <select value={form.account_type} onChange={e => setForm(p => ({ ...p, account_type: e.target.value }))} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
              <option value="current">Current</option>
              <option value="savings">Savings</option>
            </select>
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
