/**
 * PinnedNav — renders the "Pinned" and "Recent" sections at the top of
 * the Sidebar. Both sections hide when empty (avoids visual noise for
 * users who haven't customised yet).
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.6
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 3
 */

import { NavLink, useLocation } from 'react-router-dom'
import { Pin, Clock, X } from 'lucide-react'
import { usePinnedNav } from '../../hooks/usePinnedNav'
import { useRecentPages } from '../../hooks/useRecentPages'

export default function PinnedNav({ onItemClick }) {
  const { pinned, unpin } = usePinnedNav()
  const { recent } = useRecentPages()
  const location = useLocation()

  // Recent excludes pinned (no double-display) and excludes current page.
  const pinnedPaths = new Set(pinned.map(p => p.path))
  const recentFiltered = recent.filter(r =>
    !pinnedPaths.has(r.path) && r.path !== location.pathname,
  )

  if (pinned.length === 0 && recentFiltered.length === 0) return null

  return (
    <div className="px-3 pt-3 pb-1 border-b border-slate-100/70">
      {pinned.length > 0 && (
        <Section icon={Pin} label="Pinned">
          {pinned.map(p => (
            <PinnedItem
              key={p.path}
              path={p.path}
              label={p.label}
              active={location.pathname === p.path}
              onUnpin={() => unpin(p.path)}
              onClick={onItemClick}
            />
          ))}
        </Section>
      )}
      {recentFiltered.length > 0 && (
        <Section icon={Clock} label="Recent">
          {recentFiltered.map(r => (
            <RecentItem
              key={r.path}
              path={r.path}
              label={r.label}
              onClick={onItemClick}
            />
          ))}
        </Section>
      )}
    </div>
  )
}

function Section({ icon: Icon, label, children }) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5 px-3 pb-1 text-[9px] uppercase tracking-[0.08em] font-semibold text-slate-400/80">
        <Icon size={10} strokeWidth={2} />
        {label}
      </div>
      {children}
    </div>
  )
}

function PinnedItem({ path, label, active, onUnpin, onClick }) {
  return (
    <div className="group relative mb-0.5">
      <NavLink
        to={path}
        onClick={onClick}
        className={`
          flex items-center gap-2 px-3 py-1.5 rounded-xl text-[12px] transition-colors
          ${active
            ? 'bg-indigo-50/80 text-indigo-700 font-semibold'
            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}
        `}
      >
        <span className="flex-1 truncate">{label}</span>
      </NavLink>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onUnpin() }}
        title="Unpin"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X size={11} />
      </button>
    </div>
  )
}

function RecentItem({ path, label, onClick }) {
  return (
    <NavLink
      to={path}
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-1 mb-0.5 rounded-xl text-[11px] text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors"
    >
      <span className="flex-1 truncate">{label}</span>
    </NavLink>
  )
}
