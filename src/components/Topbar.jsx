import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useToast } from '../contexts/ToastContext'
import { notifications as notifDb } from '../lib/db'
import { Menu, Bell, LogOut, Search, User, ChevronDown } from 'lucide-react'

export default function Topbar({ onMenuClick }) {
  const { user, profile, signOut } = useAuth()
  const toast = useToast()
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const notifRef = useRef(null)
  const profileRef = useRef(null)

  useEffect(() => {
    if (user?.id) {
      notifDb.getUnread(user.id).then(({ data }) => {
        if (data) setNotifications(data)
      }).catch(() => {})
    }
  }, [user?.id])

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false)
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    toast.info('Signed out')
  }

  const initials = (profile?.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center px-4 gap-3 sticky top-0 z-20">
      <button onClick={onMenuClick} className="lg:hidden p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors">
        <Menu size={20} />
      </button>

      {/* Search */}
      <div className="flex-1 max-w-md">
        <div className="relative group">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-indigo-500" />
          <input
            type="text"
            placeholder="Search orders, customers..."
            className="w-full pl-9 pr-4 py-2 text-sm bg-slate-50/80 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-300 focus:bg-white transition-all placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button
          onClick={() => { setShowNotifs(!showNotifs); setShowProfile(false) }}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 relative transition-colors"
        >
          <Bell size={19} />
          {notifications.length > 0 && (
            <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold ring-2 ring-white">
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          )}
        </button>

        {showNotifs && (
          <div className="absolute right-0 top-12 w-80 bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/40 py-1 max-h-96 overflow-auto dropdown-in">
            <div className="px-4 py-3 border-b border-slate-100 font-semibold text-sm text-slate-800">
              Notifications
            </div>
            {notifications.length === 0 ? (
              <div className="px-4 py-10 text-sm text-slate-400 text-center">
                <Bell size={22} className="mx-auto mb-2.5 text-slate-300" />
                No new notifications
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className="px-4 py-3 hover:bg-slate-50 cursor-pointer transition-colors border-b border-slate-50 last:border-0">
                  <div className="text-sm font-medium text-slate-700">{n.title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{n.message}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Profile */}
      <div className="relative" ref={profileRef}>
        <button
          onClick={() => { setShowProfile(!showProfile); setShowNotifs(false) }}
          className="flex items-center gap-2.5 py-1.5 pl-1.5 pr-2 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[11px] font-bold shadow-sm shadow-indigo-500/20">
            {initials}
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-[13px] font-medium text-slate-700 leading-tight">{profile?.full_name || 'User'}</div>
            <div className="text-[10px] text-slate-400 leading-tight capitalize font-medium">{profile?.role || 'staff'}</div>
          </div>
          <ChevronDown size={13} className="hidden sm:block text-slate-300" />
        </button>

        {showProfile && (
          <div className="absolute right-0 top-12 w-56 bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/40 py-1 dropdown-in">
            <div className="px-4 py-3 border-b border-slate-100">
              <div className="text-sm font-semibold text-slate-800">{profile?.full_name || 'User'}</div>
              <div className="text-xs text-slate-400 mt-0.5 truncate">{user?.email}</div>
            </div>
            <div className="p-1">
              <button
                onClick={handleSignOut}
                className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition-colors rounded-xl"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  )
}
