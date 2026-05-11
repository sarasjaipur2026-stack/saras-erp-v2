/**
 * <DispatchTab> — list of deliveries scheduled for this order.
 *
 * Reads from `order.deliveries` (already fetched by useOrderDetail). "+ Schedule
 * dispatch" navigates to the dispatch module's new-route with order_id pre-filled.
 *
 * Inline schedule-form lands later; the affordance ships now via the
 * navigation button so the workflow path is clear.
 */

import { useNavigate } from 'react-router-dom'
import { Truck, Plus } from 'lucide-react'
import { Button, Badge } from '../../../components/ui'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const STATUS_VARIANT = {
  scheduled: 'default',
  in_transit: 'warning',
  delivered: 'success',
  cancelled: 'danger',
}

/**
 * @param {object} props
 * @param {object} props.order
 */
export default function DispatchTab({ order }) {
  const navigate = useNavigate()
  if (!order) return null

  const deliveries = Array.isArray(order.deliveries) ? order.deliveries : []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-slate-900">Dispatch</h2>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate(`/dispatch?order_id=${order.id}`)}
        >
          <Plus size={14} /> Schedule dispatch
        </Button>
      </div>

      {deliveries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Truck size={18} />
          </div>
          <h3 className="mt-3 text-[13px] font-semibold text-slate-700">No dispatches yet</h3>
          <p className="mt-1.5 text-[12px] text-slate-500 leading-snug max-w-md mx-auto">
            Once production is complete, schedule a dispatch from the Dispatch
            module. The link above pre-fills this order.
          </p>
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 text-left">Delivery #</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Vehicle</th>
                  <th className="px-4 py-2 text-left">Driver</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {deliveries.map((d, idx) => (
                  <tr
                    key={d.id || idx}
                    className="hover:bg-slate-50 cursor-pointer"
                    onClick={() => d.id && navigate(`/dispatch/${d.id}`)}
                  >
                    <td className="px-4 py-2 font-mono text-indigo-700">{d.delivery_number || d.id?.slice(0, 8) || '—'}</td>
                    <td className="px-4 py-2 text-slate-700">{fmtDate(d.delivery_date || d.scheduled_date)}</td>
                    <td className="px-4 py-2 text-slate-700">{d.vehicle_number || '—'}</td>
                    <td className="px-4 py-2 text-slate-700">{d.driver_name || '—'}</td>
                    <td className="px-4 py-2">
                      <Badge variant={STATUS_VARIANT[d.status] || 'default'}>{d.status || 'scheduled'}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
