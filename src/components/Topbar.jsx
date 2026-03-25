import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { notifications as notifDb } from '../lib/db'
import { Menu, Bell, LogOut, Search, User } from 'lucide-react'

export default function Topbar({ onMenuClick }) {
  const { user, profile, signOut, isAdmin } = useAuth()
  const toast = useToast()
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [showProfile, setShowProfile] = useState(false)

  useEffect(() => {
    if (user?.id) {
      notifDb.getUnread(user.id).then(({ data }) => {
        if (data) setNotifications(data)
      })
    }
  }, [user?.id])

  const handleSignOut = async () => {
    await signOut()
    toast.info('Signed out')
  }

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center px-4 gap-3 sticky top-0 z-20">
      <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600">
        <Menu size={20} />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search orders, customers..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-300"
          />
        </div>
      </div>

      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => { setShowNotifs(!showNotifs); setShowProfile(false) }}
          className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 relative"
        >
          <Bell size={20} />
          {notifications.length > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          )}
        </button>

        {showNotifs && (
          <div className="absolute right-0 top-12 w-80 bg-white border border-slate-200 rounded-xl shadow-lg py-2 max-h-96 overflow-auto">
            <div className="px-4 py-2 border-b border-slate-100 font-medium text-sm text-slate-700">
              Notifications
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 py-6 text-sm text-slate-400 text-center">No new notifications</div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className="px-4 py-3 hover:bg-slate-50 cursor-pointer border-b border-slate-50">
                  <div className="text-sm font-medium text-slate-700">{n.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{n.message}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Profile */}
      <div className="relative">
        <button
          onClick={() => { setShowProfile(!showProfile); setShowNotifs(false) }}
          className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100"
        >
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <User size={16} className="text-indigo-600" />
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-sm font-medium text-slate-700 leading-tight">{profile?.full_name || 'User'}</div>
            <div className="text-[10px] text-slate-400 leading-tight capitalize">{profile?.role || 'staff'}</div>
          </div>
        </button>

        {showProfile && (
          <div className="absolute right-0 top-12 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1">
            <div className="px-4 py-2 border-b border-slate-100">
              <div className="text-sm font-medium text-slate-700">{profile?.full_name}</div>
              <div className="text-xs text-slate-400">{user?.email}</div>
            </div>
            <button
              onClick={handleSignOut}
              className="w-full px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
