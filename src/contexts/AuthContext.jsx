import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { prewarmSession, resetAuthGate } from '../lib/authGate'

const AuthContext = createContext(null)

// Attempt synchronous session read from localStorage — avoids the loading flash
function peekSession() {
  try {
    const raw = localStorage.getItem('sb-kcnujpvzewtuttfcrtyz-auth-token')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Supabase stores { currentSession: { user, ... }, expiresAt: ... }
    const session = parsed?.currentSession || parsed
    const expiresAt = parsed?.expiresAt || session?.expires_at
    if (expiresAt && expiresAt * 1000 < Date.now()) return null
    return session?.user || null
  } catch {
    return null
  }
}

// ─── Profile cache in sessionStorage ──────────────────────
const PROFILE_CACHE_KEY = 'saras_profile_v1'
const PROFILE_CACHE_TTL = 15 * 60 * 1000 // 15 min

function readProfileCache(userId) {
  try {
    const raw = sessionStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const { ts, uid, data } = JSON.parse(raw)
    if (uid !== userId || Date.now() - ts > PROFILE_CACHE_TTL) return null
    return data
  } catch { return null }
}

function writeProfileCache(userId, data) {
  try {
    sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ ts: Date.now(), uid: userId, data }))
  } catch { /* full */ }
}

export function AuthProvider({ children }) {
  const peeked = peekSession()
  const [user, setUser] = useState(peeked)
  const cachedProfile = peeked ? readProfileCache(peeked.id) : null
  const [profile, setProfile] = useState(cachedProfile)
  // If we peeked a valid user, skip the loading state entirely
  const [loading, setLoading] = useState(!peeked)

  const fetchProfile = useCallback(async (userId) => {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (error) {
      console.warn('[AuthContext] fetchProfile failed:', error.message)
      setProfile(null)
      return null
    }
    setProfile(data)
    writeProfileCache(userId, data)
    return data
  }, [])

  useEffect(() => {
    let mounted = true

    // Race getSession against a timeout so the app never hangs on a stuck lock
    const sessionWithTimeout = (ms = 4000) => {
      const timer = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getSession timeout')), ms)
      )
      return Promise.race([supabase.auth.getSession(), timer])
    }

    sessionWithTimeout().then(({ data: { session } }) => {
      if (!mounted) return
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id)
          .catch(() => {})
          .finally(() => { if (mounted) setLoading(false) })
      } else {
        setLoading(false)
      }
    }).catch((err) => {
      console.warn('Auth init failed, falling back to unauthenticated:', err?.message)
      if (mounted) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        setUser(session.user)
        // Only re-fetch profile on sign-in, not every token refresh
        if (event === 'SIGNED_IN') {
          await fetchProfile(session.user.id).catch(() => {})
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
      }
    })

    // ─── Post-idle prewarm ─────────────────────────────────────
    // When the tab regains focus / becomes visible / resumes from Page
    // Lifecycle freeze, force a token refresh via the shared authGate so
    // the user's next click hits a warm session. Every data layer call in
    // safe() already awaits the SAME gate promise — so if a query fires
    // mid-refresh, it queues on the in-flight refresh instead of racing
    // with a stale JWT.
    let hiddenAt = 0
    const AUTH_IDLE_THRESHOLD = 30 * 1000
    const prewarmIfIdle = () => {
      const wasIdle = hiddenAt > 0 && Date.now() - hiddenAt >= AUTH_IDLE_THRESHOLD
      hiddenAt = 0
      if (!wasIdle) return
      prewarmSession()
        .then(async () => {
          if (!mounted) return
          // Surface any user-state change after the refresh
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) setUser(session.user)
          else { setUser(null); setProfile(null) }
        })
        .catch(() => {/* authGate already handles logging */})
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
        return
      }
      if (document.visibilityState === 'visible') prewarmIfIdle()
    }

    // Also listen on window.focus — fires even when visibilitychange doesn't
    // (e.g. Alt-Tab between windows, or the user clicking into the window).
    const handleFocus = () => prewarmIfIdle()

    // Page Lifecycle API "resume" — fires when Chrome un-freezes a deeply
    // backgrounded tab. More reliable than visibilitychange on long idles.
    const handleResume = () => {
      // Mark as idle regardless of hiddenAt — a resume means the tab was
      // frozen, which only happens after extended background time.
      if (!hiddenAt) hiddenAt = Date.now() - AUTH_IDLE_THRESHOLD - 1
      prewarmIfIdle()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    document.addEventListener('resume', handleResume)

    return () => {
      mounted = false
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('resume', handleResume)
    }
  }, [fetchProfile])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error }
    resetAuthGate()
    setUser(data.user)
    await fetchProfile(data.user.id)
    return { data }
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    resetAuthGate()
    setUser(null)
    setProfile(null)
  }, [])

  const createUser = useCallback(async (email, password, fullName, role = 'staff') => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } }
    })
    return { data, error }
  }, [])

  const isAdmin = profile?.role === 'admin'
  const isStaff = profile?.role === 'staff' || isAdmin
  const isViewer = profile?.role === 'viewer'

  // hasPermission(module)           -> true if the user can access the module at all (for sidebar filtering)
  // hasPermission(module, action)   -> true if the user can perform that specific action
  //
  // Resolution order:
  //   1. Admins always yes
  //   2. Viewers: only 'view' actions allowed, and only for modules where perms[module]?.view is not false
  //   3. Staff: explicit permission entry wins, otherwise default to true (permissive baseline)
  //   4. Unknown role: default to false (deny)
  const hasPermission = useCallback((module, action) => {
    if (isAdmin) return true
    const perms = profile?.permissions || {}
    const modPerms = perms[module]

    // Module-level check (no action supplied) — used by the sidebar
    if (!action) {
      if (isViewer) return modPerms?.view !== false
      if (isStaff) {
        if (!modPerms) return false // deny by default — staff must have explicit permissions
        // Any truthy entry means they can see it
        return Object.values(modPerms).some(v => v === true)
      }
      return false
    }

    // Action-level check
    if (isViewer) return action === 'view' && modPerms?.view !== false
    if (isStaff) {
      if (!modPerms) return false // deny by default — staff must have explicit permissions
      return modPerms[action] === true
    }
    return false
  }, [profile, isAdmin, isStaff, isViewer])

  const value = useMemo(() => ({
    user, profile, loading,
    signIn, signOut, createUser,
    isAdmin, isStaff, isViewer,
    hasPermission, fetchProfile
  }), [user, profile, loading, signIn, signOut, createUser, isAdmin, isStaff, isViewer, hasPermission, fetchProfile])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
