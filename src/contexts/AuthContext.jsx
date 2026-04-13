import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'

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

export function AuthProvider({ children }) {
  const peeked = peekSession()
  const [user, setUser] = useState(peeked)
  const [profile, setProfile] = useState(null)
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

    // When the tab regains focus after being idle, prod Supabase to
    // verify the session is still valid and refresh it if needed.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (!mounted) return
          if (session?.user) {
            setUser(session.user)
          } else {
            // Session expired and couldn't refresh — force re-login
            setUser(null)
            setProfile(null)
          }
        }).catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mounted = false
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchProfile])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error }
    setUser(data.user)
    await fetchProfile(data.user.id)
    return { data }
  }, [fetchProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
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
        if (!modPerms) return true
        // Any truthy entry means they can see it
        return Object.values(modPerms).some(v => v === true)
      }
      return false
    }

    // Action-level check
    if (isViewer) return action === 'view' && modPerms?.view !== false
    if (isStaff) {
      if (!modPerms) return true // permissive default for staff on unmapped modules
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
