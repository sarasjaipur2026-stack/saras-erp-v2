/**
 * <ActivityTab> — full activity_log feed for this order + comment box.
 *
 * Phase 7.1 ships the visual scaffold. The activity_log fetch + comment
 * post land in a follow-up commit when the DAL helper is in place. For now
 * we synthesise the same timeline as the list-side RecentActivityCard but
 * with extra context (notes, created-by).
 */

import { Clock, MessageSquare, Send } from 'lucide-react'

const STATUS_FLOW = ['draft', 'booking', 'approved', 'production', 'qc', 'dispatch', 'completed']

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

const fmtDate = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * @param {object} props
 * @param {object} props.order
 */
export default function ActivityTab({ order }) {
  if (!order) return null

  // Same synthetic timeline shape used in the list context card, but with
  // more breathing room.
  const events = []
  if (order.created_at) {
    events.push({ icon: '📝', label: 'Order created', date: order.created_at, detail: null })
  }
  if (order.status === 'cancelled') {
    events.push({ icon: '🛑', label: 'Cancelled', date: null, detail: null })
  } else {
    const reached = STATUS_FLOW.indexOf(order.status)
    for (let i = 1; i <= reached; i++) {
      events.push({
        icon: i === reached ? '⏳' : '✅',
        label: STATUS_LABEL[STATUS_FLOW[i]],
        date: i === reached && STATUS_FLOW[i] === 'dispatch' ? order.delivery_date_1 : null,
        detail: null,
      })
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-[14px] font-semibold text-slate-900">Activity</h2>

      {/* Comment box (visual scaffold; wires to activityLog.create in a follow-up) */}
      <section className="rounded-2xl border border-slate-200 bg-white p-3">
        <div className="flex items-start gap-2">
          <MessageSquare size={14} className="mt-2 text-slate-400" />
          <textarea
            placeholder="Add a comment — visible to anyone with access to this order…"
            rows={2}
            className="flex-1 resize-none rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
            disabled
            title="Comment posting wires up with the activityLog DAL"
          />
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1 rounded-lg bg-indigo-600/40 px-2.5 py-1.5 text-[12px] font-semibold text-white cursor-not-allowed"
            title="Coming in Phase 7.2 — activityLog.create"
          >
            <Send size={12} /> Post
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-slate-400">
          Comment posting wires to <code className="rounded bg-slate-100 px-1 py-0.5">activityLog.create</code> in Phase 7.2.
        </p>
      </section>

      {/* Timeline */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Timeline</div>
        {events.length === 0 ? (
          <div className="mt-3 text-[12px] text-slate-400">No activity yet.</div>
        ) : (
          <ol className="mt-3 space-y-3 border-l-2 border-slate-100 pl-4">
            {events.map((e, idx) => (
              <li key={idx} className="relative">
                <span className="absolute -left-[1.4rem] top-1 inline-flex h-4 w-4 items-center justify-center text-[11px]">
                  {e.icon}
                </span>
                <div className="text-[12px] font-semibold text-slate-700">{e.label}</div>
                <div className="text-[10px] text-slate-400 inline-flex items-center gap-1">
                  <Clock size={10} /> {fmtDate(e.date)}
                </div>
                {e.detail && <div className="mt-1 text-[11px] text-slate-500">{e.detail}</div>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}
