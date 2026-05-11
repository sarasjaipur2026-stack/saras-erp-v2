/**
 * <BulkActionsCard> — replaces the per-row context cards when ≥1 row is
 * checkbox-selected in the Orders V2 list.
 *
 * Phase 5 ships the affordance (visible button row + counter). Wiring to
 * actual server-side bulk operations lands in Phase 5 cleanup or Phase 8 —
 * for now the handlers just toast a "Coming soon" notice so the UX is
 * complete and obvious.
 */

import { Printer, Download, Pencil, X } from 'lucide-react'

/**
 * @param {object} props
 * @param {number} props.count
 * @param {() => void} props.onPrint
 * @param {() => void} props.onExport
 * @param {() => void} props.onChangeStatus
 * @param {() => void} props.onClear
 */
export default function BulkActionsCard({
  count, onPrint, onExport, onChangeStatus, onClear,
}) {
  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-3.5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-indigo-500">
          Bulk
        </div>
        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-white transition"
          title="Clear selection"
        >
          Clear <X size={11} />
        </button>
      </div>

      <div className="mt-1.5 text-[15px] font-bold text-indigo-900">
        {count.toLocaleString('en-IN')} order{count !== 1 ? 's' : ''} selected
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        <button
          type="button"
          onClick={onChangeStatus}
          className="inline-flex w-full items-center justify-start gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100 transition"
        >
          <Pencil size={13} className="text-indigo-600" />
          <span>Change status…</span>
        </button>
        <button
          type="button"
          onClick={onPrint}
          className="inline-flex w-full items-center justify-start gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100 transition"
        >
          <Printer size={13} className="text-indigo-600" />
          <span>Print all</span>
        </button>
        <button
          type="button"
          onClick={onExport}
          className="inline-flex w-full items-center justify-start gap-2 rounded-lg bg-white px-2.5 py-1.5 text-[12px] font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 active:bg-slate-100 transition"
        >
          <Download size={13} className="text-indigo-600" />
          <span>Export to CSV</span>
        </button>
      </div>

      <p className="mt-3 text-[10px] text-indigo-700/80 leading-snug">
        Bulk handlers ship the affordance now; the server-side mutations land
        with Phase 8 quick-actions.
      </p>
    </div>
  )
}
