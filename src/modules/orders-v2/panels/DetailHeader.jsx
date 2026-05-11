/**
 * <DetailHeader> — sticky one-line summary at the top of OrderDetailV2.
 *
 * Stays visible across tab switches so the user keeps their orientation.
 * Includes the actions ribbon (Edit / Duplicate / Print / Back) — none of
 * the Phase-7 tab contents need to repeat them.
 *
 * Mounted INSIDE the ShellShell `centre` slot (not in a separate slot), so
 * sticky position uses the parent's overflow-y-auto scroll container.
 */

import { ArrowLeft, Pencil, Copy, Printer } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Currency, StatusBadge, Badge } from '../../../components/ui'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/**
 * @param {object} props
 * @param {object} props.order
 * @param {() => void} props.onPrint
 * @param {() => void} props.onDuplicate
 */
export default function DetailHeader({ order, onPrint, onDuplicate }) {
  const navigate = useNavigate()
  if (!order) return null

  const firm = order.customers?.firm_name || order.customers?.contact_name || '—'
  const grand = Number(order.grand_total) || 0
  const balance = Number(order.balance_due) || 0

  return (
    <header className="sticky top-0 z-10 -mx-6 px-6 py-3 border-b border-slate-200 bg-white/85 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/orders')}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 transition"
          aria-label="Back to orders"
        >
          <ArrowLeft size={14} /> Orders
        </button>

        <span className="font-mono text-[14px] font-bold text-indigo-700">{order.order_number || '—'}</span>

        <StatusBadge status={order.status} />

        {order.priority && order.priority !== 'Normal' && (
          <Badge variant={order.priority === 'High' ? 'danger' : 'warning'}>{order.priority}</Badge>
        )}

        <span className="hidden md:inline text-[13px] text-slate-600 truncate max-w-[20ch]">{firm}</span>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden sm:flex flex-col items-end text-[11px] leading-tight">
            <span className="text-slate-400">Total</span>
            <span className="font-semibold text-slate-900"><Currency amount={grand} /></span>
          </div>
          {balance > 0 && (
            <div className="hidden sm:flex flex-col items-end text-[11px] leading-tight">
              <span className="text-slate-400">Balance</span>
              <span className="font-semibold text-amber-700"><Currency amount={balance} /></span>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate(`/orders/${order.id}/edit`)}
              title="Edit order  (Cmd/Ctrl+E)"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              <Pencil size={13} />
              <span className="hidden md:inline">Edit</span>
            </button>
            <button
              type="button"
              onClick={onDuplicate}
              title="Duplicate"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              <Copy size={13} />
              <span className="hidden md:inline">Duplicate</span>
            </button>
            <button
              type="button"
              onClick={onPrint}
              title="Print"
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-700 hover:bg-slate-100 transition"
            >
              <Printer size={13} />
              <span className="hidden md:inline">Print</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
        <span>Delivery: {fmtDate(order.delivery_date_1)}</span>
        <span>·</span>
        <span>Created: {fmtDate(order.created_at)}</span>
        {order.nature && order.nature !== 'regular' && (
          <>
            <span>·</span>
            <span className="uppercase tracking-wider font-semibold">{order.nature}</span>
          </>
        )}
      </div>
    </header>
  )
}
