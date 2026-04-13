import { useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useAuth } from '../../contexts/AuthContext'
import { materials as matDb } from '../../lib/db'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Select, Modal, DataTable, Badge } from '../../components/ui'
import { Plus, Edit2 } from 'lucide-react'

const CATEGORIES = ['Cotton', 'PolyCotton', 'Polyester DTY', 'Spun Polyester', 'Viscose', 'Filler', 'Other']

export default function MaterialsPage() {
  const { materials, loadMasterData } = useApp()
  const { user } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const emptyForm = { name: '', category: '', price_per_kg: '', hsn_code: '', gst_rate: 5 }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState('')
  const toast = useToast()

  const filtered = filter ? materials.filter(m => m.category === filter) : materials

  const handleSave = async () => {
    if (!form.name || !form.category) { toast.error('Name and Category required'); return }
    setSaving(true)
    const payload = { ...form, price_per_kg: parseFloat(form.price_per_kg) || null }
    const { error } = editing ? await matDb.update(editing.id, payload) : await matDb.create({ ...payload, user_id: user.id })
    if (error) toast.error(error.message)
    else { toast.success('Saved'); setShowForm(false); loadMasterData() }
    setSaving(false)
  }

  const columns = [
    { key: 'name', label: 'Material', render: v => <span className="font-medium text-slate-700 text-[13px]">{v}</span> },
    { key: 'category', label: 'Category', render: v => <Badge variant="info">{v}</Badge> },
    { key: 'price_per_kg', label: 'Price/Kg', render: v => v ? `₹${v}` : '-' },
    { key: 'gst_rate', label: 'GST %' },
    { key: 'actions', label: '', render: (_, r) => (
      <button onClick={() => { setEditing(r); setForm({ ...r, price_per_kg: r.price_per_kg || '' }); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14} /></button>
    )},
  ]

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Materials (Yarn Library)</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{materials.length} materials</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true) }}>
          <Plus size={15} /> Add Material
        </Button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setFilter('')} className={`px-3 py-1.5 text-[13px] rounded-lg transition-all ${!filter ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>All</button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1.5 text-[13px] rounded-lg transition-all ${filter === c ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700'}`}>{c}</button>
        ))}
      </div>

      <DataTable columns={columns} data={filtered} emptyMessage="No materials" />

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Material' : 'New Material'} size="md"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>Save</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="col-span-2" />
          <Select label="Category *" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} options={[{ value: '', label: 'Select...' }, ...CATEGORIES.map(c => ({ value: c, label: c }))]} />
          <Input label="Price per Kg" type="number" value={form.price_per_kg} onChange={e => setForm({ ...form, price_per_kg: e.target.value })} placeholder="Optional" />
          <Input label="HSN Code" value={form.hsn_code || ''} onChange={e => setForm({ ...form, hsn_code: e.target.value })} />
          <Input label="GST %" type="number" value={form.gst_rate} onChange={e => setForm({ ...form, gst_rate: parseFloat(e.target.value) || 0 })} />
        </div>
      </Modal>
    </div>
  )
}
