import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ─── useSWRList ────────────────────────────────────────────
// Stale-while-revalidate list hook. The single source of truth for every
// list page in the app (Orders, Enquiries, Customers, Invoices, etc.).
//
// Contract:
//   - On first render, synchronously reads cached data from sessionStorage
//     and returns it immediately. No TTL expiry — cached data is ALWAYS
//     shown if it exists, even if it's 3 days old. Freshness is a
//     background concern.
//   - `loading` is true only when there is NO cache to show (i.e. genuine
//     first visit). Never true during background revalidation.
//   - Revalidates on:
//       a) first mount AND (no cache OR cache is >staleAfterMs old)
//       b) tab returning from hidden for ≥ revalidateOnFocusAfterMs
//       c) caller invoking the returned `refresh()` function
//   - Concurrent revalidations for the same cacheKey are coalesced — 10
//     simultaneous mounts (e.g. StrictMode in dev) share ONE network call.
//
// This hook REPLACES per-page TTL-expiry cache code + per-page
// visibilitychange handlers. Delete those on migration.

const DEFAULT_STALE_AFTER_MS = 10 * 60 * 1000
const DEFAULT_REVALIDATE_ON_FOCUS_AFTER_MS = 30 * 1000

const inFlightByKey = new Map()

// localStorage (not sessionStorage) so cache survives closing the browser.
// Monday-morning opens render instantly from Friday's cache while a silent
// background refresh swaps in the latest rows.
const readCache = (key) => {
  if (!key) return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return {
      data: Array.isArray(parsed.data) ? parsed.data : null,
      ts: Number(parsed.ts) || 0,
    }
  } catch {
    return null
  }
}

const writeCache = (key, data) => {
  if (!key) return
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
  } catch {
    // Quota hit — evict other saras_* list caches and retry once.
    try {
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('saras_') && k !== key) localStorage.removeItem(k)
      }
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }))
    } catch { /* still over quota — give up silently */ }
  }
}

export function useSWRList(
  cacheKey,
  fetcher,
  {
    staleAfterMs = DEFAULT_STALE_AFTER_MS,
    revalidateOnFocusAfterMs = DEFAULT_REVALIDATE_ON_FOCUS_AFTER_MS,
    enabled = true,
  } = {},
) {
  // Synchronous initial read — guarantees cache is shown on first paint.
  const initial = useMemo(() => (enabled && cacheKey ? readCache(cacheKey) : null), [cacheKey, enabled])

  const [data, setData] = useState(initial?.data || [])
  const [loading, setLoading] = useState(!initial?.data)
  const [error, setError] = useState(null)
  const lastRevalidatedRef = useRef(initial?.ts || 0)
  const mountedRef = useRef(true)

  const revalidate = useCallback(async (opts = {}) => {
    if (!cacheKey || !enabled) return
    const { force = false } = opts
    // Coalesce concurrent calls
    if (inFlightByKey.has(cacheKey)) return inFlightByKey.get(cacheKey)

    const p = (async () => {
      // Skip if we recently revalidated
      if (!force && Date.now() - lastRevalidatedRef.current < 3_000) return
      try {
        if (!mountedRef.current) return
        // Revalidation is ALWAYS silent. `loading` is only true on the
        // genuine cold-start initial useState — any subsequent refresh
        // (mount with stale cache, visibility return, manual refresh())
        // happens in the background without a spinner. This matters for
        // tables that are legitimately empty (0 orders / 0 enquiries):
        // those users would otherwise see a 500 ms spinner on every
        // post-idle navigation even though the cached empty state is
        // already on screen.
        const result = await fetcher()
        if (!mountedRef.current) return
        const rows = Array.isArray(result?.data) ? result.data : []
        if (result?.error) {
          setError(result.error)
        } else {
          setError(null)
          setData(rows)
          writeCache(cacheKey, rows)
          lastRevalidatedRef.current = Date.now()
        }
      } catch (err) {
        if (mountedRef.current) setError(err)
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    })()

    inFlightByKey.set(cacheKey, p)
    p.finally(() => { inFlightByKey.delete(cacheKey) })
    return p
  }, [cacheKey, enabled, fetcher])

  // First-mount: reveal cache; revalidate only if cache is missing OR the
  // cache timestamp is older than staleAfterMs.
  //
  // IMPORTANT: an empty-array cache (`data: []`) is a VALID cache entry —
  // it represents "user has zero rows of this type" and should NOT force a
  // revalidation. Only the absence of a cache entry or a timestamp past
  // staleAfterMs triggers a refresh.
  useEffect(() => {
    if (!enabled || !cacheKey) return
    mountedRef.current = true
    const hasCacheEntry = !!initial && Array.isArray(initial.data)
    const cacheAge = hasCacheEntry ? Date.now() - initial.ts : Infinity
    if (!hasCacheEntry || cacheAge > staleAfterMs) {
      revalidate({ force: true })
    }
    return () => { mountedRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, enabled])

  // Visibility return: revalidate if we've been hidden long enough.
  useEffect(() => {
    if (!enabled || !cacheKey) return
    let hiddenAt = 0
    const onVis = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
      if (document.visibilityState !== 'visible') return
      if (!hiddenAt) return
      const gone = Date.now() - hiddenAt
      hiddenAt = 0
      if (gone >= revalidateOnFocusAfterMs) revalidate()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [enabled, cacheKey, revalidate, revalidateOnFocusAfterMs])

  const refresh = useCallback(() => revalidate({ force: true }), [revalidate])

  return { data, loading, error, refresh, setData }
}
