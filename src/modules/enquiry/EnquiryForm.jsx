import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { enquiries } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Textarea, Select, Spinner } from '../../components/ui'
import { ArrowLeft, Save } from 'lucide-react'
import { CustomerSearch } from '../orders/components/CustomerSearch'

export default function EnquiryForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()

  const [form, setForm] = useState({
    customer_id: null, products_required: '', quantity: 0, quoted_rate: 0,
    source: '', status: 'new', followup_date: '', notes: '',
  })
  const [isLoading, setIsLoading] = useState(!!id)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (id) {
      enquiries.get(id).then(({ data, error }) => {
        if (error) { toast.error('Failed to load enquiry'); navigate('/enquiries') }
        else setForm(data)
        setIsLoading(false)
      })
    }
  }, [id])

  const handleSave = async () => {
    if (!form.customer_id) { toast.error('Please select a customer'); return }
    setSaving(true)
    try {
      const payload = {
        customer_id: form.customer_id, products_required: form.products_required,
        quantity: form.quantity, quoted_rate: form.quoted_rate, source: form.source,
        status: form.status, followup_date: form.followup_date || null, notes: form.notes,
        user_id: user.id,
      }
      const { error } = id ? await enquiries.update(id, payload) : await enquiries.create(payload)
      if (error) throw error
      toast.success(`Enquiry ${id ? 'updated' : 'created'}`)
      navigate('/enquiries')
    } catch {
      toast.error('Failed to save enquiry')
    }
    setSaving(false)
  }

  const update = (key, val) => setForm(p => ({ ...p, [key]: val }))

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="fade-in max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/enquiries')} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{id ? 'Edit Enquiry' : 'New Enquiry'}</h1>
          <p className="text-sm text-slate-500">Fill in the enquiry details</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Customer</h2>
          <CustomerSearch value={form.customer_id} onChange={cid => update('customer_id', cid)} />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Details</h2>
          <div className="space-y-4">
            <Textarea label="Products Required" placeholder="Describe the products..." value={form.products_required || ''} onChange={e => update('products_required', e.target.value)} rows={3} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Quantity" type="number" value={form.quantity || ''} onChange={e => update('quantity', parseFloat(e.target.value) || 0)} />
              <Input label="Quoted Rate" type="number" value={form.quoted_rate || ''} onChange={e => update('quoted_rate', parseFloat(e.target.value) || 0)} />
              <Input label="Source" placeholder="How did you get this?" value={form.source || ''} onChange={e => update('source', e.target.value)} />
              <Input label="Follow-up Date" type="date" value={form.followup_date || ''} onChange={e => update('followup_date', e.target.value)} />
            </div>
            <Select label="Status" value={form.status} onChange={e => update('status', e.target.value)} options={[
              { value: 'new', label: 'New' }, { value: 'follow_up', label: 'Follow Up' },
              { value: 'quoted', label: 'Quoted' }, { value: 'converted', label: 'Converted' },
              { value: 'lost', label: 'Lost' },
            ]} />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <Textarea label="Notes" placeholder="Additional notes..." value={form.notes || ''} onChange={e => update('notes', e.target.value)} rows={3} />
        </div>

        <div className="flex gap-3 justify-end pb-8">
          <Button variant="secondary" onClick={() => navigate('/enquiries')}>Cancel</Button>
          <Button onClick={handleSave} loading={saving}>
            <Save size={16} /> {id ? 'Update' : 'Create'} Enquiry
          </Button>
        </div>
      </div>
    </div>
  )
}
