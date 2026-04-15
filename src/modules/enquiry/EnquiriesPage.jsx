import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { enquiries } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, DataTable, Tabs, StatusBadge } from '../../components/ui'
import { Plus, CheckCircle, XCircle } from 'lucide-react'
import { STAGES, PRIORITIES, stageByValue, priorityByValue } from '../../lib/db/enquiryPipeline'
import LostReasonModal from './components/LostReasonModal'
import { markEnquiryLost } from '../../lib/db/enquiryPipeline'

const ENQUIRIES_CACHE_TTL = 10 * 60 * 1000
const CACHE_KEY = (uid) => uid ? `saras_enquiries_v2_${uid}` : null

const readCache = (uid) => {
  const k = CACHE_KEY(uid); if (!k) return null
  try {
    const raw = sessionStorage.getItem(k); if (!raw) return null
    const p = JSON.parse(raw)
    if (Date.now() - p.ts > ENQUIRIES_CACHE_TTL) return null
    return Array.isArray(p.data) ? p.data : null
  } catch { return null }
}
const writeCache = (uid, data) => {
  const k = CACHE_KEY(uid); if (!k) return
  try { sessionStorage.setItem(k, JSON.stringify({ ts: Date.now(), data })) } catch { /* quota */ }
}

const fmtMoney = (n) => n == null || n === 0 ? '—' : `₹${Number(n).toLocaleString('en-IN')}`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'

export default function EnquiriesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const cached = useMemo(() => readCache(user?.id), [user?.id])
  const [list, setList] = useState(cached || [])
  const [isLoading, setIsLoading] = useState(!cached)
  const [viewFilter, setViewFilter] = useState('open')  // open | mine | hot | won | lost | all
  const [lostTarget, setLostTarget] = useState(null)
  const [lostLoading, setLostLoading] = useState(false)

  const fetchData = useCallback(async (showSpinner = true) => {
    if (!user?.id) return
    if (showSpinner) setIsLoading(true)
    const { data, error } = await enquiries.list(user.id)
    if (error) toast.error('Failed to load enquiries')
    else {
      const rows = data || []
      setList(rows)
      writeCache(user.id, rows)
    }
    setIsLoading(false)
  }, [user, toast])

  useEffect(() => {
    if (cached?.length) fetchData(false); else fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleConvert = async (e, row) => {
    e.stopPropagation()
    const { error } = await enquiries.convertToOrder(row.id)
    if (error) toast.error('Failed to convert')
    else { toast.success('Converted to order'); fetchData() }
  }

  const handleMarkLostClick = (e, row) => {
    e.stopPropagation()
    setLostTarget(row)
  }

  const submitLost = async (payload) => {
    if (!lostTarget) return
    setLostLoading(true)
    const { error } = await markEnquiryLost(lostTarget.id, payload)
    setLostLoading(false)
    if (error) { toast.error(error.message || 'Failed to mark lost'); return }
    toast.success('Marked as lost')
    setLostTarget(null)
    fetchData()
  }

  const filtered = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return list.filter(r => {
      const outcome = r.outcome || (r.status === 'converted' ? 'won' : r.status === 'lost' ? 'lost' : 'open')
      if (viewFilter === 'open')  return outcome === 'open'
      if (viewFilter === 'mine')  return outcome === 'open' && r.assigned_to === user.id
      if (viewFilter === 'hot')   return outcome === 'open' && (r.priority === 'urgent' || r.priority === 'high' || (r.expected_close_date && r.expected_close_date <= today))
      if (viewFilter === 'won')   return outcome === 'won'
      if (viewFilter === 'lost')  return outcome === 'lost'
      return true
    })
  }, [list, viewFilter, user.id])

  const columns = [
    { key: 'enquiry_number', label: 'Enquiry #', render: v => <span className="font-mono text-[12px] font-semibold text-indigo-600">{v || '-'}</span> },
    { key: 'customer', label: 'Customer', render: (_, row) => (
      <div>
        <div className="font-medium text-slate-800 text-[13px]">{row.customers?.firm_name || '-'}</div>
        <div className="text-[11px] text-slate-400">
          {row.contact_person_name || row.customers?.contact_name || ''}
        </div>
      </div>
    )},
    { key: 'stage', label: 'Stage', render: (v, row) => {
      const outcome = row.outcome || (row.status === 'converted' ? 'won' : row.status === 'lost' ? 'lost' : 'open')
      if (outcome !== 'open') return <StatusBadge status={outcome} />
      const s = stageByValue(v || row.status)
      return <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold bg-${s.color}-100 text-${s.color}-700`}>{s.label}</span>
    }},
    { key: 'probability', label: 'Prob.', render: v => v != null ? `${v}%` : '—' },
    { key: 'expected_value', label: 'Value', render: v => fmtMoney(v) },
    { key: 'expected_close_date', label: 'Due', render: fmtDate },
    { key: 'priority', label: 'Priority', render: v => {
      const p = priorityByValue(v); if (p.value === 'normal') return null
      return <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold bg-${p.color}-100 text-${p.color}-700 uppercase`}>{p.label}</span>
    }},
    { key: 'actions', label: '', render: (_, row) => {
      const outcome = row.outcome || (row.status === 'converted' ? 'won' : row.status === 'lost' ? 'lost' : 'open')
      if (outcome !== 'open') return null
      return (
        <div className="flex gap-1">
          <button onClick={(e) => handleConvert(e, row)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Convert to Order">
            <CheckCircle size={15} />
          </button>
          <button onClick={(e) => handleMarkLostClick(e, row)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Mark Lost">
            <XCircle size={15} />
          </button>
        </div>
      )
    }},
  ]

  const openRowDetail = (row) => navigate(`/enquiries/${row.id}`)

  const totalValue = filtered.reduce((s, r) => s + Number(r.expected_value || 0), 0)

  return (
    <div className="fade-in max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Enquiries</h1>
          <p className="text-sm text-slate-500">
            {filtered.length} shown · pipeline value {fmtMoney(totalValue)}
          </p>
        </div>
        <Button onClick={() => navigate('/enquiries/new')}>
          <Plus size={16} /> New Enquiry
        </Button>
      </div>

      <Tabs
        tabs={[
          { label: 'Open' },
          { label: 'My Pipeline' },
          { label: 'Hot 🔥' },
          { label: 'Won' },
          { label: 'Lost' },
          { label: 'All' },
        ]}
        defaultTab={0}
        onChange={(idx) => setViewFilter(['open','mine','hot','won','lost','all'][idx])}
      />

      <div className="mt-4">
        <DataTable
          columns={columns}
          data={filtered}
          isLoading={isLoading}
          emptyMessage="No enquiries in this view"
          onRowClick={openRowDetail}
        />
      </div>

      <LostReasonModal
        open={!!lostTarget}
        onClose={() => setLostTarget(null)}
        onConfirm={submitLost}
        loading={lostLoading}
      />
    </div>
  )
}
