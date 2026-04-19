import { useCallback, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// ─── useQueryState ─────────────────────────────────────────
// Minimal URL-backed state hook: read a single query param, return
// [value, setValue]. The URL stays the source of truth so filter state
// is shareable (copy the URL, paste it in another tab or WhatsApp, same
// filters appear) and survives a browser reload.
//
// Usage:
//   const [status, setStatus] = useQueryState('status', 'all')
//   const [q, setQ] = useQueryState('q', '')
//
// Multiple values (e.g., multi-select) — pass opts.multi = true:
//   const [cities, setCities] = useQueryState('city', [], { multi: true })
//   setCities(['Jaipur', 'Delhi'])
//
// `setValue` accepts either a value or an updater function, matches
// useState semantics. It calls `navigate({replace: true})` so filter
// tweaks don't pollute browser history.

export function useQueryState(key, defaultValue = '', opts = {}) {
  const { multi = false } = opts
  const location = useLocation()
  const navigate = useNavigate()

  const value = useMemo(() => {
    const sp = new URLSearchParams(location.search)
    if (multi) {
      const raw = sp.get(key)
      if (!raw) return defaultValue
      return raw.split(',').filter(Boolean)
    }
    const raw = sp.get(key)
    return raw == null ? defaultValue : raw
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, key, multi])

  const setValue = useCallback((next) => {
    const sp = new URLSearchParams(location.search)
    const resolved = typeof next === 'function' ? next(value) : next
    if (resolved == null || resolved === '' || resolved === defaultValue) {
      sp.delete(key)
    } else if (multi) {
      const arr = Array.isArray(resolved) ? resolved : [resolved]
      if (arr.length === 0) sp.delete(key)
      else sp.set(key, arr.join(','))
    } else {
      sp.set(key, String(resolved))
    }
    const qs = sp.toString()
    navigate(
      { pathname: location.pathname, search: qs ? `?${qs}` : '' },
      { replace: true },
    )
  }, [key, multi, value, defaultValue, location.pathname, location.search, navigate])

  return [value, setValue]
}
