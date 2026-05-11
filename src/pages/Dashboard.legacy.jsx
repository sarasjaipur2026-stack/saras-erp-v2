import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { stats } from '../lib/db'
import { StatCard } from '../components/ui'
import { useRealtimeTable } from '../hooks/useRealtimeTable'
import { useSWRList, invalidateSWR } from '../hooks/useSWRList'
import { perfMark } from '../lib/perfMark'
import {
  ShoppingCart, MessageSquare, Users, AlertTriangle,
  Clock, Plus, ArrowRight, TrendingUp
} from 'lucide-react'

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()

  // Always-show-stale SWR. Previous Dashboard used a 3-minute TTL that
  // returned null on expiry → forced full-page spinner on every post-idle
  // visit. This was the exact anti-pattern that re-introduced the lag
  // every time the codebase was refactored. Now: cache renders instantly
  // regardless of age, refetch happens silently in background.
  const { data, error: loadError, refetch: loadDashboard } = useSWRList(
    `dashboard.stats:${profile?.id || 'anon'}`,
    async () => {
      const d = await perfMark('dashboard.stats', () => stats.getDashboard())
      return d
    },
  )

  // Live-update KPIs when orders/payments/enquiries change.
  // Debounced silent refetch — never shows a spinner.
  useRealtimeTable('orders', () => {
    invalidateSWR(`dashboard.stats:${profile?.id || 'anon'}`)
    loadDashboard()
  }, { debounceMs: 1500 })
  useRealtimeTable('payments', () => {
    invalidateSWR(`dashboard.stats:${profile?.id || 'anon'}`)
    loadDashboard()
  }, { debounceMs: 1500 })
  useRealtimeTable('enquiries', () => {
    invalidateSWR(`dashboard.stats:${profile?.id || 'anon'}`)
    loadDashboard()
  }, { debounceMs: 1500 })

  // useSWRList already wires a visibilitychange refetch (after ≥30s hidden);
  // no need for a duplicate handler here.

  const firstName = profile?.full_name?.split(' ')[0] || 'User'

  // Block the page only on TRUE first visit (no cache, no data yet).
  // Stale cache renders instantly while the silent refetch runs in background.
  // This kills the "loading circle after 3 minutes" anti-pattern that the
  // old DASH_CACHE_TTL = 3min introduced.

  if (loadError && !data) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8">
          <h2 className="text-lg font-bold text-red-900 mb-2">Failed to load dashboard</h2>
          <p className="text-sm text-red-700 mb-4">{loadError?.message || String(loadError)}</p>
          <button onClick={loadDashboard} className="text-sm text-red-600 underline">Retry</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in max-w-6xl mx-auto">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
          Welcome back, {firstName}
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Here's what's happening at SARAS today
        </p>
      </div>

      {/* Stats — each drills into the relevant filtered list */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total Orders" value={data?.totalOrders || 0} icon={ShoppingCart} color="indigo"
          onClick={() => navigate('/orders')} />
        <StatCard label="New Enquiries" value={data?.newEnquiries || 0} icon={MessageSquare} color="amber"
          onClick={() => navigate('/enquiries?status=new')} />
        <StatCard label="Pending Orders" value={data?.pendingOrders || 0} icon={Clock} color="blue"
          onClick={() => navigate('/orders?filter=pending')} />
        <StatCard label="Total Customers" value={data?.totalCustomers || 0} icon={Users} color="green"
          onClick={() => navigate('/masters/customers')} />
      </div>

      {/* Urgent Orders Alert */}
      {data?.urgentOrders > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4 flex items-center gap-4 mb-8">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'New Order', icon: Plus, path: '/orders/new', gradient: 'from-indigo-500 to-indigo-600' },
            { label: 'New Enquiry', icon: Plus, path: '/enquiries/new', gradient: 'from-amber-500 to-orange-500' },
            { label: 'Calculator', icon: TrendingUp, path: '/calculator', gradient: 'from-emerald-500 to-teal-500' },
            { label: 'View Orders', icon: ArrowRight, path: '/orders', gradient: 'from-blue-500 to-cyan-500' },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-3 bg-white border border-slate-200/80 rounded-2xl p-4 hover:border-slate-300 hover:shadow-md hover:shadow-slate-100 transition-all duration-200 text-left group"
            >
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient} flex items-center justify-center text-white shadow-sm group-hover:shadow-md transition-shadow duration-200`}>
                <item.icon size={17} />
              </div>
              <span className="text-[13px] font-medium text-slate-600 group-hover:text-slate-900 transition-colors">{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
