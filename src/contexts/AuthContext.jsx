import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId) => {
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).single()
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
      // eslint-disable-next-line no-console -- visible in production for debugging auth issues
      console.warn('Auth init failed, falling back to unauthenticated:', err?.message)
      if (mounted) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id).catch(() => {})
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [fetchProfile])

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error }
    setUser(data.user)
    await fetchProfile(data.user.id)
    return { data }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  const createUser = async (email, password, fullName, role = 'staff') => {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName, role } }
    })
    return { data, error }
  }

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

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signOut, createUser,
      isAdmin, isStaff, isViewer,
      hasPermission, fetchProfile
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
