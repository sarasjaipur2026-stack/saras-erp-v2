/**
 * <StubTab> — shared placeholder for tabs whose content lands in Phase 7.
 *
 * Each stub is small and explicit so users know what's coming and don't
 * confuse "blank" with "broken".
 */

import { Construction } from 'lucide-react'

/**
 * @param {object} props
 * @param {string} props.label
 * @param {string} props.description
 */
export default function StubTab({ label, description }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <Construction size={18} />
      </div>
      <h2 className="mt-3 text-[14px] font-semibold text-slate-700">{label}</h2>
      <p className="mt-1.5 text-[12px] text-slate-500 leading-snug max-w-md mx-auto">
        {description}
      </p>
      <p className="mt-3 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
        Phase 7
      </p>
    </div>
  )
}
