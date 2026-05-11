/**
 * <EmptyStateCard> — placeholder shown when nothing is selected in the
 * Orders V2 list. Replaced by the MiniSummary / Customer / Activity cards as
 * soon as the user clicks a row, or by BulkActions when they check rows.
 */

import { ListTree } from 'lucide-react'

export default function EmptyStateCard() {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-5 text-center">
      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <ListTree size={16} />
      </div>
      <h3 className="mt-2 text-[12px] font-semibold text-slate-700">No order selected</h3>
      <p className="mt-1 text-[11px] text-slate-500 leading-snug">
        Click any row to preview its summary, customer, and timeline — without
        leaving the list. Tap <strong>Open</strong> to dive into the full order.
      </p>
    </div>
  )
}
