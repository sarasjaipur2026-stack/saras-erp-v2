/**
 * <CustomerCard> — context customer summary for the cursor-row in Orders V2.
 *
 * Reads from `row.customers` join (firm_name, contact_name) directly. Deep
 * credit / overdue / recent-orders data lands in Phase 8 with a dedicated
 * fetch hook — until then this card prompts the user toward the full
 * customer page.
 */

import { ArrowUpRight, User } from 'lucide-react'

/**
 * @param {object} props
 * @param {object} props.row                 — current order row
 * @param {(id: string) => void} props.onOpenCustomer
 */
export default function CustomerCard({ row, onOpenCustomer }) {
  const c = row?.customers
  if (!c) return null
  const firm = c.firm_name || c.contact_name || 'Unknown'
  const contact = c.firm_name && c.contact_name && c.firm_name !== c.contact_name ? c.contact_name : null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Customer</div>
        {row.customer_id && (
          <button
            type="button"
            onClick={() => onOpenCustomer?.(row.customer_id)}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 transition"
            title="Open customer record"
          >
            View <ArrowUpRight size={11} />
          </button>
        )}
      </div>

      <div className="mt-2 flex items-start gap-2">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <User size={14} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-slate-900">{firm}</div>
          {contact && (
            <div className="truncate text-[11px] text-slate-500">{contact}</div>
          )}
        </div>
      </div>

      <p className="mt-3 text-[11px] text-slate-400 leading-snug">
        Credit limit · overdue tracking · recent orders land in Phase 8 with a
        dedicated customer fetch.
      </p>
    </div>
  )
}
