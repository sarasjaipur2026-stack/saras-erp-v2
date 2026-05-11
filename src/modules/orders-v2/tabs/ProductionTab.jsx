/**
 * <ProductionTab> — linked production_plans for this order.
 *
 * Phase 7.1 ships the affordance only: link to the production module pre-filled
 * with this order. A dedicated SWR fetch + per-plan cards lands once the
 * production module exposes a `list({order_id})` helper.
 */

import { useNavigate } from 'react-router-dom'
import { Factory, Plus, ArrowUpRight } from 'lucide-react'
import { Button } from '../../../components/ui'

/**
 * @param {object} props
 * @param {object} props.order
 */
export default function ProductionTab({ order }) {
  const navigate = useNavigate()
  if (!order) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-slate-900">Production</h2>
        <Button
          size="sm"
          onClick={() => navigate(`/production/new?order_id=${order.id}`)}
        >
          <Plus size={14} /> New production job
        </Button>
      </div>

      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
          <Factory size={18} />
        </div>
        <h3 className="mt-3 text-[13px] font-semibold text-slate-700">Production jobs land here</h3>
        <p className="mt-1.5 text-[12px] text-slate-500 leading-snug max-w-md mx-auto">
          Plan and track machine assignment, operators, and progress. Per-plan
          cards with a SWR fetch land once production exposes a
          <code className="mx-1 rounded bg-slate-100 px-1 py-0.5 text-[11px]">productionPlans.list({'{ order_id }'})</code>
          helper.
        </p>
        <button
          type="button"
          onClick={() => navigate(`/production?order_id=${order.id}`)}
          className="mt-4 inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-700 hover:underline"
        >
          Open Production for this order <ArrowUpRight size={12} />
        </button>
      </div>
    </div>
  )
}
