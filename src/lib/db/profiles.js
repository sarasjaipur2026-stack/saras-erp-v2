/**
 * Profile preferences DAL.
 *
 * `profiles.preferences` is a JSONB blob storing per-user UI state:
 *   {
 *     "pinned_nav": [{ "path": "/pos", "label": "POS" }, ...],
 *     // future flags extend the same blob
 *   }
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §6.2
 *
 * Implementation: read-modify-write client-side merge. The blob is small
 * (<2KB), one user editing at a time, no race risk in practice. If/when we
 * need true server-side merge semantics, swap in an RPC.
 */

import { supabase } from '../supabase'
import { safe } from './core'
import { upsertEntry, removeEntry, sanitiseList } from './_savedSearchOps'

/**
 * Fetch the preferences blob for a user.
 *
 * @param {string} userId
 * @returns {Promise<{ data: { preferences: object }|null, error: any }>}
 */
export async function getPreferences(userId) {
  return safe(() =>
    supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single(),
  )
}

/**
 * Read-modify-write merge of the preferences blob.
 *
 * @param {string} userId
 * @param {Record<string, unknown>} patch
 * @returns {Promise<{ data: object|null, error: any }>}
 */
export async function mergePreferences(userId, patch) {
  return safe(async () => {
    const current = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', userId)
      .single()
    if (current.error) return current
    const merged = { ...(current.data?.preferences || {}), ...patch }
    return supabase
      .from('profiles')
      .update({ preferences: merged })
      .eq('id', userId)
      .select('preferences')
      .single()
  })
}

// ─── saved-search helpers (per-module navRail) ───────────────
//
// Stored at the flat top-level key `<module>_saved_searches` on
// `profiles.preferences`. Convention documented in docs/MIGRATING_TO_SHELL.md.
//
// All three return `{ data, error }` so callers can pattern-match like every
// other DAL helper. Pure list ops live in `./_savedSearchOps` and are unit
// tested in isolation.

function _key(moduleKey) {
  return `${moduleKey}_saved_searches`
}

/**
 * Read the saved-search list for a module. Returns sanitised array — bad
 * entries persisted by an older client version are silently dropped.
 *
 * @param {string} userId
 * @param {string} moduleKey  e.g. 'orders', 'production'
 * @returns {Promise<{ data: Array<{name,params}>, error: any }>}
 */
export async function getSavedSearches(userId, moduleKey) {
  if (!userId || !moduleKey) {
    return { data: [], error: new Error('getSavedSearches: userId + moduleKey required') }
  }
  const { data, error } = await getPreferences(userId)
  if (error) return { data: [], error }
  const raw = data?.preferences?.[_key(moduleKey)]
  return { data: sanitiseList(raw), error: null }
}

/**
 * Add or replace a saved search by name. Returns the updated list.
 *
 * @param {string} userId
 * @param {string} moduleKey
 * @param {{ name: string, params?: Record<string, string|number|boolean> }} entry
 * @returns {Promise<{ data: Array<{name,params}>|null, error: any }>}
 */
export async function saveSearch(userId, moduleKey, entry) {
  if (!userId || !moduleKey) {
    return { data: null, error: new Error('saveSearch: userId + moduleKey required') }
  }
  const { data: current, error: readErr } = await getSavedSearches(userId, moduleKey)
  if (readErr) return { data: null, error: readErr }
  const next = upsertEntry(current, entry)
  if (next.length === current.length && next.every((e, i) => e === current[i])) {
    // Invalid entry rejected by upsertEntry — surface as a soft error so
    // callers can show a "saved-search name required" toast.
    return { data: current, error: new Error('saveSearch: invalid entry') }
  }
  const { error: writeErr } = await mergePreferences(userId, { [_key(moduleKey)]: next })
  if (writeErr) return { data: null, error: writeErr }
  return { data: next, error: null }
}

/**
 * Remove a saved search by name. Returns the updated list.
 *
 * @param {string} userId
 * @param {string} moduleKey
 * @param {string} name
 * @returns {Promise<{ data: Array<{name,params}>|null, error: any }>}
 */
export async function removeSavedSearch(userId, moduleKey, name) {
  if (!userId || !moduleKey || !name) {
    return { data: null, error: new Error('removeSavedSearch: userId + moduleKey + name required') }
  }
  const { data: current, error: readErr } = await getSavedSearches(userId, moduleKey)
  if (readErr) return { data: null, error: readErr }
  const next = removeEntry(current, name)
  if (next.length === current.length) {
    // No-op — name not present. Still write nothing; just return current list.
    return { data: current, error: null }
  }
  const { error: writeErr } = await mergePreferences(userId, { [_key(moduleKey)]: next })
  if (writeErr) return { data: null, error: writeErr }
  return { data: next, error: null }
}
