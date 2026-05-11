/**
 * <QuickActionStack> — status-gated action buttons on the right of the
 * OrderDetailV2 page.
 *
 * Visibility matrix lives in `_quickActions.js` (pure, unit-tested).
 *
 * Each action either:
 *   - calls `ordersDb.updateStatus(order.id, nextStatus)` and refetches, OR
 *   - navigates to a related route (dispatch / invoicing / payments).
 *
 * The optimistic UX: button shows a spinner while the mutation is pending;
 * realtime then merges the new status into the detail-page header via the
 * useOrderDetail hook's existing subscription.
 */

import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CheckCircle2, XCircle, Pencil, Factory, Pause, ClipboardCheck, Truck,
  CheckCheck, FileText, Banknote, RotateCcw, Loader2,
} from 'lucide-react'
import { useToast } from '../../../contexts/ToastContext'
import { orders as ordersDb } from '../../../lib/db/orders'
import { markSelfWrite } from '../../../hooks/useRealtimeTable'
import { quickActionsForStatus } from './_quickActions'

// Map icon-name strings from _quickActions.js → lucide components. Keeps the
// matrix module fully pure (no JSX/React imports).
const ICON_MAP = {
  CheckCircle2, XCircle, Pencil, Factory, Pause, ClipboardCheck, Truck,
  CheckCheck, FileText, Banknote, RotateCcw,
}

/**
 * @param {object} props
 * @param {object} props.order
 * @param {() => Promise<unknown>} props.refetch  — useOrderDetail's refetch
 */
export default function QuickActionStack({ order, refetch }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [pendingId, setPendingId] = useState(null)

  const actions = useMemo(() => quickActionsForStatus(order?.status), [order?.status])

  const handleClick = useCallback(async (action) => {
    if (!order || pendingId) return

    if (action.navigateTo) {
      navigate(action.navigateTo(order))
      return
    }

    if (action.nextStatus) {
      setPendingId(action.id)
      try {
        markSelfWrite('orders')
        const { error } = await ordersDb.updateStatus(order.id, action.nextStatus)
        if (error) throw error
        toast.success?.(`Order → ${action.nextStatus}`)
        await refetch?.()
      } catch (err) {
        toast.error?.(err?.message || 'Status update failed')
      } finally {
        setPendingId(null)
      }
    }
  }, [order, pendingId, navigate, refetch, toast])

  if (!order) return null
  if (actions.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-4 text-center text-[11px] text-slate-400">
        No quick actions for status <span className="font-mono">{order.status}</span>.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Quick actions</div>
      <div className="mt-2 flex flex-col gap-1.5">
        {actions.map((a) => {
          const Icon = ICON_MAP[a.icon] || CheckCircle2
          const busy = pendingId === a.id
          const variants = {
            primary:   'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-400',
            secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-50',
            danger:    'bg-white text-red-700 border border-red-200 hover:bg-red-50 disabled:opacity-50',
          }
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => handleClick(a)}
              disabled={Boolean(pendingId)}
              data-action-id={a.id}
              className={`inline-flex w-full items-center justify-start gap-2 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${variants[a.variant] || variants.secondary}`}
              title={a.label}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <Icon size={13} />}
              <span>{a.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
