import { supabase } from './supabase'

// ─── AUTH GATE ─────────────────────────────────────────────
// Single authoritative "is the JWT fresh right now?" check that every
// data-layer call awaits before firing. Eliminates the post-idle race
// between visibilitychange → refreshSession() and the user's first
// click → data query hitting a 401 with the old token.
//
// Usage:
//   await ensureFreshSession()   // blocks if a refresh is needed / in flight
//   await supabase.from(...).select(...)

// Consider the token stale if it expires within this many seconds.
// Tuned large enough (60s) to absorb Chrome background-tab timer throttling,
// small enough to avoid pointless refreshes.
const TOKEN_SKEW_SECS = 60

// Cached "known-fresh-until" timestamp (ms). Lets us skip a getSession()
// round-trip on every safe() call after the first.
let lastKnownFreshUntil = 0

// Coalesces concurrent refreshes — if 10 queries hit safe() at once,
// they share ONE refreshSession() call.
let inFlight = null

// Dev instrumentation — measured refresh durations for post-hoc debugging.
const devLog = (...args) => {
  if (import.meta.env.DEV) console.debug('[authGate]', ...args)
}

/**
 * Ensure the current Supabase access_token is not expired (and won't expire
 * in the next TOKEN_SKEW_SECS). Refreshes if needed. Safe to call liberally —
 * the "known-fresh-until" cache short-circuits almost all invocations.
 *
 * Returns a Promise that resolves when the client is guaranteed to have a
 * fresh token (or a best-effort refresh has been attempted).
 */
export const ensureFreshSession = async () => {
  // Fast path: we know we're fresh and the in-memory cache hasn't expired.
  if (Date.now() < lastKnownFreshUntil && !inFlight) return

  // A refresh is already in flight — piggyback on it.
  if (inFlight) return inFlight

  // Verify freshness against the session stored in localStorage. This is
  // synchronous I/O under the hood, so it's cheap (~1 ms).
  let session = null
  try {
    const { data } = await supabase.auth.getSession()
    session = data?.session ?? null
  } catch {
    session = null
  }

  if (session?.expires_at) {
    const expiresAtMs = session.expires_at * 1000
    const freshUntil = expiresAtMs - TOKEN_SKEW_SECS * 1000
    if (freshUntil > Date.now()) {
      lastKnownFreshUntil = freshUntil
      return
    }
  }

  // Stale (or no session). Trigger a refresh and cache the promise so any
  // other caller that arrives before it settles piggybacks on it.
  inFlight = (async () => {
    const t0 = performance.now()
    try {
      const { data, error } = await supabase.auth.refreshSession()
      if (error) {
        devLog('refreshSession error:', error.message)
      }
      const newSession = data?.session
      if (newSession?.expires_at) {
        lastKnownFreshUntil = newSession.expires_at * 1000 - TOKEN_SKEW_SECS * 1000
      } else {
        // No usable session — push the cache 30s forward to avoid a thundering
        // herd of refreshes if the refresh token itself is dead.
        lastKnownFreshUntil = Date.now() + 30_000
      }
    } catch (err) {
      devLog('refreshSession threw:', err?.message || err)
      lastKnownFreshUntil = Date.now() + 30_000
    } finally {
      devLog(`refreshSession took ${Math.round(performance.now() - t0)}ms`)
    }
  })().finally(() => { inFlight = null })

  return inFlight
}

/**
 * Force a refresh (regardless of current token freshness). Used by the
 * visibilitychange / focus / pagelifecycle handlers so returning from an
 * idle tab pre-warms the token BEFORE the user's first click.
 */
export const prewarmSession = () => {
  lastKnownFreshUntil = 0
  return ensureFreshSession()
}

/** Reset the in-memory cache on sign-out / sign-in so a stale value
 *  from a previous user doesn't bleed into the next session. */
export const resetAuthGate = () => {
  lastKnownFreshUntil = 0
  inFlight = null
}
