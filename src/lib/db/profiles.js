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
