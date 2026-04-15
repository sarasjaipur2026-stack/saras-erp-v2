import { useCallback, useEffect, useState } from 'react'

const KEY = 'saras.recentSearches.v1'
const MAX = 20

const read = () => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const write = (list) => {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX))) } catch {
    /* quota / private mode — silently ignore */
  }
}

/**
 * Recent searches, stored per-browser in localStorage.
 * Each entry: { entity_type, entity_id, primary_label, secondary, openedAt }
 */
export function useRecentSearches() {
  const [recents, setRecents] = useState(() => read())

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
      write(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setRecents([])
    write([])
  }, [])

  // Keep multiple tabs in sync
  useEffect(() => {
    const onStorage = (e) => { if (e.key === KEY) setRecents(read()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { recents, remember, clear }
}
