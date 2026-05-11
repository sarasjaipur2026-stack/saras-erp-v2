/**
 * <DetailTabsRail> — left-rail tab list for OrderDetailV2.
 *
 * Six tabs in canonical lifecycle order:
 *   1 Overview · 2 Production · 3 Dispatch · 4 Invoice · 5 Payments · 6 Activity
 *
 * Keyboard hotkeys 1-6 switch tabs when no input has focus. The check uses
 * `event.target.matches('input, textarea, [contenteditable]')` so typing in
 * a customer search field doesn't blow you out of the active tab.
 */

import { useEffect } from 'react'
import {
  LayoutDashboard, Factory, Truck, FileText, Banknote, History,
} from 'lucide-react'
import { ORDER_DETAIL_TABS } from '../hooks/useOrderDetail'

const TAB_META = {
  overview:   { label: 'Overview',   icon: LayoutDashboard },
  production: { label: 'Production', icon: Factory },
  dispatch:   { label: 'Dispatch',   icon: Truck },
  invoice:    { label: 'Invoice',    icon: FileText },
  payments:   { label: 'Payments',   icon: Banknote },
  activity:   { label: 'Activity',   icon: History },
}

/**
 * @param {object} props
 * @param {string} props.tab
 * @param {(t: string) => void} props.setTab
 * @param {Record<string, number>} [props.counts]   — optional badge counts
 */
export default function DetailTabsRail({ tab, setTab, counts = {} }) {
  // Keyboard hotkeys 1–6
  useEffect(() => {
    const handler = (e) => {
      // Skip while user is typing in an input/textarea/contenteditable.
      const tgt = e.target
      if (tgt && typeof tgt.matches === 'function') {
        if (tgt.matches('input, textarea, [contenteditable], [contenteditable="true"]')) return
      }
      const idx = Number(e.key)
      if (!Number.isInteger(idx) || idx < 1 || idx > ORDER_DETAIL_TABS.length) return
      // Avoid colliding with browser shortcuts that use modifier keys.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      setTab(ORDER_DETAIL_TABS[idx - 1])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setTab])

  return (
    <nav aria-label="Order detail tabs" className="flex h-full flex-col gap-0.5 p-2 text-[12px]">
      {ORDER_DETAIL_TABS.map((key, idx) => {
        const meta = TAB_META[key]
        const Icon = meta.icon
        const active = tab === key
        const count = counts[key]

        return (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`group inline-flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 font-medium transition ${
              active
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
            aria-current={active ? 'page' : undefined}
            title={`${meta.label}  (${idx + 1})`}
          >
            <span className="inline-flex items-center gap-2">
              <Icon size={13} className={active ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'} />
              <span>{meta.label}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              {count != null && count > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                  active ? 'bg-white text-indigo-700' : 'bg-slate-200 text-slate-600'
                }`}>{count}</span>
              )}
              <kbd className={`text-[9px] font-mono font-semibold ${active ? 'text-indigo-400' : 'text-slate-400'}`}>
                {idx + 1}
              </kbd>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
