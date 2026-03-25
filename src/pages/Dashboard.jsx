import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { stats } from '../lib/db'
import { StatCard, PageLoader } from '../components/ui'
import {
  ShoppingCart, MessageSquare, Users, AlertTriangle,
  Clock, Plus, ArrowRight
} from 'lucide-react'

export default function Dashboard() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    stats.getDashboard().then(d => {
      setData(d)
      setLoading(false)
    })
  }, [])

  if (loading) return <PageLoader />

  return (
    <div className="fade-in">
      {/* Welcome */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">
          Welcome, {profile?.full_name?.split(' ')[0] || 'User'}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Here's what's happening at SARAS today
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Orders" value={data?.totalOrders || 0} icon={ShoppingCart} color="indigo" />
        <StatCard label="New Enquiries" value={data?.newEnquiries || 0} icon={MessageSquare} color="amber" />
        <StatCard label="Pending Orders" value={data?.pendingOrders || 0} icon={Clock} color="blue" />
        <StatCard label="Total Customers" value={data?.totalCustomers || 0} icon={Users} color="green" />
      </div>

      {/* Quick Actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'New Order', icon: Plus, path: '/orders/new', color: 'bg-indigo-600' },
            { label: 'New Enquiry', icon: Plus, path: '/enquiries/new', color: 'bg-amber-600' },
            { label: 'Calculator', icon: ArrowRight, path: '/calculator', color: 'bg-green-600' },
            { label: 'View Orders', icon: ArrowRight, path: '/orders', color: 'bg-blue-600' },
          ].map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 hover:shadow-sm transition-all text-left"
            >
              <div className={`w-10 h-10 rounded-lg ${item.color} flex items-center justify-center text-white`}>
                <item.icon size={18} />
              </div>
              <span className="text-sm font-medium text-slate-700">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Urgent Orders */}
      {data?.urgentOrders > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={20} className="text-amber-600" />
          <div>
            <div className="text-sm font-medium text-amber-800">
              {data.urgentOrders} urgent order{data.urgentOrders > 1 ? 's' : ''} need attention
            </div>
            <button
              onClick={() => navigate('/orders?priority=urgent')}
              className="text-xs text-amber-600 hover:text-amber-700 font-medium mt-0.5"
            >
              View urgent orders &rarr;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}