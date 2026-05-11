/**
 * TopbarV2 — three-zone always-visible chrome for the new ERP shell.
 *
 * Left zone  : hamburger (mobile) · brand mark · tenant label
 * Centre zone: Cmd+K search hotbar (fake input that opens CommandPalette)
 * Right zone : offline-queue pill · status pills · notifications · profile menu
 *
 * Drop-in replacement for src/components/Topbar.jsx. Wire-in happens at
 * Phase 4 (lag md5 re-baseline). Until then, this file is dead code that
 * ships in the bundle but isn't rendered.
 *
 * Public API matches Topbar.jsx: { onMenuClick? } prop.
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.4
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 2
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useToast } from '../../contexts/ToastContext'
import { notifications as notifDb } from '../../lib/db'
import { useOfflineQueue, flushQueue } from '../../lib/offlineQueue'
import { Menu, Bell, LogOut, Search, ChevronDown, CheckCheck, CloudOff, Cloud } from 'lucide-react'
import StatusPills from './StatusPills'

const fmtRel = (iso) => {
  if (!iso) return '—'
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '')

/**
 * Dispatch a window-level event that <ShellV2> (Phase 4) will listen to and
 * use to open the CommandPalette. Decoupling via event means TopbarV2 has
 * no direct dependency on palette state — clean swap surface.
 */
function openCommandPalette() {
  window.dispatchEvent(new CustomEvent('saras:open-command-palette'))
}

export default function TopbarV2({ onMenuClick }) {
  const navigate = useNavigate()
  const { user, profile, signOut } = useAuth()
  const toast = useToast()
  const [notifications, setNotifications] = useState([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const notifRef = useRef(null)
  const profileRef = useRef(null)

  // Same stable-callback pattern as original Topbar (CRIT-3 fix).
  const loadNotifs = useCallback(() => {
    if (!user?.id) return
    notifDb.getUnread(user.id).then(({ data }) => {
      if (data) setNotifications(data)
    }).catch(() => {})
  }, [user?.id])

  useEffect(() => {
    if (!user?.id) return
    loadNotifs()
    const int = setInterval(loadNotifs, 60_000)
    return () => clearInterval(int)
  }, [user?.id, loadNotifs])

  useEffect(() => {
    const handler = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifs(false)
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Cmd+K / Ctrl+K opens the palette.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        openCommandPalette()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSignOut = async () => {
    await signOut()
    toast.info('Signed out')
  }

  const handleNotifClick = async (n) => {
    setShowNotifs(false)
    if (!n.read_at) {
      await notifDb.markAsRead(n.id)
      setNotifications(prev => prev.filter(x => x.id !== n.id))
    }
    if (n.entity_type === 'order' && n.entity_id) {
      navigate(`/orders/${n.entity_id}`)
    } else {
      navigate('/notifications')
    }
  }

  const markAllRead = async (e) => {
    e.stopPropagation()
    if (!user?.id) return
    await notifDb.markAllAsRead(user.id)
    setNotifications([])
  }

  const initials = (profile?.full_name || 'U').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  const queuedWrites = useOfflineQueue()
  const [flushing, setFlushing] = useState(false)
  const handleFlush = async () => {
    if (flushing) return
    setFlushing(true)
    try {
      const { succeeded, remaining } = await flushQueue()
      if (succeeded > 0) toast.success(`Synced ${succeeded} pending write${succeeded === 1 ? '' : 's'}`)
      if (remaining > 0) toast.error(`${remaining} write${remaining === 1 ? '' : 's'} still pending — try again`)
      else if (succeeded === 0) toast.info('Nothing to sync')
    } finally {
      setFlushing(false)
    }
  }

  return (
    <header className="h-14 bg-white/85 backdrop-blur-xl border-b border-slate-200/60 flex items-center px-3 gap-2 sticky top-0 z-20">
      {/* ===== Left zone ===== */}
      <button
        type="button"
        onClick={onMenuClick}
        aria-label="Open menu"
        className="lg:hidden p-2 -ml-1 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer focus-ring"
      >
        <Menu size={20} />
      </button>

      <div className="flex items-center gap-2 px-1 select-none">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-[11px] font-bold shadow-sm shadow-indigo-500/20">
          S
        </div>
        <div className="hidden sm:block leading-tight">
          <div className="text-[12px] font-bold text-slate-800 tracking-tight">SARAS</div>
          <div className="text-[9px] text-slate-400 font-medium -mt-0.5">Jaipur</div>
        </div>
      </div>

      {/* ===== Centre zone — Cmd+K hotbar ===== */}
      <div className="flex-1 max-w-md mx-auto">
        <button
          type="button"
          onClick={openCommandPalette}
          className="w-full group relative inline-flex items-center gap-2 pl-9 pr-2 py-1.5 text-left text-[12px] text-slate-400 bg-slate-50/80 hover:bg-white border border-slate-200/80 hover:border-indigo-300 rounded-xl transition-all focus-ring cursor-pointer"
          aria-label="Open search and commands"
        >
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-500" />
          <span className="hidden sm:inline">Search anywhere</span>
          <span className="sm:hidden">Search</span>
          <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-slate-200 text-[9px] font-mono text-slate-500 shadow-sm">
            {isMac ? '⌘' : 'Ctrl'} K
          </kbd>
        </button>
      </div>

      {/* ===== Right zone ===== */}
      {queuedWrites.length > 0 && (
        <button
          type="button"
          onClick={handleFlush}
          disabled={flushing}
          title={`${queuedWrites.length} write${queuedWrites.length === 1 ? '' : 's'} queued — click to retry sync`}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-semibold hover:bg-amber-100 transition-colors disabled:opacity-50"
        >
          {flushing ? <Cloud size={12} className="animate-pulse" /> : <CloudOff size={12} />}
          {queuedWrites.length}
        </button>
      )}

      <StatusPills />

      {/* Notifications */}
      <div className="relative" ref={notifRef}>
        <button
          type="button"
          onClick={() => { setShowNotifs(!showNotifs); setShowProfile(false) }}
          aria-label={`Notifications${notifications.length ? ` (${notifications.length} unread)` : ''}`}
          aria-expanded={showNotifs}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-700 relative transition-colors cursor-pointer focus-ring"
        >
          <Bell size={18} />
          {notifications.length > 0 && (
            <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold ring-2 ring-white">
              {notifications.length > 9 ? '9+' : notifications.length}
            </span>
          )}
        </button>

        {showNotifs && (
          <div className="absolute right-0 top-12 w-96 bg-white border border-slate-200/80 rounded-2xl shadow-xl shadow-slate-200/40 py-1 max-h-[28rem] overflow-hidden flex flex-col dropdown-in">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div className="font-semibold text-sm text-slate-800">Notifications</div>
              {notifications.length > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                >
                  <CheckCheck size={12} /> Mark all read
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-sm text-slate-500 text-center">
                  <Bell size={22} className="mx-auto mb-2.5 text-slate-400" />
                  No new notifications
                </div>
              ) : (
                notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm font-semibold text-slate-700 truncate">{n.title}</div>
                      <div className="text-[10px] text-slate-400 font-mono shrink-0">{fmtRel(n.created_at)}</div>
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</div>
                  </button>
                ))
              )}
            </div>
            <button
              onClick={() => { setShowNotifs(false); navigate('/notifications') }}
              className="px-4 py-2.5 border-t border-slate-100 text-[12px] font-semibold text-indigo-600 hover:bg-indigo-50/50 transition-colors text-center shrink-0"
            >
              View all →
            </button>
          </div>
        )}
      </div>

      {/* Profile */}
      <div className="relative" ref={profileRef}>
        <button
          onClick={() => { setShowProfile(!showProfile); setShowNotifs(false) }}
          className="flex items-center gap-2 py-1 pl-1 pr-1.5 rounded-xl hover:bg-slate-50 transition-colors"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[11px] font-bold shadow-sm shadow-indigo-500/20">
            {initials}
          </div>
          <div className="hidden md:block text-left">
            <div className="text-[12px] font-medium text-slate-700 leading-tight">{profile?.full_name || 'User'}</div>
            <div className="text-[9px] text-slate-400 leading-tight capitalize font-medium">{profile?.role || 'staff'}</div>
          </div>
          <ChevronDown size={12} className="hidden md:block text-slate-300" />
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
