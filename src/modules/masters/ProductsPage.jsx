import { useState } from 'react'
import { useApp } from '../../contexts/AppContext'
import { useAuth } from '../../contexts/AuthContext'
import { products as productDb } from '../../lib/db'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Select, Modal, DataTable, Badge } from '../../components/ui'
import { Plus, Edit2 } from 'lucide-react'

export default function ProductsPage() {
  const { products, loadMasterData } = useApp()
  const { user } = useAuth()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const emptyForm = { code: '', name: '', name_hi: '', uses_filler: false, hsn_code: '5607', gst_rate: 12, default_rate_unit: 'per_meter' }
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const handleSave = async () => {
    if (!form.code || !form.name) { toast.error('Code and Name required'); return }
    setSaving(true)
    const { error } = editing ? await productDb.update(editing.id, form) : await productDb.create({ ...form, user_id: user.id })
    if (error) toast.error(error.message)
    else { toast.success(editing ? 'Updated' : 'Created'); setShowForm(false); loadMasterData() }
    setSaving(false)
  }

  const columns = [
    { key: 'code', label: 'Code', render: v => <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md">{v}</span> },
    { key: 'name', label: 'Name', render: (_, r) => <div><div className="font-medium text-slate-700 text-[13px]">{r.name}</div>{r.name_hi && <div className="text-[11px] text-slate-400 mt-0.5">{r.name_hi}</div>}</div> },
    { key: 'uses_filler', label: 'Filler', render: v => v ? <Badge variant="info">Yes</Badge> : <Badge>No</Badge> },
    { key: 'hsn_code', label: 'HSN' },
    { key: 'gst_rate', label: 'GST %' },
    { key: 'default_rate_unit', label: 'Rate Unit', render: v => (v || '').replace('_', ' ') },
    { key: 'actions', label: '', render: (_, r) => (
      <button onClick={() => { setEditing(r); setForm({ ...r }); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14} /></button>
    )},
  ]

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Products</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{products.length} {products.length === 1 ? 'product' : 'products'}</p>
        </div>
        <Button onClick={() => { setEditing(null); setForm(emptyForm); setShowForm(true) }}>
          <Plus size={15} /> Add Product
        </Button>
      </div>

      <DataTable columns={columns} data={products} emptyMessage="No products" />

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Product' : 'New Product'} size="md"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving}>Save</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Code *" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="e.g. round_f" />
          <Input label="Name (EN) *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <Input label="Name (HI)" value={form.name_hi || ''} onChange={e => setForm({ ...form, name_hi: e.target.value })} />
          <Input label="HSN Code" value={form.hsn_code || ''} onChange={e => setForm({ ...form, hsn_code: e.target.value })} />
          <Input label="GST %" type="number" value={form.gst_rate} onChange={e => setForm({ ...form, gst_rate: parseFloat(e.target.value) || 0 })} />
          <Select label="Rate Unit" value={form.default_rate_unit} onChange={e => setForm({ ...form, default_rate_unit: e.target.value })} options={[{ value: 'per_meter', label: 'Per Meter' }, { value: 'per_kg', label: 'Per Kg' }]} />
          <label className="flex items-center gap-2 col-span-2">
            <input type="checkbox" checked={form.uses_filler} onChange={e => setForm({ ...form, uses_filler: e.target.checked })} className="rounded border-slate-300" />
            <span className="text-sm text-slate-700">Uses Filler Yarn</span>
          </label>
        </div>
      </Modal>
    </div>
  )
}
