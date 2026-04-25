import { useCallback, useEffect, useRef, useState } from 'react'

// ─── STALE-WHILE-REVALIDATE (SWR) LIST HOOK ──────────────────
// Re-applying the fix from commit `ea472e9` — the "always-show-stale" contract.
//
// Prior regression history:
//   Every list page had its own sessionStorage cache with TTL. When the user
//   came back after ≥10 min idle, readCache returned null → loading=true →
//   full-page spinner painted for 1-2s while query ran. This is the exact
//   anti-pattern that the prior fix eliminated. Any `if (age > TTL) return null`
//   pattern silently re-introduces the bug.
//
// Contract (DO NOT CHANGE without reading the prior incident report):
//   - Cache renders synchronously on FIRST PAINT regardless of age. Always.
//   - loading=true ONLY when there's no cache entry at all (genuine first visit).
//   - Background revalidation on mount + on tab refocus (after ≥30s hidden).
//   - Concurrent refetches for the same key coalesce onto a single in-flight
//     promise (via module-level map) — 10 simultaneous mounts share 1 round trip.
//   - invalidateSWR(key) wipes an entry; next read returns null → spinner on.
//
// Usage:
//   const { data, loading, error, refetch } = useSWRList(
//     `orders:${JSON.stringify(filters)}`,
//     () => ordersDb.listPaged(filters),
//   )

const CACHE_PREFIX = 'saras.swr.v1.'

// Module-level in-flight coalescing. Key → Promise. Shared across all mounts.
const inFlight = new Map()

// CRIT-4: hard cap on how long a single in-flight fetch can hold the slot.
// Without this, if a fetcher's promise hangs forever (e.g. supabase-js stuck
// in an auth-refresh queue after idle), the inFlight entry never clears and
// every subsequent mount coalesces onto the same dead promise — the page sits
// on its skeleton forever with zero network activity. 35s lets a slow paginated
// fetch through but unblocks any genuine deadlock.
const INFLIGHT_TIMEOUT_MS = 35_000

function readCache(key) {
  try {
    const raw = typeof window === 'undefined' ? null : sessionStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // NO age check. Stale data beats a spinner every time.
    return parsed?.data ?? null
  } catch {
    return null
  }
}

function writeCache(key, data) {
  try {
    sessionStorage.setItem(
      CACHE_PREFIX + key,
      JSON.stringify({ ts: Date.now(), data }),
    )
  } catch {
    // quota exceeded / private mode — cache is a nice-to-have, continue
  }
}

function cacheAge(key) {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return Infinity
    const parsed = JSON.parse(raw)
    return Date.now() - (parsed?.ts || 0)
  } catch {
    return Infinity
  }
}

/**
 * Stale-while-revalidate fetch.
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @param {object} [opts]
 * @param {boolean} [opts.enabled=true]
 * @param {number}  [opts.staleAfterMs]  Skip background revalidation if cache is
 *                                       newer than this. Default 30s.
 */
export function useSWRList(key, fetcher, { enabled = true, staleAfterMs = 30_000 } = {}) {
  const cached = enabled ? readCache(key) : null
  const [data, setData] = useState(cached)
  const [loading, setLoading] = useState(enabled && !cached)
  const [error, setError] = useState(null)

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

  // Coalesce concurrent refetches for the same key. Returns the shared promise.
  // The pending promise is RACED against a 35s deadline so a hung fetcher can
  // never wedge the inFlight slot for the lifetime of the tab.
  const refetch = useCallback(async () => {
    if (!enabled) return null
    let pending = inFlight.get(key)
    if (!pending) {
      pending = (async () => {
        let timer
        try {
          const fresh = await Promise.race([
            fetcherRef.current(),
            new Promise((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(`useSWRList timeout for ${key}`)),
                INFLIGHT_TIMEOUT_MS,
              )
            }),
          ])
          writeCache(key, fresh)
          return { fresh, error: null }
        } catch (e) {
          return { fresh: null, error: e }
        } finally {
          if (timer) clearTimeout(timer)
          inFlight.delete(key)
        }
      })()
      inFlight.set(key, pending)
    }
    const { fresh, error: err } = await pending
    if (cancelledRef.current) return fresh
    if (err) {
      setError(err)
    } else {
      setData(fresh)
      setError(null)
    }
    setLoading(false)
    return fresh
  }, [key, enabled])

  // Mount / key change: fire a refetch if we don't have cache OR cache is stale
  useEffect(() => {
    if (!enabled) return
    const age = cacheAge(key)
    if (age === Infinity || age > staleAfterMs) {
      refetch()
    } else {
      // Fresh cache — no network needed
      setLoading(false)
    }
  }, [key, enabled, staleAfterMs, refetch])

  // Tab re-focus after ≥30s hidden: revalidate silently in background
  useEffect(() => {
    if (!enabled) return
    let hiddenAt = 0
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now()
      } else if (document.visibilityState === 'visible' && hiddenAt > 0) {
        if (Date.now() - hiddenAt >= 30_000) refetch()
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [enabled, refetch])

  return { data, loading, error, refetch }
}

/**
 * Evict a cache entry. Accepts an exact key OR a key prefix (trailing `*`).
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
