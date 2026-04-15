import { useState } from 'react'
import { Phone, MessageSquare, Mail, MapPin, FileText, Package, Edit3, ArrowRight, CheckCircle, User, Settings } from 'lucide-react'
import { Button, Textarea, Select } from '../../../components/ui'
import { ACTIVITY_TYPES } from '../../../lib/db/enquiryPipeline'

const ICON_MAP = {
  call: Phone, whatsapp: MessageSquare, email: Mail, visit: MapPin,
  quote_sent: FileText, sample_sent: Package, note: Edit3,
  stage_change: ArrowRight, outcome_change: CheckCircle,
  assignment_change: User, system: Settings,
}

const fmtRelative = (iso) => {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ActivityTimeline({ activities = [], onLog }) {
  const [expanded, setExpanded] = useState(false)
  const [type, setType] = useState('note')
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!body.trim() && type === 'note') return
    setSaving(true)
    try {
      await onLog?.({ activity_type: type, body: body.trim() || null, direction: ['call','whatsapp','email','visit'].includes(type) ? 'outbound' : null })
      setBody(''); setType('note'); setExpanded(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">Timeline</h3>
        {!expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="text-[12px] font-semibold text-indigo-600 hover:text-indigo-700"
          >
            + Log activity
          </button>
        )}
      </div>

      {expanded && (
        <div className="mb-5 p-3 bg-indigo-50/50 rounded-xl space-y-2 border border-indigo-100">
          <Select
            value={type}
            onChange={(e) => setType(e.target.value)}
            options={Object.entries(ACTIVITY_TYPES)
              .filter(([k]) => !['system','stage_change','outcome_change','assignment_change'].includes(k))
              .map(([k, v]) => ({ value: k, label: v.label }))}
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What happened? (e.g. 'Customer wants to see samples before Friday')"
            rows={2}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setExpanded(false); setBody('') }} disabled={saving}>Cancel</Button>
            <Button onClick={submit} loading={saving}>Log</Button>
          </div>
        </div>
      )}

      {activities.length === 0 ? (
        <p className="text-[13px] text-slate-400 text-center py-6">
          No activity yet. Log calls, WhatsApps, visits and they'll appear here.
        </p>
      ) : (
        <ol className="space-y-4">
          {activities.map((a) => {
            const Icon = ICON_MAP[a.activity_type] || Settings
            const meta = ACTIVITY_TYPES[a.activity_type]
            return (
              <li key={a.id} className="flex items-start gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  a.activity_type === 'system' || a.activity_type === 'stage_change' || a.activity_type === 'outcome_change' || a.activity_type === 'assignment_change'
                    ? 'bg-slate-100 text-slate-500'
                    : 'bg-indigo-100 text-indigo-600'
                }`}>
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold text-slate-800">{meta?.label || a.activity_type}</span>
                    {a.direction && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.direction === 'inbound' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                        {a.direction}
                      </span>
                    )}
                    <span className="text-[11px] text-slate-400 ml-auto flex-shrink-0">{fmtRelative(a.happened_at)}</span>
                  </div>
                  {a.body && <p className="text-[13px] text-slate-600 mt-0.5 whitespace-pre-wrap break-words">{a.body}</p>}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
