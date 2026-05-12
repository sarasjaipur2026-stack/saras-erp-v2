/**
 * <ProductionTab> — linked production_plans for this order.
 *
 * Fetches via productionPlans.listByOrder(orderId), SWR-cached. Shows each
 * plan as a card with machine · material · planned vs completed qty +
 * progress bar.
 */

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Factory, Plus, ArrowUpRight, Loader2 } from 'lucide-react'
import { Button, Badge } from '../../../components/ui'
import { useSWRList } from '../../../hooks/useSWRList'
import { useRealtimeTable } from '../../../hooks/useRealtimeTable'
import { productionPlans } from '../../../lib/db/production'

const STATUS_VARIANT = {
  planned: 'default',
  in_progress: 'warning',
  completed: 'success',
  paused: 'warning',
  cancelled: 'danger',
}

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'
const fmtNum = (n, frac = 0) => Number.isFinite(Number(n))
  ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: frac, maximumFractionDigits: frac })
  : '—'

/**
 * @param {object} props
 * @param {object} props.order
 */
export default function ProductionTab({ order }) {
  const navigate = useNavigate()

  const key = order?.id ? `order-production:${order.id}` : 'order-production:none'

  const fetcher = useCallback(async () => {
    if (!order?.id) return []
    const { data, error } = await productionPlans.listByOrder(order.id)
    if (error) throw error
    return data || []
  }, [order])

  const { data: plans = [], loading, refetch } = useSWRList(key, fetcher, {
    enabled: Boolean(order?.id),
    staleAfterMs: 30_000,
  })

  // Realtime: refetch when production_plans for this order change.
  useRealtimeTable('production_plans',
    () => { refetch() },
    { filter: order?.id ? `order_id=eq.${order.id}` : undefined, enabled: Boolean(order?.id) },
  )

  if (!order) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-slate-900">Production</h2>
        <Button size="sm" onClick={() => navigate(`/production/new?order_id=${order.id}`)}>
          <Plus size={14} /> New production job
        </Button>
      </div>

      {loading && plans.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Loading production jobs…
        </div>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Factory size={18} />
          </div>
          <h3 className="mt-3 text-[13px] font-semibold text-slate-700">No production jobs yet</h3>
          <p className="mt-1.5 text-[12px] text-slate-500 leading-snug max-w-md mx-auto">
            Plan production via the link above. Each job will appear here with
            its machine, material, and progress bar.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/production?order_id=${order.id}`)}
            className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-700 hover:underline"
          >
            Open Production module <ArrowUpRight size={12} />
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {plans.map((p) => {
            const planned = Number(p.planned_qty) || 0
            const completed = Number(p.completed_qty) || 0
            const pct = planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : 0
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/production/${p.id}`)}
                className="text-left rounded-2xl border border-slate-200 bg-white p-3 hover:border-indigo-300 hover:shadow-sm transition"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                    {p.machines?.name || '—'}
                  </span>
                  <Badge variant={STATUS_VARIANT[p.status] || 'default'}>{p.status || 'planned'}</Badge>
                </div>
                <div className="text-[13px] font-semibold text-slate-900 truncate">
                  {p.materials?.name || 'Material —'}
                </div>
                <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-slate-500">
                  <span>{fmtNum(completed)} / {fmtNum(planned)}</span>
                  <span className="tabular-nums">{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full ${pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-indigo-500' : 'bg-amber-400'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-2 text-[10px] text-slate-400">
                  <span>Start {fmtDate(p.planned_start)}</span>
                  <span className="text-right">End {fmtDate(p.planned_end)}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
