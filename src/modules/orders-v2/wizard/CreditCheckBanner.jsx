/**
 * <CreditCheckBanner> — credit-aware status banner shown in OrderWizardV2.
 *
 * Three states:
 *   neutral  — no customer picked yet (returns null)
 *   info     — customer picked, no credit limit set (informational)
 *   ok       — within credit, soft summary in slate
 *   warn     — approaching credit limit (≥80% utilisation incl. this order)
 *   blocked  — over the limit (still doesn't HARD-block save in Phase 10;
 *              the wizard's save handler shows a confirm; hard-block lands
 *              once we have a `creditCheck` permission)
 */

import { ShieldAlert, ShieldCheck, AlertTriangle, Info, Loader2 } from 'lucide-react'
import { Currency } from '../../../components/ui'

/**
 * @param {object} props
 * @param {object|null} props.customer
 * @param {number}      props.outstanding   — sum(balance_due) of customer's open orders
 * @param {number}      props.thisOrderTotal — current draft total
 * @param {boolean}     props.loading
 */
export default function CreditCheckBanner({ customer, outstanding, thisOrderTotal, loading }) {
  if (!customer) return null

  const limit = Number(customer.credit_limit) || 0

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-500 inline-flex items-center gap-2">
        <Loader2 size={13} className="animate-spin" /> Checking credit…
      </div>
    )
  }

  if (limit <= 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-[12px] text-slate-600 inline-flex items-center gap-2">
        <Info size={13} />
        No credit limit set for this customer. Outstanding: <strong className="tabular-nums"><Currency amount={outstanding} /></strong>.
      </div>
    )
  }

  const projected = outstanding + thisOrderTotal
  const usagePct = limit > 0 ? Math.round((projected / limit) * 100) : 0
  const remaining = limit - projected

  let tone = 'ok'
  if (projected > limit) tone = 'blocked'
  else if (usagePct >= 80) tone = 'warn'

  const palette = {
    ok:      { bg: 'bg-emerald-50/60', border: 'border-emerald-200', text: 'text-emerald-700', Icon: ShieldCheck },
    warn:    { bg: 'bg-amber-50/60',   border: 'border-amber-200',   text: 'text-amber-700',   Icon: AlertTriangle },
    blocked: { bg: 'bg-red-50/60',     border: 'border-red-200',     text: 'text-red-700',     Icon: ShieldAlert },
  }[tone]

  const Icon = palette.Icon

  return (
    <div className={`rounded-2xl border ${palette.border} ${palette.bg} px-4 py-3`}>
      <div className={`flex items-start gap-2 text-[12px] ${palette.text}`}>
        <Icon size={14} className="mt-0.5 shrink-0" />
        <div className="flex-1">
          <div className="font-semibold">
            {tone === 'blocked' && 'Over credit limit — please confirm before saving'}
            {tone === 'warn' && `Approaching credit limit (${usagePct}% used)`}
            {tone === 'ok' && `Within credit limit (${usagePct}% used)`}
          </div>
          <div className="mt-1 text-[11px] opacity-90 grid grid-cols-2 sm:grid-cols-4 gap-x-3 gap-y-0.5">
            <span>Limit <strong className="tabular-nums ml-1"><Currency amount={limit} /></strong></span>
            <span>Outstanding <strong className="tabular-nums ml-1"><Currency amount={outstanding} /></strong></span>
            <span>This order <strong className="tabular-nums ml-1"><Currency amount={thisOrderTotal} /></strong></span>
            <span>{remaining >= 0 ? 'Remaining' : 'Excess'} <strong className="tabular-nums ml-1"><Currency amount={Math.abs(remaining)} /></strong></span>
          </div>
        </div>
      </div>
    </div>
  )
}
