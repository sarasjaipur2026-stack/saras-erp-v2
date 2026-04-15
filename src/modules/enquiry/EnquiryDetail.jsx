import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { enquiries } from '../../lib/db'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { Button, Spinner, Tabs } from '../../components/ui'
import { ArrowLeft, Edit3, CheckCircle, XCircle, RotateCcw, Undo2 } from 'lucide-react'
import ActivityTimeline from './components/ActivityTimeline'
import LostReasonModal from './components/LostReasonModal'
import {
  enquiryLineItems, enquiryActivities,
  stageByValue, outcomeByValue, priorityByValue, sourceByValue, lostReasonByValue,
  markEnquiryLost, undoMarkLost,
} from '../../lib/db/enquiryPipeline'

const fmtMoney = (n) => n == null ? '—' : `₹${Number(n).toLocaleString('en-IN')}`
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default function EnquiryDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()

  const [enquiry, setEnquiry] = useState(null)
  const [items, setItems] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [tabIdx, setTabIdx] = useState(0)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostLoading, setLostLoading] = useState(false)

  const loadAll = useCallback(async () => {
    setLoading(true)
    const [eq, li, ac] = await Promise.all([
      enquiries.get(id),
      enquiryLineItems.listByEnquiry(id),
      enquiryActivities.listByEnquiry(id),
    ])
    if (eq.error) {
      toast.error('Failed to load enquiry')
      navigate('/enquiries')
      return
    }
    setEnquiry(eq.data)
    setItems(li.data || [])
    setActivities(ac.data || [])
    setLoading(false)
  }, [id, navigate, toast])

  // Fetch data when the enquiry id changes. set-state in the async handler is
  // the intended pattern for syncing React state with an external data source.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadAll() }, [loadAll])

  const handleConvert = async () => {
    const { error } = await enquiries.convertToOrder(id)
    if (error) { toast.error('Failed to convert'); return }
    toast.success('Converted to order')
    navigate('/orders')
  }

  const handleMarkLost = async (payload) => {
    setLostLoading(true)
    const { error } = await markEnquiryLost(id, payload)
    setLostLoading(false)
    if (error) { toast.error(error.message || 'Failed to mark lost'); return }
    toast.success('Marked as lost')
    setLostOpen(false)
    loadAll()
  }

  const handleUndoLost = async () => {
    const { error } = await undoMarkLost(id)
    if (error) { toast.error('Failed to undo'); return }
    toast.success('Reopened')
    loadAll()
  }

  const logActivity = async ({ activity_type, body, direction }) => {
    const { error } = await enquiryActivities.create({
      enquiry_id: id, activity_type, body, direction, created_by: user.id,
    })
    if (error) { toast.error('Failed to log activity'); return }
    loadAll()
  }

  // Always allow undo on a lost enquiry — no arbitrary cutoff.
  const canUndoLost = enquiry?.outcome === 'lost'

  if (loading || !enquiry) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>

  const stage = stageByValue(enquiry.stage)
  const outcome = outcomeByValue(enquiry.outcome)
  const priority = priorityByValue(enquiry.priority)
  const source = sourceByValue(enquiry.source_channel)
  const lostMeta = lostReasonByValue(enquiry.lost_reason)

  const isOpen = enquiry.outcome === 'open'
  const expectedValue = Number(enquiry.expected_value || 0)
  const weighted = expectedValue * (Number(enquiry.probability) || 0) / 100

  return (
    <div className="fade-in max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/enquiries')}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"
            aria-label="Back"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              {enquiry.customers?.firm_name || 'Customer'}
              <span className="text-[12px] font-mono text-slate-400">· {enquiry.enquiry_number}</span>
            </h1>
            <p className="text-sm text-slate-500">
              {enquiry.contact_person_name && `${enquiry.contact_person_name} · `}
              {enquiry.contact_phone || enquiry.customers?.phone || ''}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => navigate(`/enquiries/${id}/edit`)}>
            <Edit3 size={14} /> Edit
          </Button>
          {isOpen && (
            <>
              <Button onClick={handleConvert}>
                <CheckCircle size={14} /> Convert to Order
              </Button>
              <Button variant="danger" onClick={() => setLostOpen(true)}>
                <XCircle size={14} /> Mark Lost
              </Button>
            </>
          )}
          {!isOpen && canUndoLost && (
            <Button variant="secondary" onClick={handleUndoLost}>
              <Undo2 size={14} /> Undo
            </Button>
          )}
        </div>
      </div>

      {/* Summary card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Field label="Stage" value={
            <span className={`inline-block px-2 py-0.5 rounded-md text-[12px] font-semibold bg-${stage.color}-100 text-${stage.color}-700`}>
              {stage.label}
            </span>
          }/>
          <Field label="Outcome" value={
            <span className={`inline-block px-2 py-0.5 rounded-md text-[12px] font-semibold bg-${outcome.color}-100 text-${outcome.color}-700`}>
              {outcome.label}
            </span>
          }/>
          <Field label="Probability" value={`${enquiry.probability || 0}%`}/>
          <Field label="Priority" value={priority.label}/>
          <Field label="Expected value" value={<span className="font-bold text-slate-900">{fmtMoney(expectedValue)}</span>}/>
          <Field label="Weighted value" value={fmtMoney(weighted)}/>
          <Field label="Expected close" value={fmtDate(enquiry.expected_close_date)}/>
          <Field label="Source" value={source?.label || '—'}/>
        </div>
        {enquiry.source_details && (
          <p className="text-[12px] text-slate-500 mt-3 pt-3 border-t border-slate-100">
            <span className="font-semibold">Source details:</span> {enquiry.source_details}
          </p>
        )}
        {enquiry.outcome === 'lost' && lostMeta && (
          <div className="mt-3 pt-3 border-t border-slate-100 p-3 bg-red-50 rounded-lg">
            <p className="text-[12px] font-semibold text-red-800">Lost: {lostMeta.label}</p>
            {enquiry.lost_reason_note && <p className="text-[12px] text-red-700 mt-1">{enquiry.lost_reason_note}</p>}
            {enquiry.competitor_info?.competitor && (
              <p className="text-[11px] text-red-600 mt-1">
                Competitor: {enquiry.competitor_info.competitor}
                {enquiry.competitor_info.rate && ` @ ₹${enquiry.competitor_info.rate}`}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[{ label: 'Timeline' }, { label: `Line Items (${items.length})` }]}
        defaultTab={tabIdx}
        onChange={setTabIdx}
      />

      <div className="mt-4">
        {tabIdx === 0 && <ActivityTimeline activities={activities} onLog={logActivity} />}
        {tabIdx === 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2">Product</th>
                  <th className="text-right px-4 py-2">Qty</th>
                  <th className="text-left px-4 py-2">Unit</th>
                  <th className="text-right px-4 py-2">Target ₹</th>
                  <th className="text-right px-4 py-2">Our Quote ₹</th>
                  <th className="text-right px-4 py-2">Line Total</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan="6" className="text-center py-8 text-slate-400">No line items</td></tr>
                ) : items.map(li => (
                  <tr key={li.id} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-medium text-slate-800">{li.products?.name || li.product_name_override || '—'}</td>
                    <td className="px-4 py-2 text-right">{Number(li.quantity).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-2">{li.unit || '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{li.target_rate ? `₹${li.target_rate}` : '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-600">{li.our_quoted_rate ? `₹${li.our_quoted_rate}` : '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold">{fmtMoney(li.line_value)}</td>
                  </tr>
                ))}
              </tbody>
              {items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan="5" className="px-4 py-2 text-right font-semibold text-slate-500">Expected value</td>
                    <td className="px-4 py-2 text-right font-bold text-slate-900">{fmtMoney(expectedValue)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      <LostReasonModal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        onConfirm={handleMarkLost}
        loading={lostLoading}
      />
    </div>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">{label}</p>
      <p className="text-[14px] text-slate-900 mt-0.5">{value}</p>
    </div>
  )
}
