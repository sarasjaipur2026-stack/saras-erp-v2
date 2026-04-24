import { useState, useEffect, useRef } from 'react'

// ─── STICKY STATE ────────────────────────────────────────────
// Like useState, but the value is persisted to localStorage under `key` so a
// page reload restores the last value. Ideal for filter state that the
// operator expects to persist across sessions (status tab, date range preset,
// customer search).
//
// Usage:
//   const [activeTab, setActiveTab] = useStickyState('orders.activeTab', 'all')
//
// Debounced writes so rapid state changes don't spam localStorage.

const WRITE_DEBOUNCE_MS = 150

export function useStickyState(key, initial) {
  const storageKey = `saras.sticky.${key}`

  // Read once on mount — SSR-safe via window check
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') return initial
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw === null) return initial
      return JSON.parse(raw)
    } catch {
      return initial
    }
  })

  const timerRef = useRef(null)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      try {
        if (value === undefined || value === null) {
          window.localStorage.removeItem(storageKey)
        } else {
          window.localStorage.setItem(storageKey, JSON.stringify(value))
        }
      } catch {
        // Quota exceeded / private mode — silently ignore. State still works in-memory.
      }
    }, WRITE_DEBOUNCE_MS)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [storageKey, value])

  return [value, setValue]
}
