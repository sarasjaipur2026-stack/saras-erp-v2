import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { stats } from '../lib/db'
import {
  ShoppingCart, MessageSquare, Users, AlertTriangle,
  Clock, Plus, ArrowRight, TrendingUp, FileText, Receipt, CreditCard, Truck, Package,
} from 'lucide-react'
import { useSWRList } from '../hooks/useSWRList'
import { useRecentSearches } from '../hooks/useRecentSearches'
import { ENTITY_ROUTES, ENTITY_LABELS } from '../lib/db/search'

const RECENT_ICON = {
  customer: Users,
  order: ShoppingCart,
  enquiry: MessageSquare,
  invoice: Receipt,
  payment: CreditCard,
  delivery: Truck,
  purchase_order: Package,
  product: Package,
}

const fmtRelativeTime = (ts) => {
  const diff = Math.max(0, Date.now() - ts)
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  return `${d}d ago`
}

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [loadError, setLoadError] = useState(null)
  const { recents } = useRecentSearches()

  // Stale-while-revalidate: cached dashboard data renders instantly on
  // first paint, even after long idles. Revalidation happens silently.
  const fetcher = useCallback(async () => {
    try {
      setLoadError(null)
      const d = await stats.getDashboard()
      // getDashboard returns an object, not { data, error } — normalise it.
      return { data: [d], error: null }
    } catch (err) {
      setLoadError(err?.message || 'Failed to load dashboard')
      return { data: null, error: err }
    }
  }, [])
  const {
    data: dataArray,
    loading,
  } = useSWRList('saras_dash_v1', fetcher, { staleAfterMs: 5 * 60 * 1000 })
  const data = dataArray?.[0] || null

  const firstName = profile?.full_name?.split(' ')[0] || 'User'

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  if (loadError) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8">
          <h2 className="text-lg font-bold text-red-900 mb-2">Failed to load dashboard</h2>
          <p className="text-sm text-red-700 mb-4">{loadError}</p>
          <button onClick={() => { setLoadError(null); window.location.reload() }}
            className="text-sm text-red-600 underline">Retry</button>
        </div>
      </div>
    )
  }

  // Show skeleton placeholders while first load is pending so the user sees
  // the dashboard shell instantly instead of a full-screen spinner.
  const isInitialLoad = loading && !data
  const cardValue = (v) => (isInitialLoad ? null : (v || 0))

  const statCards = [
    { label: 'Total Orders', value: cardValue(data?.totalOrders), icon: ShoppingCart, border: 'border-l-indigo-500', iconBg: 'bg-indigo-50', iconColor: 'text-indigo-600' },
    { label: 'New Enquiries', value: cardValue(data?.newEnquiries), icon: MessageSquare, border: 'border-l-amber-500', iconBg: 'bg-amber-50', iconColor: 'text-amber-600' },
    { label: 'Pending Orders', value: cardValue(data?.pendingOrders), icon: Clock, border: 'border-l-orange-500', iconBg: 'bg-orange-50', iconColor: 'text-orange-600' },
    { label: 'Total Customers', value: cardValue(data?.totalCustomers), icon: Users, border: 'border-l-emerald-500', iconBg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
  ]

  return (
    <div className="fade-in max-w-6xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          {greeting}, {firstName}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Here's what's happening at SARAS today
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map(card => {
          const Icon = card.icon
          return (
            <div
              key={card.label}
              className={`bg-white rounded-2xl border border-slate-200/80 border-l-4 ${card.border} p-5 hover:shadow-md transition-shadow duration-200`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                  <Icon size={19} className={card.iconColor} />
                </div>
              </div>
              {card.value === null ? (
                <div className="h-9 w-16 bg-slate-200/70 rounded-md animate-pulse" />
              ) : (
                <p className="text-3xl font-bold text-slate-900 tracking-tight">{card.value}</p>
              )}
              <p className="text-xs uppercase tracking-wider text-slate-500 font-semibold mt-1">{card.label}</p>
            </div>
          )
        })}
      </div>

      {/* Urgent Orders Alert */}
      {data?.urgentOrders > 0 && (
        <div className="bg-white border border-slate-200/80 border-l-4 border-l-amber-400 rounded-2xl p-4 flex items-center gap-4 mb-8">
          <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
            <AlertTriangle size={19} className="text-amber-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-amber-800">
              {data.urgentOrders} urgent order{data.urgentOrders > 1 ? 's' : ''} need attention
            </div>
            <button
              onClick={() => navigate('/orders?priority=urgent')}
              className="text-xs text-amber-600 hover:text-amber-700 font-medium mt-0.5 inline-flex items-center gap-1 transition-colors"
            >
              View urgent orders <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { label: 'New Order', icon: Plus, path: '/orders/new', gradient: 'from-indigo-500 to-indigo-600' },
            { label: 'New Enquiry', icon: Plus, path: '/enquiries/new', gradient: 'from-amber-500 to-orange-500' },
            { label: 'Calculator', icon: TrendingUp, path: '/calculator', gradient: 'from-emerald-500 to-teal-500' },
            { label: 'View Orders', icon: ArrowRight, path: '/orders', gradient: 'from-blue-500 to-cyan-500' },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 cursor-pointer hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-md transition-all duration-200 text-left group"
            >
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-white shadow-sm group-hover:shadow-md transition-shadow duration-200`}>
                <item.icon size={18} />
              </div>
              <span className="text-[13px] font-medium text-slate-600 group-hover:text-slate-900 transition-colors">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Recent Activity — populated from localStorage via Cmd+K palette.
          Hidden entirely when empty so first-time users don't see an empty shell. */}
      {recents.length > 0 && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-slate-800">Recent</h2>
            <span className="text-[11px] text-slate-400">Last {Math.min(recents.length, 8)} opened</span>
          </div>
          <div className="bg-white border border-slate-200/80 rounded-2xl overflow-hidden">
            {recents.slice(0, 8).map((r, i) => {
              const Icon = RECENT_ICON[r.entity_type] || FileText
              const route = ENTITY_ROUTES[r.entity_type]?.(r.entity_id)
              return (
                <button
                  key={`${r.entity_type}-${r.entity_id}-${i}`}
                  onClick={() => route && navigate(route)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50/70 transition-colors text-left border-b border-slate-50 last:border-0"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                    <Icon size={14} className="text-slate-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[13px] font-medium text-slate-800 truncate">{r.primary_label}</span>
                      {r.secondary && <span className="text-[11px] font-mono text-slate-400 flex-shrink-0">· {r.secondary}</span>}
                    </div>
                  </div>
                  <span className="text-[11px] text-slate-400 flex-shrink-0">{fmtRelativeTime(r.openedAt)}</span>
                  <span className="text-[11px] text-slate-400 capitalize flex-shrink-0 hidden sm:inline">{ENTITY_LABELS[r.entity_type] || r.entity_type}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
