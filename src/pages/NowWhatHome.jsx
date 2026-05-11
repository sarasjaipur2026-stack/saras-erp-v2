/**
 * NowWhatHome — replaces the Dashboard at path '/'.
 *
 * "Action-prompted feed" — every card represents work that needs your
 * attention NOW. Cards self-hide when their count is zero (except Today's
 * Sales which is informational and always renders). When nothing else
 * needs attention, the user sees Today's Sales + quick actions — natural
 * inbox-zero state.
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.2
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 6
 */

import { Link } from 'react-router-dom'
import { Plus, Store, Search } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { cardsForRole } from './now-what/visibility'
import { CARD_REGISTRY } from './now-what/cards.jsx'

export default function NowWhatHome() {
  const { profile } = useAuth()
  const role = profile?.role || 'admin'
  const visibleCards = cardsForRole(role)

  return (
    <div className="fade-in max-w-6xl mx-auto py-4 lg:py-6 px-3 sm:px-4">
      {/* Greeting */}
      <div className="mb-4 lg:mb-6">
        <h1 className="text-xl lg:text-2xl font-bold text-slate-900 tracking-tight">
          {greetingForHour()}{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-[13px] text-slate-500 mt-1">Here's what needs your attention.</p>
      </div>

      {/* Action cards — each self-hides when empty. */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        {visibleCards.map((id) => {
          const Card = CARD_REGISTRY[id]
          if (!Card) return null
          return <Card key={id} />
        })}
      </div>

      {/* Quick action row */}
      <div className="mt-6 lg:mt-8">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-2">Quick actions</div>
        <div className="grid grid-cols-3 gap-3">
          <QuickAction to="/orders/new" icon={Plus} label="New Order" />
          <QuickAction to="/pos" icon={Store} label="POS" />
          <QuickActionButton
            onClick={() => window.dispatchEvent(new CustomEvent('saras:open-command-palette'))}
            icon={Search}
            label="Search"
          />
        </div>
      </div>
    </div>
  )
}

function QuickAction({ to, icon: Icon, label }) {
  return (
    <Link
      to={to}
      className="group rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-sm p-3 flex items-center gap-2.5 transition-all"
    >
      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-colors shrink-0">
        <Icon size={16} />
      </div>
      <div className="text-[13px] font-semibold text-slate-700 group-hover:text-indigo-700 truncate">{label}</div>
    </Link>
  )
}

function QuickActionButton({ onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className="group rounded-xl bg-white border border-slate-200 hover:border-indigo-300 hover:shadow-sm p-3 flex items-center gap-2.5 transition-all text-left"
    >
      <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white flex items-center justify-center transition-colors shrink-0">
        <Icon size={16} />
      </div>
      <div className="text-[13px] font-semibold text-slate-700 group-hover:text-indigo-700 truncate">{label}</div>
    </button>
  )
}

function greetingForHour() {
  const h = new Date().getHours()
  if (h < 5) return 'Up late?'
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}
