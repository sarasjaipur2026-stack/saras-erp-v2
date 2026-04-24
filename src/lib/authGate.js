import { supabase } from './supabase'

// ─── AUTH GATE ───────────────────────────────────────────────
// Re-applying the fix from commit `0c7d185`.
//
// Problem this solves:
//   After idle, two refreshes would fire in parallel:
//     1. AuthContext's visibilitychange handler calls supabase.auth.refreshSession()
//     2. A data call fires with stale JWT → gets 401 → retries via refreshSession()
//   Two parallel refreshes + two queries = ~1.5-2.5s of wasted time per click.
//
// Fix:
//   - Single module-level `ensureFreshSession()` promise.
//   - Checks a cached `lastKnownFreshUntil` timestamp (μs on the warm path).
//   - When stale, ALL concurrent callers coalesce onto the same refresh promise.
//   - safe() awaits this BEFORE any query fires.
//   - AuthContext visibilitychange calls the same function to pre-warm.
//
// Contract:
//   - Warm path (token still fresh): zero overhead.
//   - Cold path (token stale or missing): exactly 1 refresh round-trip,
//     all queries wait for it, zero 401 retries needed.

// Supabase access tokens are 1-hour JWTs. Refresh a bit before expiry so the
// window doesn't open under us on a slow network. 55 min = 5 min safety buffer.
const TOKEN_LIFETIME_MS = 60 * 60 * 1000
const SAFETY_MARGIN_MS = 5 * 60 * 1000

let lastKnownFreshUntil = 0
let inFlight = null

function logIfDev(...args) {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
     
    console.log('[authGate]', ...args)
  }
}

/**
 * Compute how long a newly-returned session token is valid for.
 * `expires_at` is epoch seconds, `expires_in` is seconds-from-now.
 */
function freshUntilFromSession(session) {
  if (!session) return 0
  if (session.expires_at) return session.expires_at * 1000 - SAFETY_MARGIN_MS
  if (session.expires_in) return Date.now() + session.expires_in * 1000 - SAFETY_MARGIN_MS
  return Date.now() + TOKEN_LIFETIME_MS - SAFETY_MARGIN_MS
}

async function doRefresh() {
  const start = typeof performance !== 'undefined' ? performance.now() : Date.now()
  try {
    // Prefer `getSession()` first — if a valid session is already in memory
    // Supabase returns it without a network call. Only refresh when actually stale.
    const { data: sessionData } = await supabase.auth.getSession()
    const session = sessionData?.session
    if (session && freshUntilFromSession(session) > Date.now()) {
      lastKnownFreshUntil = freshUntilFromSession(session)
      const dur = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start
      logIfDev('getSession warm hit', `${dur.toFixed(0)}ms`)
      return session
    }
    const { data, error } = await supabase.auth.refreshSession()
    if (error) {
      // Refresh failure — sign-out is handled by AuthContext via onAuthStateChange.
      // We return null so callers can proceed with whatever anon access RLS allows.
      lastKnownFreshUntil = 0
      logIfDev('refreshSession FAILED', error.message)
      return null
    }
    const fresh = data?.session
    lastKnownFreshUntil = freshUntilFromSession(fresh)
    const dur = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - start
    logIfDev('refreshSession took', `${dur.toFixed(0)}ms`)
    return fresh
  } catch (e) {
    lastKnownFreshUntil = 0
    logIfDev('refreshSession threw', e?.message || String(e))
    return null
  }
}

/**
 * The one function every DB call should await before firing a query.
 * Safe to call from anywhere, as often as you like — it's ~μs on the warm path.
 *
 * Concurrent calls during a cold path coalesce onto the same promise so the
 * refresh endpoint is hit exactly once no matter how many pages mount at once.
 */
export async function ensureFreshSession() {
  // Warm path: last known token is still fresh. No work, no network.
  if (lastKnownFreshUntil > Date.now()) return
  // Cold path: coalesce with any in-flight refresh.
  if (!inFlight) {
    inFlight = doRefresh().finally(() => {
      inFlight = null
    })
  }
  await inFlight
}

/**
 * Pre-warm on tab resume / focus / login. Doesn't throw, doesn't await.
 * AuthContext calls this from its visibilitychange / focus handlers so the
 * refresh is already in-flight before the user clicks anything.
 */
export function prewarmSession() {
  if (lastKnownFreshUntil > Date.now()) return
  ensureFreshSession().catch(() => { /* non-critical */ })
}

/**
 * Called by AuthContext when supabase.auth.onAuthStateChange reports a new
 * session (sign-in, token-refresh event). Lets us update lastKnownFreshUntil
 * without forcing another round-trip.
 */
export function markSessionFresh(session) {
  if (session) lastKnownFreshUntil = freshUntilFromSession(session)
  else lastKnownFreshUntil = 0
}

/** Testing / debug only */
export function __debugAuthGate() {
  return { lastKnownFreshUntil, hasInFlight: !!inFlight, nowMs: Date.now() }
}
