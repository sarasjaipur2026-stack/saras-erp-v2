import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'

const KEY_PREFIX = 'saras.recentSearches.v2'
const MAX = 20

const read = (key) => {
  if (!key) return []
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const write = (key, list) => {
  if (!key) return
  try { localStorage.setItem(key, JSON.stringify(list.slice(0, MAX))) } catch {
    /* quota / private mode — silently ignore */
  }
}

/**
 * Recent searches, stored per-browser in localStorage.
 * Each entry: { entity_type, entity_id, primary_label, secondary, openedAt }
 */
export function useRecentSearches() {
  const { user } = useAuth()
  const key = user?.id ? `${KEY_PREFIX}.${user.id}` : null
  const [recents, setRecents] = useState(() => read(key))

  useEffect(() => {
    setRecents(read(key))
  }, [key])

  const remember = useCallback((item) => {
    if (!item || !item.entity_id) return
    const entry = {
      entity_type: item.entity_type,
      entity_id: item.entity_id,
      primary_label: item.primary_label,
      secondary: item.secondary || null,
      openedAt: Date.now(),
    }
    setRecents((prev) => {
      const next = [entry, ...prev.filter(
        (r) => !(r.entity_type === entry.entity_type && r.entity_id === entry.entity_id)
      )].slice(0, MAX)
      write(key, next)
      return next
    })
  }, [key])

  const clear = useCallback(() => {
    setRecents([])
    write(key, [])
  }, [key])

  // Keep multiple tabs in sync
  useEffect(() => {
    const onStorage = (e) => { if (e.key === key) setRecents(read(key)) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [key])

  return { recents, remember, clear }
}
