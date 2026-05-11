/**
 * <RecentActivityCard> — list-side activity timeline for the cursor-row.
 *
 * Synthesises a small timeline from data already on the row (no fetch). Phase
 * 7's Activity tab will hit `activity_log` for full history.
 *
 * The synthesis is intentional: showing "Created", "Approved", "In Production"
 * etc. inferred from the current status + dates gives the user instant
 * orientation without a second round-trip.
 */

import { CheckCircle2, Circle, Clock } from 'lucide-react'

const STATUS_FLOW = [
  'draft', 'booking', 'approved', 'production', 'qc', 'dispatch', 'completed',
]

const STATUS_LABEL = {
  draft: 'Drafted',
  booking: 'Booked',
  approved: 'Approved',
  production: 'In production',
  qc: 'QC',
  dispatch: 'Dispatched',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'

/**
 * @param {object} props
 * @param {object} props.row
 */
export default function RecentActivityCard({ row }) {
  if (!row) return null

  // Build a synthetic timeline. We know: created (always), current status
  // (and everything before it in the flow is presumed reached). Cancelled
  // overrides — show only "Cancelled".
  const steps = []
  if (row.status === 'cancelled') {
    steps.push({ key: 'created', label: 'Created', state: 'done', date: row.created_at })
    steps.push({ key: 'cancelled', label: 'Cancelled', state: 'failed', date: null })
  } else {
    const reachedIdx = STATUS_FLOW.indexOf(row.status)
    for (let i = 0; i < STATUS_FLOW.length; i++) {
      const s = STATUS_FLOW[i]
      let state = 'pending'
      let date = null
      if (i < reachedIdx) state = 'done'
      else if (i === reachedIdx) {
        state = row.status === 'completed' ? 'done' : 'current'
        date = row.delivery_date_1 && s === 'dispatch' ? row.delivery_date_1 : null
      }
      if (i === 0 && row.created_at) date = row.created_at
      steps.push({ key: s, label: STATUS_LABEL[s], state, date })
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
        Activity
      </div>
      <ol className="mt-2 space-y-1.5">
        {steps.map((step) => (
          <li key={step.key} className="flex items-center gap-2 text-[12px]">
            <span className="shrink-0">
              {step.state === 'done' ? (
                <CheckCircle2 size={13} className="text-emerald-600" />
              ) : step.state === 'current' ? (
                <Clock size={13} className="text-amber-500" />
              ) : step.state === 'failed' ? (
                <Circle size={13} className="text-red-400 fill-red-400" />
              ) : (
                <Circle size={13} className="text-slate-300" />
              )}
            </span>
            <span className={
              step.state === 'pending' ? 'text-slate-400' :
              step.state === 'current' ? 'font-semibold text-amber-700' :
              step.state === 'failed' ? 'font-semibold text-red-600' :
              'text-slate-700'
            }>
              {step.label}
            </span>
            {step.date && (
              <span className="ml-auto text-[10px] text-slate-400">{fmtDate(step.date)}</span>
            )}
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[10px] text-slate-400">
        Synthesised from the order status. Full event log in the detail page.
      </p>
    </div>
  )
}
