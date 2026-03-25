import { useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { materials as matDb } from '../../lib/db'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Select, Modal, DataTable, Badge } from '../../components/ui'
import { Box, Plus, Edit2 } from 'lucide-react'

const CATEGORIES = ['Cotton', 'PolyCotton', 'Polyester DTY', 'Spun Polyester', 'Viscose', 'Filler', 'Other']

export default function MaterialsPage() {
  const { materials, loadMasterData } = useApp()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ name: '', category: '', price_per_kg: '', hsn_code: '', gst_rate: 5 })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const toast = useToast()

  const filtered = filter ? materials.filter(m => m.category === filter) : materials

  const handleSave = async () => {
    if (!form.name || !form.category) { toast.error('Name and Category required'); return }
    setSaving(true)
    const payload = { ...form, price_per_kg: parseFloat(form.price_per_kg) || null }
    const fn = editing ? matDb.update(editing.id, payload) : matDb.create(payload)
    const { error } = await fn
    if (error) toast.error(error.message)
    else { toast.success('Saved'); setShowForm(false); loadMasterData() }
    setSaving(false)
  }

  const columns = [
    { key: 'name', label: 'Material Name', render: (v) => <span className="font-medium">{v}</span> },
    { key: 'category', label: 'Category', render: v => <Badge variant="info">{v}</Badge> },
    { key: 'price_per_kg', label: 'Price/Kg', render: v => v ? `₹${v}` : '-' },
    { key: 'gst_rate', label: 'GST %' },
    {
      key: 'actions', label: '',
      render: (_, r) => <button onClick={() => { setEditing(r); setForm({ ...r, price_per_kg: r.price_per_kg || '' }); setShowForm(true) }} className="p-1.5 rounded hover:bg-slate-100 text-slate-400"><Edit2 size={14} /></button>
    },
  ]

  return (
    <div className="fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Materials (Yarn Library)</h1>
          <p className="text-sm text-slate-500">{materials.length} materials</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm({ name: '', category: '', price_per_kg: '', hsn_code: '', gst_rate: 5 }); setShowForm(true) }}>
          <Plus size={16} /> Add Material
        </Button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter('')} className={`px-3 py-1.5 text-sm rounded-lg ${!filter ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>All</button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1.5 text-sm rounded-lg ${filter === c ? 'bg-indigo-100 text-indigo-700 font-medium' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{c}</button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} emptyTitle="No materials" />

      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Material' : 'New Material'} size="md"
        footer={<><Button variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button onClick={handleSave} loading={saving}>Save</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="col-span-2" />
          <Select label="Category *" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={CATEGORIES.map(c => ({ value: c, label: c }))} />
          <Input label="Price per Kg" type="number" value={form.price_per_kg} onChange={e => setForm({ ...form, price_per_kg: e.target.value })} placeholder="Optional" />
          <Input label="HSN Code" value={form.hsn_code} onChange={e => setForm({ ...form, hsn_code: e.target.value })} />
          <Input label="GST %" type="number" value={form.gst_rate} onChange={e => setForm({ ...form, gst_rate: parseFloat(e.target.value) || 0 })} />
        </div>
      </Modal>
    </div>
  )
}