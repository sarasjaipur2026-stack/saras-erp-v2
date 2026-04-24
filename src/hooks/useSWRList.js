import { useCallback, useEffect, useRef, useState } from 'react'

// ─── STALE-WHILE-REVALIDATE (SWR) LIST HOOK ──────────────────
// Paints instantly from sessionStorage cache, refetches in background.
//
// Eliminates the full-page spinner that made list pages feel slow even
// when the actual data was tiny. First visit = normal fetch; repeat visit
// (same session) = instant paint, silent refetch.
//
// Usage:
//   const { data, loading, error, refetch } = useSWRList(
//     `orders:${JSON.stringify(filters)}`,
//     () => ordersDb.listPaged(filters),
//   )
//
// Mutations (create/update/delete): call invalidateSWR(keyPrefix) after
// the write to force the next mount / refetch to skip cache.

const CACHE_PREFIX = 'saras.swr.v1.'
const DEFAULT_TTL = 30 * 60 * 1000 // 30 minutes — conservative

function readCache(key) {
  try {
    const raw = typeof window === 'undefined' ? null : sessionStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed?.ts) return null
    const ttl = typeof parsed.ttl === 'number' ? parsed.ttl : DEFAULT_TTL
    if (Date.now() - parsed.ts > ttl) return null
    return parsed.data
  } catch {
    return null
  }
}

function writeCache(key, data, ttl) {
  try {
    sessionStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ ts: Date.now(), ttl: ttl ?? DEFAULT_TTL, data }),
    )
  } catch {
    // quota exceeded / private mode — ignore, cache is a nice-to-have
  }
}

/**
 * Stale-while-revalidate fetch.
 * @param {string} key      Cache key — include all filter inputs so different
 *                          filter combos get different cache entries.
 * @param {() => Promise<any>} fetcher  Async function returning fresh data.
 * @param {object} [opts]
 * @param {boolean} [opts.enabled=true]  Skip fetching entirely when false.
 * @param {number}  [opts.ttl]           Cache TTL ms override.
 */
export function useSWRList(key, fetcher, { enabled = true, ttl } = {}) {
  const cached = enabled ? readCache(key) : null
  const [data, setData] = useState(cached)
  const [loading, setLoading] = useState(enabled && !cached)
  const [error, setError] = useState(null)

  // Keep callback in a ref so we don't re-subscribe on every render
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  }, [fetcher])

  const cancelledRef = useRef(false)
  useEffect(() => {
    cancelledRef.current = false
    return () => {
      cancelledRef.current = true
    }
  }, [])

  const refetch = useCallback(async () => {
    if (!enabled) return null
    try {
      const fresh = await fetcherRef.current()
      if (cancelledRef.current) return null
      setData(fresh)
      setError(null)
      writeCache(key, fresh, ttl)
      return fresh
    } catch (e) {
      if (!cancelledRef.current) setError(e)
      return null
    } finally {
      if (!cancelledRef.current) setLoading(false)
    }
  }, [key, enabled, ttl])

  // Mount / key-change: trigger fetch. If cache already present we stay
  // out of the "loading" state so the UI paints immediately.
  useEffect(() => {
    if (!enabled) return
    refetch()
  }, [key, enabled, refetch])

  return { data, loading, error, refetch }
}

/**
 * Evict a cache entry. Accepts an exact key OR a key prefix (trailing `*`).
 * Example: `invalidateSWR('orders:*')` wipes every cached filter combo.
 */
export function invalidateSWR(key) {
  try {
    if (key.endsWith('*')) {
      const prefix = CACHE_PREFIX + key.slice(0, -1)
      const toDelete = []
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i)
        if (k && k.startsWith(prefix)) toDelete.push(k)
      }
      toDelete.forEach((k) => sessionStorage.removeItem(k))
    } else {
      sessionStorage.removeItem(CACHE_PREFIX + key)
    }
  } catch {
    /* ignore */
  }
}
