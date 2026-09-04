import { useCallback, useMemo, useState } from 'react'
import { customers } from '../../lib/db'
import { supabase } from '../../lib/supabase'
import { safe, fetchAll } from '../../lib/db/core'
import {
  buildProspectSearches, CLASSIFICATION_OPTIONS, filterCustomers, FREQUENCY_OPTIONS,
  getCustomerFormPayload, getCustomerStats, INDUSTRY_OPTIONS, PRIORITY_OPTIONS,
  RECENCY_OPTIONS, SOURCE_OPTIONS,
} from '../../lib/customerInsights'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Input, DataTable, Modal, Select } from '../../components/ui'
import {
  AlertCircle, BarChart3, Building2, Copy, Edit2, ExternalLink, Plus, Search,
  Sparkles, Trash2, UsersRound, X,
} from 'lucide-react'
import { useSWRList } from '../../hooks/useSWRList'

// Full details are loaded only on edit. Classification fields stay in the light list payload.
const LIST_COLUMNS = [
  'id', 'firm_name', 'contact_name', 'phone', 'city', 'state', 'gstin',
  'source_company', 'priority_tier', 'industry_sector', 'industry_sub',
  'frequency_tier', 'recency_tier',
].join(', ')

const EMPTY_FORM = {
  firm_name: '', contact_name: '', phone: '', email: '', city: '', state: '',
  address: '', gstin: '', pan: '', source_company: '', priority_tier: '',
  industry_sector: '', industry_sub: '', frequency_tier: '', recency_tier: '',
}
const EMPTY_FILTERS = { search: '', priority: '', industry: '', source: '', classification: 'all' }
const formOptions = (options, blankLabel) => options.map((item, index) => index === 0 ? { ...item, label: blankLabel } : item)
const PRIORITY_FORM_OPTIONS = formOptions(PRIORITY_OPTIONS, 'Not classified yet')
const INDUSTRY_FORM_OPTIONS = formOptions(INDUSTRY_OPTIONS, 'Choose business category')
const FREQUENCY_FORM_OPTIONS = formOptions(FREQUENCY_OPTIONS, 'No buying history')
const RECENCY_FORM_OPTIONS = formOptions(RECENCY_OPTIONS, 'No recent activity data')
const SOURCE_FILTER_OPTIONS = formOptions(SOURCE_OPTIONS, 'All companies')

const sourceLabel = value => ({ SC: 'Saras Creations', SU: 'Saras Udyog', BOTH: 'Both' }[value] || 'Company not set')
const compactBuyingLabel = value => value
  ? value.replace(/^\d+\.\s*/, '').replace(/^\w\.\s*/, '')
  : 'No history'

const priorityTone = value => {
  if (value?.startsWith('A')) return 'bg-violet-50 text-violet-700 border-violet-100'
  if (value?.startsWith('B')) return 'bg-indigo-50 text-indigo-700 border-indigo-100'
  if (value?.startsWith('C')) return 'bg-sky-50 text-sky-700 border-sky-100'
  if (value?.startsWith('D')) return 'bg-amber-50 text-amber-700 border-amber-100'
  if (value?.startsWith('E')) return 'bg-slate-100 text-slate-600 border-slate-200'
  return 'bg-red-50 text-red-600 border-red-100'
}

const recencyTone = value => {
  if (value?.startsWith('A.')) return 'text-emerald-700 bg-emerald-50'
  if (value?.startsWith('B.')) return 'text-teal-700 bg-teal-50'
  if (value?.startsWith('C.')) return 'text-amber-700 bg-amber-50'
  if (value?.startsWith('D.')) return 'text-orange-700 bg-orange-50'
  if (value?.startsWith('E.')) return 'text-red-700 bg-red-50'
  return 'text-slate-500 bg-slate-100'
}

function Pill({ children, className = '' }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>{children}</span>
}

function SummaryCard({ icon: Icon, label, value, helper, tone }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-100">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{value.toLocaleString('en-IN')}</p>
          <p className="mt-1 text-[11px] text-slate-400">{helper}</p>
        </div>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tone}`}><Icon size={19} /></span>
      </div>
    </div>
  )
}

export default function CustomersPage() {
  const { user } = useAuth()
  const userId = user?.id
  const toast = useToast()

  const fetcher = useCallback(async () => {
    if (!userId) return { data: [] }
    return safe(() => fetchAll(() => supabase.from('customers')
      .select(LIST_COLUMNS)
      .order('firm_name', { ascending: true })))
  }, [userId])

  const cacheKey = userId ? `saras_customers_list_v4_${userId}` : null
  const { data: list, loading: isLoading, refresh: fetchData } = useSWRList(
    cacheKey, fetcher, { staleAfterMs: 15 * 60 * 1000 },
  )

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loadingEdit, setLoadingEdit] = useState(false)
  const [filters, setFilters] = useState(EMPTY_FILTERS)
  const [prospectCustomer, setProspectCustomer] = useState(null)

  const stats = useMemo(() => getCustomerStats(list), [list])
  const filtered = useMemo(() => filterCustomers(list, filters), [list, filters])
  const prospectSearches = useMemo(
    () => prospectCustomer ? buildProspectSearches(prospectCustomer) : [],
    [prospectCustomer],
  )
  const hasFilters = Object.entries(filters).some(([key, value]) => key === 'classification' ? value !== 'all' : Boolean(value))
  const setFilter = (key, value) => setFilters(previous => ({ ...previous, [key]: value }))

  const openModal = async (customerRow = null) => {
    if (!customerRow) {
      setEditingId(null)
      setForm({ ...EMPTY_FORM })
      setShowModal(true)
      return
    }
    setEditingId(customerRow.id)
    setForm({ ...EMPTY_FORM, ...customerRow })
    setShowModal(true)
    setLoadingEdit(true)
    try {
      const { data, error } = await customers.get(customerRow.id)
      if (error) throw error
      setForm({ ...EMPTY_FORM, ...data })
    } catch {
      toast.error('Customer details load nahi ho paayi')
    } finally {
      setLoadingEdit(false)
    }
  }

  const handleSave = async () => {
    if (!form.firm_name?.trim()) { toast.error('Firm name required hai'); return }
    setSaving(true)
    try {
      const payload = getCustomerFormPayload(form)
      const { error } = editingId
        ? await customers.update(editingId, payload)
        : await customers.create({ ...payload, user_id: user.id })
      if (error) throw error
      toast.success(editingId ? 'Customer updated' : 'Customer added')
      setShowModal(false)
      await fetchData()
    } catch {
      toast.error('Customer save nahi hua. Dobara try karein.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (event, id) => {
    event.stopPropagation()
    if (!confirm('Delete this customer?')) return
    const { error } = await customers.delete(id)
    if (error) toast.error('Failed to delete')
    else { toast.success('Customer deleted'); fetchData() }
  }

  const copyQuery = async query => {
    try {
      await navigator.clipboard.writeText(query)
      toast.success('Search phrase copied')
    } catch {
      toast.error('Copy nahi hua. Phrase manually select karein.')
    }
  }

  const columns = [
    { key: 'firm_name', label: 'Customer', render: (value, row) => (
      <div className="min-w-48">
        <div className="text-[13px] font-semibold text-slate-800">{value}</div>
        <div className="mt-0.5 text-[11px] text-slate-400">
          {[row.contact_name, row.city, row.state].filter(Boolean).join(' · ') || 'Contact details pending'}
        </div>
      </div>
    )},
    { key: 'industry_sector', label: 'Business', render: (value, row) => (
      <div className="min-w-36">
        <div className={`text-xs font-medium ${value && value !== 'Unknown' ? 'text-slate-700' : 'text-red-500'}`}>
          {value && value !== 'Unknown' ? value : 'Needs classification'}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400">{row.industry_sub && row.industry_sub !== 'Unknown' ? row.industry_sub : sourceLabel(row.source_company)}</div>
      </div>
    )},
    { key: 'priority_tier', label: 'Priority', render: value => (
      <Pill className={priorityTone(value)}>{value ? value.split(' - ')[0] : 'Not set'}</Pill>
    )},
    { key: 'frequency_tier', label: 'Buying pattern', render: (value, row) => (
      <div className="min-w-36">
        <div className="text-xs text-slate-700">{compactBuyingLabel(value)}</div>
        <span className={`mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[10px] font-medium ${recencyTone(row.recency_tier)}`}>
          {compactBuyingLabel(row.recency_tier)}
        </span>
      </div>
    )},
    { key: 'phone', label: 'Contact', render: (value, row) => (
      <div className="min-w-28">
        <div className="tabular-nums text-xs text-slate-700">{value || 'No phone'}</div>
        <div className="mt-0.5 font-mono text-[10px] text-slate-400">{row.gstin || 'GSTIN pending'}</div>
      </div>
    )},
    { key: 'actions', label: '', headerClassName: 'w-32', render: (_, row) => (
      <div className="flex justify-end gap-0.5">
        <button type="button" onClick={() => setProspectCustomer(row)} aria-label={`Find businesses similar to ${row.firm_name}`} title="Find similar businesses" className="focus-ring rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"><Sparkles size={14} /></button>
        <button type="button" onClick={() => openModal(row)} aria-label={`Edit ${row.firm_name}`} className="focus-ring rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600"><Edit2 size={14} /></button>
        <button type="button" onClick={event => handleDelete(event, row.id)} aria-label={`Delete ${row.firm_name}`} className="focus-ring rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"><Trash2 size={14} /></button>
      </div>
    )},
  ]

  return (
    <div className="fade-in mx-auto max-w-7xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Customer Intelligence</h1>
          <p className="mt-0.5 text-[13px] text-slate-500">Customers ko segment karein aur unke jaise naye buyers dhoondhein.</p>
        </div>
        <Button onClick={() => openModal()}><Plus size={15} /> Add Customer</Button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard icon={UsersRound} label="Total customers" value={stats.total} helper="Complete customer master" tone="bg-indigo-50 text-indigo-600" />
        <SummaryCard icon={BarChart3} label="Classified" value={stats.classified} helper="Industry + priority ready" tone="bg-emerald-50 text-emerald-600" />
        <SummaryCard icon={Building2} label="High-value" value={stats.highValue} helper="A and B priority" tone="bg-violet-50 text-violet-600" />
        <SummaryCard icon={AlertCircle} label="Needs attention" value={stats.needsAttention} helper="Classification pending" tone="bg-amber-50 text-amber-600" />
      </div>

      <section className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-100" aria-label="Customer filters">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Input icon={Search} placeholder="Name, phone, city or GSTIN..." value={filters.search} onChange={event => setFilter('search', event.target.value)} className="xl:col-span-2" />
          <Select aria-label="Classification status" options={CLASSIFICATION_OPTIONS} value={filters.classification} onChange={event => setFilter('classification', event.target.value)} />
          <Select aria-label="Priority" options={PRIORITY_OPTIONS} value={filters.priority} onChange={event => setFilter('priority', event.target.value)} />
          <Select aria-label="Industry" options={INDUSTRY_OPTIONS} value={filters.industry} onChange={event => setFilter('industry', event.target.value)} />
          <Select aria-label="Source company" options={SOURCE_FILTER_OPTIONS} value={filters.source} onChange={event => setFilter('source', event.target.value)} />
        </div>
        <div className="mt-3 flex min-h-7 items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <p className="text-xs text-slate-500"><span className="font-semibold text-slate-700">{filtered.length.toLocaleString('en-IN')}</span> customers shown</p>
          {hasFilters && <Button variant="ghost" size="xs" onClick={() => setFilters({ ...EMPTY_FILTERS })}><X size={13} /> Clear filters</Button>}
        </div>
      </section>

      <DataTable columns={columns} data={filtered} isLoading={isLoading} pageSize={40} emptyMessage="No matching customers" emptyDescription="Search ya filters change karke dekhein." />

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingId ? 'Edit & classify customer' : 'Add customer'} size="2xl"
        footer={<><Button variant="secondary" size="sm" onClick={() => setShowModal(false)}>Cancel</Button><Button size="sm" onClick={handleSave} loading={saving || loadingEdit}>{editingId ? 'Save changes' : 'Add customer'}</Button></>}
      >
        <div className={loadingEdit ? 'pointer-events-none opacity-60' : ''}>
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Building2 size={15} /></span>
            <div><h3 className="text-sm font-semibold text-slate-800">Contact details</h3><p className="text-[11px] text-slate-400">Only firm name is compulsory.</p></div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Firm Name" required value={form.firm_name || ''} onChange={event => setForm(previous => ({ ...previous, firm_name: event.target.value }))} />
            <Input label="Contact Person" value={form.contact_name || ''} onChange={event => setForm(previous => ({ ...previous, contact_name: event.target.value }))} />
            <Input label="Phone" inputMode="numeric" value={form.phone || ''} onChange={event => setForm(previous => ({ ...previous, phone: event.target.value.replace(/\D/g, '').slice(0, 10) }))} />
            <Input label="Email" type="email" value={form.email || ''} onChange={event => setForm(previous => ({ ...previous, email: event.target.value }))} />
            <Input label="City" value={form.city || ''} onChange={event => setForm(previous => ({ ...previous, city: event.target.value }))} />
            <Input label="State" value={form.state || ''} onChange={event => setForm(previous => ({ ...previous, state: event.target.value }))} />
            <Input label="GSTIN" value={form.gstin || ''} onChange={event => setForm(previous => ({ ...previous, gstin: event.target.value.toUpperCase().slice(0, 15) }))} />
            <Input label="PAN" value={form.pan || ''} onChange={event => setForm(previous => ({ ...previous, pan: event.target.value.toUpperCase().slice(0, 10) }))} />
            <Input label="Address" value={form.address || ''} onChange={event => setForm(previous => ({ ...previous, address: event.target.value }))} className="sm:col-span-2" />
          </div>

          <div className="mb-3 mt-6 flex items-center gap-2 border-t border-slate-100 pt-5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600"><BarChart3 size={15} /></span>
            <div><h3 className="text-sm font-semibold text-slate-800">Business classification</h3><p className="text-[11px] text-slate-400">Better filters and better lookalike searches.</p></div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="Priority" options={PRIORITY_FORM_OPTIONS} value={form.priority_tier || ''} onChange={event => setForm(previous => ({ ...previous, priority_tier: event.target.value }))} />
            <Select label="Business Category" options={INDUSTRY_FORM_OPTIONS} value={form.industry_sector || ''} onChange={event => setForm(previous => ({ ...previous, industry_sector: event.target.value }))} />
            <Input label="Specific Trade" placeholder="e.g. Garment accessories" value={form.industry_sub || ''} onChange={event => setForm(previous => ({ ...previous, industry_sub: event.target.value }))} />
            <Select label="Source Company" options={SOURCE_OPTIONS} value={form.source_company || ''} onChange={event => setForm(previous => ({ ...previous, source_company: event.target.value }))} />
            <Select label="Buying Frequency" options={FREQUENCY_FORM_OPTIONS} value={form.frequency_tier || ''} onChange={event => setForm(previous => ({ ...previous, frequency_tier: event.target.value }))} />
            <Select label="Recent Activity" options={RECENCY_FORM_OPTIONS} value={form.recency_tier || ''} onChange={event => setForm(previous => ({ ...previous, recency_tier: event.target.value }))} />
          </div>
        </div>
      </Modal>

      <Modal isOpen={Boolean(prospectCustomer)} onClose={() => setProspectCustomer(null)} title="Find similar customers" size="lg">
        {prospectCustomer && (
          <div>
            <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3">
              <p className="text-xs font-medium text-indigo-500">Based on</p>
              <p className="mt-0.5 font-semibold text-slate-800">{prospectCustomer.firm_name}</p>
              <p className="mt-1 text-xs text-slate-500">
                {[prospectCustomer.industry_sub, prospectCustomer.industry_sector, prospectCustomer.city, prospectCustomer.state].filter(value => value && value !== 'Unknown').join(' · ') || 'General textile buyer'}
              </p>
            </div>
            <div className="space-y-3">
              {prospectSearches.map(search => (
                <div key={search.id} className="rounded-xl border border-slate-200 p-3 transition-colors hover:border-indigo-200">
                  <div className="flex items-start justify-between gap-3">
                    <div><h3 className="text-sm font-semibold text-slate-800">{search.title}</h3><p className="mt-0.5 text-xs text-slate-500">{search.description}</p></div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => copyQuery(search.query)} aria-label={`Copy ${search.title} search`} className="focus-ring rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Copy size={15} /></button>
                      <a href={search.url} target="_blank" rel="noreferrer" aria-label={`Open ${search.title}`} className="focus-ring rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-700"><ExternalLink size={15} /></a>
                    </div>
                  </div>
                  <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-[11px] text-slate-500">{search.query}</p>
                </div>
              ))}
            </div>
            {(!prospectCustomer.industry_sector || prospectCustomer.industry_sector === 'Unknown') && (
              <div className="mt-4 flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                <AlertCircle size={15} className="mt-0.5 shrink-0" /><p>Better results ke liye pehle Edit mein business category aur specific trade fill karein.</p>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
