/**
 * Pure read-modify-write operators for saved searches.
 *
 * Lives separately from profiles.js so the list-mutation logic (dedup, cap,
 * normalisation) is testable under `node --test` without mocking Supabase.
 *
 * profiles.js imports these and wraps them with the actual `mergePreferences`
 * RMW round-trip.
 */

export const SAVED_SEARCH_CAP = 16
const MAX_NAME_LEN = 48

/**
 * Normalise an entry so we never persist garbage. Returns null if invalid.
 *
 * @param {*} entry
 * @returns {{ name: string, params: Record<string,string> } | null}
 */
export function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return null
  const rawName = typeof entry.name === 'string' ? entry.name.trim() : ''
  if (!rawName) return null
  const name = rawName.slice(0, MAX_NAME_LEN)

  const params = {}
  if (entry.params && typeof entry.params === 'object') {
    for (const [k, v] of Object.entries(entry.params)) {
      if (typeof k !== 'string' || !k) continue
      // Only persist primitive scalar params — URLs round-trip strings only.
      if (v == null) continue
      if (typeof v === 'string') params[k] = v
      else if (typeof v === 'number' || typeof v === 'boolean') params[k] = String(v)
    }
  }
  return { name, params }
}

/**
 * Insert-or-replace `entry` in the list (matched by name). Enforces the cap
 * by dropping the OLDEST entries first.
 *
 * @param {Array<{name,params}> | undefined | null} list
 * @param {{ name: string, params?: Record<string,string> }} entry
 * @param {number} [cap]
 * @returns {Array<{name,params}>}
 */
export function upsertEntry(list, entry, cap = SAVED_SEARCH_CAP) {
  const normalised = normalizeEntry(entry)
  if (!normalised) return Array.isArray(list) ? [...list] : []
  const base = Array.isArray(list) ? list : []
  const filtered = base.filter((e) => e?.name !== normalised.name)
  filtered.push(normalised)
  if (filtered.length <= cap) return filtered
  return filtered.slice(filtered.length - cap)
}

/**
 * Remove an entry by name. No-op if name not present.
 *
 * @param {Array<{name,params}> | undefined | null} list
 * @param {string} name
 * @returns {Array<{name,params}>}
 */
export function removeEntry(list, name) {
  if (!Array.isArray(list)) return []
  if (typeof name !== 'string' || !name.trim()) return [...list]
  const trimmed = name.trim()
  return list.filter((e) => e?.name !== trimmed)
}

/**
 * Return only valid entries from a (possibly garbage) list. Used when reading
 * back from the preferences blob — drops anything that fails normalisation.
 *
 * @param {*} list
 * @returns {Array<{name,params}>}
 */
export function sanitiseList(list) {
  if (!Array.isArray(list)) return []
  const out = []
  for (const e of list) {
    const n = normalizeEntry(e)
    if (n) out.push(n)
  }
  return out
}
