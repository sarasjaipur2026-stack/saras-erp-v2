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

    // Safety timeout - never hang forever
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Auth loading timeout - forcing ready state')
        setLoading(false)
      }
    }, 5000)

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return
      if (session?.user) {
        setUser(session.user)
        fetchProfile(session.user.id).catch(console.error).finally(() => {
          if (mounted) setLoading(false)
        })
      } else {
        setLoading(false)
      }
    }).catch((err) => {
      console.error('Auth getSession error:', err)
      if (mounted) setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        await fetchProfile(session.user.id).catch(console.error)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
      }
    })

    return () => {
      mounted = false
      clearTimeout(timeout)
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

  const hasPermission = useCallback((module, action) => {
    if (isAdmin) return true
    if (isViewer && action !== 'view') return false
    const perms = profile?.permissions || {}
    return perms[module]?.[action] ?? isStaff
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
