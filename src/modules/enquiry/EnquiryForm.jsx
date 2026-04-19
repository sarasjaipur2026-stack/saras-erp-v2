import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { enquiries, products as productsDb, staff as staffDb } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, Textarea, Select, Spinner } from '../../components/ui'
import { ArrowLeft, Save } from 'lucide-react'
import { CustomerSearch } from '../orders/components/CustomerSearch'
import LineItemsEditor from './components/LineItemsEditor'
import { useUnsavedChangesPrompt } from '../../hooks/useUnsavedChangesPrompt'
import {
  SOURCE_CHANNELS, STAGES, PRIORITIES,
  stageByValue, enquiryLineItems,
} from '../../lib/db/enquiryPipeline'

export default function EnquiryForm() {
  const navigate = useNavigate()
  const { id } = useParams()
  const { user } = useAuth()
  const toast = useToast()

  const [form, setForm] = useState({
    customer_id: null,
    contact_person_name: '', contact_phone: '', contact_role: '',
    source_channel: '', source_details: '',
    stage: 'new', probability: 10,
    expected_close_date: '',
    priority: 'normal',
    assigned_to: user?.id || null,
    notes: '',
  })
  const [items, setItems] = useState([])
  const [productsList, setProductsList] = useState([])
  const [staffList, setStaffList] = useState([])
  const [isLoading, setIsLoading] = useState(!!id)
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesPrompt(dirty)
  const initialSnapRef = useRef(null)
  // Track dirty via JSON-stringified snapshot comparison. Skips the first
  // run after each load so programmatic hydration doesn't mark dirty.
  useEffect(() => {
    if (isLoading) return
    const snap = JSON.stringify({ form, items })
    if (initialSnapRef.current === null) { initialSnapRef.current = snap; return }
    if (snap !== initialSnapRef.current) setDirty(true)
  }, [form, items, isLoading])
  const [saving, setSaving] = useState(false)

  // Load products + staff for dropdowns
  useEffect(() => {
    productsDb.list?.(user.id).then(({ data }) => { if (data) setProductsList(data) })
    staffDb.list?.(user.id).then(({ data }) => { if (data) setStaffList(data) })
  }, [user.id])

  // Load existing enquiry (edit mode)
  useEffect(() => {
    if (!id) return
    let cancelled = false
    ;(async () => {
      const { data, error } = await enquiries.get(id)
      if (cancelled) return
      if (error) { toast.error('Failed to load enquiry'); navigate('/enquiries'); return }
      setForm({
        customer_id: data.customer_id,
        contact_person_name: data.contact_person_name || '',
        contact_phone: data.contact_phone || '',
        contact_role: data.contact_role || '',
        source_channel: data.source_channel || '',
        source_details: data.source_details || '',
        stage: data.stage || 'new',
        probability: data.probability ?? 10,
        expected_close_date: data.expected_close_date || '',
        priority: data.priority || 'normal',
        assigned_to: data.assigned_to || user.id,
        notes: data.notes || '',
      })
      const { data: liData } = await enquiryLineItems.listByEnquiry(id)
      setItems(liData || [])
      setIsLoading(false)
      // Snapshot loaded form state so we can detect user edits
      initialSnapRef.current = null
    })()
    return () => { cancelled = true }
  }, [id, navigate, toast, user.id])

  const update = useCallback((key, val) => setForm(p => ({ ...p, [key]: val })), [])

  const onStageChange = (val) => {
    const meta = stageByValue(val)
    setForm(p => ({ ...p, stage: val, probability: meta.defaultProb }))
  }

  const handleSave = async () => {
    if (!form.customer_id) { toast.error('Please select a customer'); return }
    if (items.length === 0) { toast.error('Add at least one product line'); return }
    setSaving(true)
    try {
      const payload = {
        customer_id: form.customer_id,
        contact_person_name: form.contact_person_name || null,
        contact_phone: form.contact_phone || null,
        contact_role: form.contact_role || null,
        source_channel: form.source_channel || null,
        source_details: form.source_details || null,
        stage: form.stage,
        probability: Number(form.probability) || 0,
        expected_close_date: form.expected_close_date || null,
        priority: form.priority,
        assigned_to: form.assigned_to || null,
        notes: form.notes || null,
      }
      let enquiryId = id
      if (id) {
        const { error } = await enquiries.update(id, payload)
        if (error) throw error
      } else {
        const { data, error } = await enquiries.create(payload)
        if (error) throw error
        enquiryId = data.id
      }

      // Sync line items: delete removed, update existing, insert new
      const normalize = (r) => ({
        enquiry_id: enquiryId,
        product_id: r.product_id || null,
        product_name_override: r.product_name_override || null,
        quantity: Number(r.quantity) || 0,
        unit: r.unit || 'kg',
        target_rate: r.target_rate ? Number(r.target_rate) : null,
        our_quoted_rate: r.our_quoted_rate ? Number(r.our_quoted_rate) : null,
        notes: r.notes || null,
        position: 0,
      })
      const existingIds = items.filter(r => r.id).map(r => r.id)
      if (id) {
        // Delete rows that were removed from the editor
        const { data: oldRows } = await enquiryLineItems.listByEnquiry(id)
        for (const oldRow of oldRows || []) {
          if (!existingIds.includes(oldRow.id)) {
            await enquiryLineItems.delete(oldRow.id)
          }
        }
      }
      for (let i = 0; i < items.length; i++) {
        const row = { ...normalize(items[i]), position: i }
        if (items[i].id) {
          await enquiryLineItems.update(items[i].id, row)
        } else {
          await enquiryLineItems.create(row)
        }
      }

      toast.success(`Enquiry ${id ? 'updated' : 'created'}`)
      setDirty(false)
      navigate(`/enquiries/${enquiryId}`)
    } catch (err) {
      toast.error(err?.message || 'Failed to save enquiry')
    }
    setSaving(false)
  }

  if (isLoading) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  return (
    <div className="fade-in max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/enquiries')}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{id ? 'Edit Enquiry' : 'New Enquiry'}</h1>
          <p className="text-sm text-slate-500">
            {id ? 'Update enquiry details' : 'Capture a new customer enquiry'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer + contact */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Customer</h2>
          <CustomerSearch value={form.customer_id} onChange={cid => update('customer_id', cid)} />

          <div className="space-y-3 mt-4 pt-4 border-t border-slate-100">
            <Input
              label="Contact person"
              placeholder="e.g. Ramesh Goyal"
              value={form.contact_person_name}
              onChange={(e) => update('contact_person_name', e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Phone"
                placeholder="98290-XXXXX"
                value={form.contact_phone}
                onChange={(e) => update('contact_phone', e.target.value)}
              />
              <Input
                label="Role"
                placeholder="GM / Purchase / Owner"
                value={form.contact_role}
                onChange={(e) => update('contact_role', e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Pipeline metadata */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-800 mb-4 uppercase tracking-wider">Pipeline</h2>

          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Source channel"
              value={form.source_channel}
              onChange={(e) => update('source_channel', e.target.value)}
              options={[{ value: '', label: 'Pick channel...' }, ...SOURCE_CHANNELS]}
            />
            <Input
              label="Source details"
              placeholder="Referrer / show name"
              value={form.source_details}
              onChange={(e) => update('source_details', e.target.value)}
            />
            <Select
              label="Stage"
              value={form.stage}
              onChange={(e) => onStageChange(e.target.value)}
              options={STAGES.map(s => ({ value: s.value, label: s.label }))}
            />
            <Input
              label={`Probability (${form.probability}%)`}
              type="range"
              min={0} max={100} step={5}
              value={form.probability}
              onChange={(e) => update('probability', Number(e.target.value))}
            />
            <Input
              label="Expected close date"
              type="date"
              value={form.expected_close_date}
              onChange={(e) => update('expected_close_date', e.target.value)}
            />
            <Select
              label="Priority"
              value={form.priority}
              onChange={(e) => update('priority', e.target.value)}
              options={PRIORITIES.map(p => ({ value: p.value, label: p.label }))}
            />
            <div className="col-span-2">
              <Select
                label="Assigned to"
                value={form.assigned_to || ''}
                onChange={(e) => update('assigned_to', e.target.value || null)}
                options={[
                  { value: user.id, label: 'Me' },
                  ...(staffList || []).filter(s => s.user_id && s.user_id !== user.id)
                    .map(s => ({ value: s.user_id, label: s.name })),
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="mt-4">
        <LineItemsEditor items={items} products={productsList} onChange={setItems} />
      </div>

      {/* Notes */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mt-4">
        <Textarea
          label="Notes"
          placeholder="Anything else relevant to this enquiry..."
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          rows={3}
        />
      </div>

      <div className="flex gap-3 justify-end pb-8 pt-4">
        <Button variant="secondary" onClick={() => navigate('/enquiries')}>Cancel</Button>
        <Button onClick={handleSave} loading={saving}>
          <Save size={16} /> {id ? 'Update' : 'Create'} Enquiry
        </Button>
      </div>
    </div>
  )
}
