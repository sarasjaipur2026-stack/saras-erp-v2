import { useState, useEffect, useCallback } from 'react'
import { suppliers as supplierDb } from '../../lib/db'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Modal, DataTable } from '../../components/ui'
import { Truck, Plus, Edit2, Trash2 } from 'lucide-react'

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', phone: '', firm: '', gstin: '', address: '', city: '', state: '' })
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supplierDb.getAll()
    setSuppliers(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!form.name) { toast.error('Name required'); return }
    setSaving(true)
    const fn = editing ? supplierDb.update(editing.id, form) : supplierDb.create(form)
    const { error } = await fn
    if (error) toast.error(error.message)
    else { toast.success('Saved'); setShowForm(false); load() }
    setSaving(false)
  }

  const columns = [
    { key: 'name', label: 'Name', render: (_, r) => <div><div className="font-medium">{r.firm || r.name}</div>{r.firm && <div className="text-xs text-slate-400">{r.name}</div>}</div> },
    { key: 'phone', label: 'Phone' },
    { key: 'city', label: 'City', render: v => v || '-' },
    { key: 'gstin', label: 'GSTIN', render: v => v ? <span className="font-mono text-xs">{v}</span> : '-' },
    {
      key: 'actions', label: '',
      render: (_, r) => <button onClick={() => { setEditing(r); setForm({ ...r }); setShowForm(true) }} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><Edit2 size={14} /></button>
    },
  ]

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-xl font-bold text-slate-900">Suppliers</h1><p className="text-sm text-slate-500">{suppliers.length} suppliers</p></div>
        <Button onClick={() => { setEditing(null); setForm({ name: '', phone: '', firm: '', gstin: '', address: '', city: '', state: '' }); setShowForm(true) }}><Plus size={16} /> Add Supplier</Button>
      </div>
      <DataTable columns={columns} data={suppliers} loading={loading} emptyTitle="No suppliers" />
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Supplier' : 'New Supplier'} size="md"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button onClick={handleSave} loading={saving}>Save</Button></>}>
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input label="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} />
          <Input label="Firm" value={form.firm} onChange={e => setForm({ ...form, firm: e.target.value })} className="col-span-2" />
          <Input label="GSTIN" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value.toUpperCase().slice(0, 15) })} />
          <Input label="City" value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} />
          <Input label="Address" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} className="col-span-2" />
        </div>
      </Modal>
    </div>
  )
}