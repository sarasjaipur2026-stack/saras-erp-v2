/**
 * <OptionalSection> — collapsible "+ Add" section for the smart-progressive
 * Order Wizard. Three states:
 *
 *   1. dormant   — shows the "+ Add <label>" button only
 *   2. expanded  — shows the section with its content + an inline remove (×)
 *
 * The remove handle calls `onClear` to wipe the section's state in the
 * parent. That keeps the dormant ↔ expanded toggle uni-directional: you
 * can't accidentally hide a section that has data.
 */

import { Plus, X } from 'lucide-react'

/**
 * @param {object} props
 * @param {boolean} props.active         — show the section (vs dormant)
 * @param {() => void} props.onActivate
 * @param {() => void} props.onClear     — drop the data + return to dormant
 * @param {string} props.label
 * @param {string} [props.helper]        — small grey caption when dormant
 * @param {React.ReactNode} props.children
 */
export default function OptionalSection({
  active, onActivate, onClear, label, helper, children,
}) {
  if (!active) {
    return (
      <button
        type="button"
        onClick={onActivate}
        className="w-full inline-flex items-center justify-between gap-2 rounded-2xl border border-dashed border-slate-200 bg-white/50 px-4 py-3 text-left hover:bg-indigo-50/40 hover:border-indigo-300 transition"
      >
        <div>
          <div className="text-[12px] font-semibold text-slate-700 inline-flex items-center gap-1.5">
            <Plus size={13} className="text-indigo-600" />
            Add {label}
          </div>
          {helper && (
            <div className="mt-0.5 text-[11px] text-slate-400">{helper}</div>
          )}
        </div>
      </button>
    )
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{label}</h2>
        <button
          type="button"
          onClick={onClear}
          title={`Remove ${label}`}
          className="inline-flex items-center gap-1 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
        >
          <X size={12} />
        </button>
      </div>
      {children}
    </section>
  )
}
