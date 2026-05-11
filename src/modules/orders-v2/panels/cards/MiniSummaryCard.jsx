/**
 * <MiniSummaryCard> — context summary of the cursor-row in Orders V2.
 *
 * Reads everything from the row already in the table — no extra fetch. Phase
 * 7 detail tabs cover the deep view.
 */

import { ExternalLink } from 'lucide-react'
import { Currency, StatusBadge, Badge } from '../../../../components/ui'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/**
 * @param {object} props
 * @param {object} props.row              — current order row from useOrdersList
 * @param {() => void} props.onOpen       — navigate to /orders/:id (legacy detail for now)
 */
export default function MiniSummaryCard({ row, onOpen }) {
  if (!row) return null
  const grand = Number(row.grand_total) || 0
  const advance = Number(row.advance_paid) || 0
  const balance = Number(row.balance_due) || 0

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Order</div>
          <div className="mt-0.5 font-mono text-[13px] font-semibold text-indigo-700">{row.order_number || '—'}</div>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 transition"
          title="Open full order"
        >
          Open <ExternalLink size={11} />
        </button>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <StatusBadge status={row.status} />
        {row.priority && row.priority !== 'Normal' && (
          <Badge variant={row.priority === 'High' ? 'danger' : 'warning'}>{row.priority}</Badge>
        )}
        {row.nature && row.nature !== 'regular' && (
          <Badge variant="default">{row.nature}</Badge>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12px]">
        <dt className="text-slate-500">Total</dt>
        <dd className="text-right font-semibold text-slate-900"><Currency amount={grand} /></dd>

        <dt className="text-slate-500">Advance</dt>
        <dd className="text-right text-emerald-700"><Currency amount={advance} /></dd>

        <dt className="text-slate-500">Balance</dt>
        <dd className={`text-right font-semibold ${balance > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
          {balance > 0 ? <Currency amount={balance} /> : '—'}
        </dd>

        <dt className="text-slate-500">Delivery</dt>
        <dd className="text-right text-slate-700">{fmtDate(row.delivery_date_1)}</dd>

        <dt className="text-slate-500">Created</dt>
        <dd className="text-right text-slate-700">{fmtDate(row.created_at)}</dd>
      </dl>
    </div>
  )
}
