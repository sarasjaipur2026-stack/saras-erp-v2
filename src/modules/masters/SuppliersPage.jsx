import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { suppliers as supplierDb } from '../../lib/db'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Modal, DataTable } from '../../components/ui'
import { Plus, Edit2 } from 'lucide-react'

export default function SuppliersPage() {
  const { user } = useAuth()
  const [suppliers, setSuppliers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const emptyForm = { name: '', phone: '', firm: '', gstin: '', address: '', city: '', state: '' }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    setIsLoading(true)
    const { data } = await supplierDb.getAll()
    setSuppliers(data || [])
    setIsLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.name) { toast.error('Name required'); return }
    setSaving(true)
    const { error } = editing ? await supplierDb.update(editing.id, form) : await supplierDb.create({ ...form, user_id: user.id })
    if (error) toast.error(error.message)
    else { toast.success('Saved'); setShowForm(false); load() }
    setSaving(false)
  }

  const columns = [
    { key: 'name', label: 'Name', render: (_, r) => <div><div className="font-medium text-slate-700 text-[13px]">{r.firm || r.name}</div>{r.firm && <div className="text-[11px] text-slate-400 mt-0.5">{r.name}</div>}</div> },
    { key: 'phone', label: 'Phone', render: v => v ? <span className="tabular-nums">{v}</span> : <span className="text-slate-300">-</span> },
    { key: 'city', label: 'City', render: v => v || <span className="text-slate-300">-</span> },
    { key: 'gstin', label: 'GSTIN', render: v => v ? <span className="font-mono text-[11px] text-slate-500">{v}</span> : <span className="text-slate-300">-</span> },
    { key: 'actions', label: '', render: (_, r) => (
      <button onClick={() => { setEditing(r); setForm({ ...r }); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14} /></button>
    )},
  ]

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Suppliers</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{suppliers.length} suppliers</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true) }}>
          <Plus size={15} /> Add Supplier
        </Button>
      </div>

      <DataTable columns={columns} data={suppliers} isLoading={isLoading} emptyMessage="No suppliers" />

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Supplier' : 'New Supplier'} size="md"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>Save</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input label="Phone" value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          <Input label="Firm" value={form.firm || ''} onChange={e => setForm({ ...form, firm: e.target.value })} className="col-span-2" />
          <Input label="GSTIN" value={form.gstin || ''} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase().slice(0, 15) })} />
          <Input label="City" value={form.city || ''} onChange={e => setForm({ ...form, city: e.target.value })} />
          <Input label="Address" value={form.address || ''} onChange={e => setForm({ ...form, address: e.target.value })} className="col-span-2" />
        </div>
      </Modal>
    </div>
  )
}
