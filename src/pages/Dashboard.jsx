import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { stats } from '../lib/db'
import { StatCard, Spinner } from '../components/ui'
import {
  ShoppingCart, MessageSquare, Users, AlertTriangle,
  Clock, Plus, ArrowRight, TrendingUp
} from 'lucide-react'

// ─── Stale-while-revalidate for dashboard stats ──────────
const DASH_CACHE_KEY = 'saras_dash_v1'
const DASH_CACHE_TTL = 3 * 60 * 1000 // 3 min

function readDashCache() {
  try {
    const raw = sessionStorage.getItem(DASH_CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > DASH_CACHE_TTL) return null
    return data
  } catch { return null }
}

function writeDashCache(data) {
  try { sessionStorage.setItem(DASH_CACHE_KEY, JSON.stringify({ ts: Date.now(), data })) } catch {}
}

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const cached = readDashCache()
  const [data, setData] = useState(cached)
  const [loading, setLoading] = useState(!cached)
  const [loadError, setLoadError] = useState(null)

  const loadDashboard = useCallback(async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true)
      setLoadError(null)
      const d = await stats.getDashboard()
      setData(d)
      writeDashCache(d)
    } catch (err) {
      setLoadError(err?.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (cached) {
      // Show cached data instantly, revalidate in background
      loadDashboard(false)
    } else {
      loadDashboard()
    }
  }, [loadDashboard]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch silently when tab regains focus after 5+ min idle
  useEffect(() => {
    let lastHidden = 0
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        lastHidden = Date.now()
      } else if (document.visibilityState === 'visible' && lastHidden > 0) {
        if (Date.now() - lastHidden > 5 * 60 * 1000) {
          loadDashboard(false)
        }
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [loadDashboard])

  const firstName = profile?.full_name?.split(' ')[0] || 'User'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spinner size="lg" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center">
        <div className="bg-red-50 border border-red-200 rounded-2xl p-8">
          <h2 className="text-lg font-bold text-red-900 mb-2">Failed to load dashboard</h2>
          <p className="text-sm text-red-700 mb-4">{loadError}</p>
          <button onClick={() => { setLoadError(null); setLoading(true); stats.getDashboard().then(d => { setData(d); setLoading(false) }).catch(err => { setLoadError(err?.message || 'Failed'); setLoading(false) }) }}
            className="text-sm text-red-600 underline">Retry</button>
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <StatCard label="Total Orders" value={data?.totalOrders || 0} icon={ShoppingCart} color="indigo" />
        <StatCard label="New Enquiries" value={data?.newEnquiries || 0} icon={MessageSquare} color="amber" />
        <StatCard label="Pending Orders" value={data?.pendingOrders || 0} icon={Clock} color="blue" />
        <StatCard label="Total Customers" value={data?.totalCustomers || 0} icon={Users} color="green" />
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
