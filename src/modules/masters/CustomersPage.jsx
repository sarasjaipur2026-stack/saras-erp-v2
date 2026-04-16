import { useState } from 'react'
import { customers } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { safe } from '../../lib/db/core'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal } from '../../components/ui'
import { Plus, Edit2, Trash2, Search } from 'lucide-react'
import { useSWRList } from '../../hooks/useSWRList'

// Only the columns actually rendered in the table — cuts JSON payload from
// ~600 KB (select=*) to ~150 KB for 3,447 rows. Full row is loaded on edit
// via customers.get(id) so we don't lose any data.
const LIST_COLUMNS = 'id, firm_name, contact_name, phone, city, gstin'

export default function CustomersPage() {
  const { user } = useAuth()
  const toast = useToast()

  // Paginated fetcher with just the display fields. Uses the same
  // PAGE/HARD_CAP guard-rails as db/core.js::fetchAll so we never hit the
  // PostgREST 1000-row silent-truncation cap.
  const fetcher = async () => {
    if (!user?.id) return { data: [] }
    const PAGE = 1000
    const HARD_CAP = 20000
    const all = []
    for (let from = 0; from < HARD_CAP; from += PAGE) {
      const { data, error } = await safe(() =>
        supabase.from('customers').select(LIST_COLUMNS)
          .eq('user_id', user.id)
          .order('firm_name', { ascending: true })
          .range(from, from + PAGE - 1),
      )
      if (error) return { data: null, error }
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < PAGE) break
    }
    return { data: all, error: null }
  }

  const cacheKey = user?.id ? `saras_customers_list_v2_${user.id}` : null
  const {
    data: list,
    loading: isLoading,
    refresh: fetchData,
  } = useSWRList(cacheKey, fetcher, { staleAfterMs: 15 * 60 * 1000 })

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [saving, setSaving] = useState(false)
  const emptyForm = { firm_name: '', contact_name: '', phone: '', email: '', city: '', address: '', gstin: '', pan: '' }
  const [form, setForm] = useState(emptyForm)
  const [loadingEdit, setLoadingEdit] = useState(false)

  const openModal = async (customerRow = null) => {
    if (customerRow) {
      // Lazy-load the full customer record (phone, email, address, pan)
      // since the list view only carried the display columns.
      setEditingId(customerRow.id)
      setShowModal(true)
      setLoadingEdit(true)
      try {
        const { data } = await customers.get(customerRow.id)
        setForm(data || { ...emptyForm, ...customerRow })
      } finally {
        setLoadingEdit(false)
      }
    } else {
      setEditingId(null)
      setForm(emptyForm)
      setShowModal(true)
    }
  }

  const handleSave = async () => {
    if (!form.firm_name || !form.contact_name) { toast.error('Firm name and contact name required'); return }
    setSaving(true)
    try {
      const { error } = editingId
        ? await customers.update(editingId, form)
        : await customers.create({ ...form, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Customer updated' : 'Customer added')
      setShowModal(false)
      fetchData()
    } catch { toast.error('Failed to save') }
    setSaving(false)
  }

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    if (!confirm('Delete this customer?')) return
    const { error } = await customers.delete(id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Customer deleted'); fetchData() }
  }

  const filtered = list.filter(c =>
    (c.contact_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (c.firm_name || '').toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const columns = [
    { key: 'firm_name', label: 'Firm', render: (v, r) => (
      <div><div className="font-medium text-slate-700 text-[13px]">{v}</div><div className="text-[11px] text-slate-400 mt-0.5">{r.contact_name}</div></div>
    )},
    { key: 'phone', label: 'Phone', render: v => v ? <span className="tabular-nums">{v}</span> : <span className="text-slate-300">-</span> },
    { key: 'city', label: 'City', render: v => v || <span className="text-slate-300">-</span> },
    { key: 'gstin', label: 'GSTIN', render: v => v ? <span className="font-mono text-[11px] text-slate-500">{v}</span> : <span className="text-slate-300">-</span> },
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
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">Customers</h1>
          <p className="text-[13px] text-slate-400 mt-0.5">{list.length} customers</p>
        </div>
        <Button onClick={() => openModal()}>
          <Plus size={15} /> Add Customer
        </Button>
      </div>

      <div className="mb-4">
        <Input icon={Search} placeholder="Search by name or firm..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
      </div>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} emptyMessage="No customers found" />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit Customer' : 'Add Customer'} size="lg"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving || loadingEdit}>{editingId ? 'Update' : 'Add'}</Button></>}
      >
        <div className="grid grid-cols-2 gap-4">
          <Input label="Firm Name" required value={form.firm_name || ''} onChange={e => setForm(p => ({ ...p, firm_name: e.target.value }))} />
          <Input label="Contact Person" required value={form.contact_name || ''} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} />
          <Input label="Phone" value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))} />
          <Input label="Email" type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <Input label="City" value={form.city || ''} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
          <Input label="GSTIN" value={form.gstin || ''} onChange={e => setForm(p => ({ ...p, gstin: (e.target.value || '').toUpperCase().slice(0, 15) }))} />
          <Input label="PAN" value={form.pan || ''} onChange={e => setForm(p => ({ ...p, pan: (e.target.value || '').toUpperCase().slice(0, 10) }))} className="col-span-2" />
          <Input label="Address" value={form.address || ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} className="col-span-2" />
        </div>
      </Modal>
    </div>
  )
}
