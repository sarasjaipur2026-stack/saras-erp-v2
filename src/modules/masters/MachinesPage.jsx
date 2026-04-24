import { useState, useEffect } from 'react'
import { machines as machinesDb } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal, Badge } from '../../components/ui'
import { Plus, Edit2, Trash2 } from 'lucide-react'

const MACHINE_TYPES = [
  { value: 'round', label: 'Round braiding' },
  { value: 'flat', label: 'Flat braiding' },
  { value: 'choti', label: 'Choti (small)' },
  { value: 'rope', label: 'Rope twisting' },
  { value: 'knitting', label: 'Knitting' },
  { value: 'winding', label: 'Winding' },
  { value: 'other', label: 'Other' },
]

const emptyForm = {
  code: '',
  name: '',
  name_hi: '',
  machine_type: 'round',
  spindles: 0,
  machine_count: 1,
  compatible_products: [],
  is_active: true,
}

export default function MachinesPage() {
  const { user } = useAuth()
  const { loadMasterData } = useApp()
  const toast = useToast()

  const [list, setList] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [compatInput, setCompatInput] = useState('')

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (user?.id) fetchData() }, [user?.id])

  const fetchData = async () => {
    setIsLoading(true)
    const { data, error } = await machinesDb.list(user.id)
    if (error) toast.error('Failed to load machines')
    else setList(data || [])
    setIsLoading(false)
  }

  const openModal = (m = null) => {
    if (m) {
      setEditingId(m.id)
      setForm({
        code: m.code || '',
        name: m.name || '',
        name_hi: m.name_hi || '',
        machine_type: m.machine_type || 'round',
        spindles: m.spindles || 0,
        machine_count: m.machine_count || 1,
        compatible_products: m.compatible_products || [],
        is_active: m.is_active !== false,
      })
    } else {
      setEditingId(null)
      setForm(emptyForm)
    }
    setCompatInput('')
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.code?.trim() || !form.name?.trim()) {
      toast.error('Code and name are required')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        name_hi: form.name_hi?.trim() || null,
        spindles: Number(form.spindles) || 0,
        machine_count: Number(form.machine_count) || 1,
        compatible_products: form.compatible_products || [],
      }
      const { error } = editingId
        ? await machinesDb.update(editingId, payload)
        : await machinesDb.create({ ...payload, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Machine updated' : 'Machine added')
      setShowModal(false)
      await fetchData()
      if (loadMasterData) loadMasterData().catch(() => {})
    } catch (e) {
      toast.error(e?.message || 'Failed to save')
    }
    setSaving(false)
  }

  const handleDelete = async (e, id, row) => {
    e.stopPropagation()
    setList(prev => prev.filter(m => m.id !== id))
    let cancelled = false
    setTimeout(async () => {
      if (cancelled) return
      const { error } = await machinesDb.delete(id)
      if (error) { toast.error(error.message || 'Failed to delete (may be in use)'); fetchData() }
      else if (loadMasterData) loadMasterData().catch(() => {})
    }, 6000)
    toast.action(`${row?.name || 'Machine'} removed`, {
      label: 'Undo', duration: 6000,
      onClick: () => { cancelled = true; setList(prev => [...prev, row]) },
    })
  }

  const addCompat = () => {
    const v = compatInput.trim()
    if (!v) return
    if ((form.compatible_products || []).includes(v)) return
    setForm(p => ({ ...p, compatible_products: [...(p.compatible_products || []), v] }))
    setCompatInput('')
  }

  const removeCompat = (v) => {
    setForm(p => ({ ...p, compatible_products: (p.compatible_products || []).filter(x => x !== v) }))
  }

  const filtered = list.filter(m =>
    (m.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (m.code || '').toLowerCase().includes(searchTerm.toLowerCase())
  )

  const columns = [
    {
      key: 'code',
      label: 'Code',
      render: v => <span className="font-mono text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-semibold">{v}</span>,
    },
    {
      key: 'name',
      label: 'Name',
      render: (_, r) => (
        <div>
          <div className="font-medium text-slate-700 text-[13px]">{r.name}</div>
          {r.name_hi && <div className="text-[11px] text-slate-400 mt-0.5">{r.name_hi}</div>}
        </div>
      ),
    },
    { key: 'machine_type', label: 'Type', render: v => <span className="text-[12px] capitalize text-slate-600">{v || '-'}</span> },
    { key: 'spindles', label: 'Spindles', render: v => <Badge variant="primary">{v || 0}</Badge> },
    {
      key: 'compatible_products',
      label: 'Products',
      render: v => (
        <div className="flex flex-wrap gap-1">
          {(v || []).slice(0, 4).map(p => <Badge key={p} variant="default">{p}</Badge>)}
          {(v || []).length > 4 && <span className="text-[11px] text-slate-400">+{v.length - 4}</span>}
        </div>
      ),
    },
    { key: 'machine_count', label: 'Count', render: v => v || 1 },
    {
      key: 'is_active',
      label: 'Active',
      render: v => <span className={`text-[12px] font-medium ${v === false ? 'text-slate-400' : 'text-green-600'}`}>{v === false ? 'No' : 'Yes'}</span>,
    },
    {
      key: 'actions',
      label: '',
      render: (_, r) => (
        <div className="flex gap-0.5">
          <button onClick={() => openModal(r)} className="p-1.5 rounded-lg hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"><Edit2 size={14} /></button>
          <button onClick={(e) => handleDelete(e, r.id, r)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
        </div>
      ),
    },
  ]

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Machines</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{list.length} machine types configured</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus size={15} /> Add Machine
        </Button>
      </div>

      <div className="mb-4">
        <Input placeholder="Search by code or name..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No machines found" />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Machine' : 'Add Machine'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSave} loading={saving}>{editingId ? 'Update' : 'Add'}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Code"
            required
            value={form.code}
            onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
            placeholder="e.g. BR-01"
          />
          <Input
            label="Name"
            required
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. 8-carrier braider"
          />
          <Input
            label="Name (Hindi)"
            value={form.name_hi}
            onChange={e => setForm(p => ({ ...p, name_hi: e.target.value }))}
            placeholder="वैकल्पिक"
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
            <select
              value={form.machine_type}
              onChange={e => setForm(p => ({ ...p, machine_type: e.target.value }))}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {MACHINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <Input
            label="Spindles"
            type="number"
            min="0"
            value={form.spindles}
            onChange={e => setForm(p => ({ ...p, spindles: e.target.value }))}
          />
          <Input
            label="Machine count"
            type="number"
            min="1"
            value={form.machine_count}
            onChange={e => setForm(p => ({ ...p, machine_count: e.target.value }))}
          />
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">Compatible products</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={compatInput}
                onChange={e => setCompatInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCompat() } }}
                className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Type a product key and press Enter"
              />
              <Button variant="secondary" size="sm" onClick={addCompat} type="button">Add</Button>
            </div>
            {(form.compatible_products || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.compatible_products.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => removeCompat(p)}
                    className="text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md hover:bg-red-50 hover:text-red-600"
                    title="Click to remove"
                  >
                    {p} ×
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-600">Active</span>
            </label>
          </div>
        </div>
      </Modal>
    </div>
  )
}
