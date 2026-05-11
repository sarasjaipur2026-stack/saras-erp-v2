/**
 * NowWhatCard — shared card shell for the "Now What" home.
 *
 * Each concrete card (OverduePaymentsCard, LowStockCard, etc.) renders a
 * <NowWhatCard> with its own data hook + tap action. Card colour conveys
 * urgency: red (action required), amber (heads-up), green (positive),
 * blue (informational).
 *
 * Empty state per card: if `count === 0` AND `hideWhenEmpty` is true, the
 * card returns null (the home compresses naturally). Set hideWhenEmpty
 * false to show a "Nothing here" empty card (useful for "Today's sales"
 * which is informational and should always render).
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.2
 */

import { Link } from 'react-router-dom'
import { Loader2, AlertCircle } from 'lucide-react'

const COLORS = {
  red: {
    bg: 'bg-red-50',
    border: 'border-red-100',
    accent: 'bg-red-500',
    text: 'text-red-700',
    headingText: 'text-red-900',
  },
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-100',
    accent: 'bg-amber-500',
    text: 'text-amber-700',
    headingText: 'text-amber-900',
  },
  green: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-100',
    accent: 'bg-emerald-500',
    text: 'text-emerald-700',
    headingText: 'text-emerald-900',
  },
  blue: {
    bg: 'bg-indigo-50',
    border: 'border-indigo-100',
    accent: 'bg-indigo-500',
    text: 'text-indigo-700',
    headingText: 'text-indigo-900',
  },
}

export default function NowWhatCard({
  icon: Icon,
  label,
  value,
  caption,
  color = 'blue',
  to,
  loading = false,
  error = null,
  onRetry = null,
  hideWhenEmpty = true,
}) {
  const c = COLORS[color] || COLORS.blue

  // Hide-when-empty: hook into the consumer's "is this card relevant" logic.
  if (!loading && !error && hideWhenEmpty && (value == null || value === 0 || value === '0' || value === '₹0')) {
    return null
  }

  const inner = (
    <div className={`rounded-2xl ${c.bg} border ${c.border} p-4 flex items-start gap-3 transition-shadow ${to ? 'hover:shadow-md cursor-pointer' : ''}`}>
      <div className={`w-10 h-10 rounded-xl ${c.accent} text-white flex items-center justify-center shrink-0 shadow-sm`}>
        {Icon ? <Icon size={18} /> : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`text-[11px] uppercase font-semibold tracking-wider ${c.text} opacity-80`}>{label}</div>
        <div className={`text-2xl font-bold ${c.headingText} mt-0.5 leading-tight`}>
          {loading ? <Loader2 size={20} className="animate-spin opacity-40" /> : value}
        </div>
        {caption && !loading && !error && (
          <div className={`text-[11px] ${c.text} opacity-80 mt-0.5 truncate`}>{caption}</div>
        )}
        {error && (
          <div className="flex items-center gap-2 text-[10px] text-red-600 mt-1">
            <AlertCircle size={11} /> Couldn't load
            {onRetry && (
              <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRetry() }} className="underline">retry</button>
            )}
          </div>
        )}
      </div>
    </div>
  )

  if (to) return <Link to={to} className="block focus:outline-none focus:ring-2 focus:ring-indigo-300 rounded-2xl">{inner}</Link>
  return inner
}
