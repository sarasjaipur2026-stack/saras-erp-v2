/**
 * usePinnedNav — manages the user's pinned nav items.
 *
 * Reads/writes `profiles.preferences.pinned_nav` JSONB. Items are
 * `{ path, label }` objects; users add via right-click context menu in
 * the sidebar (Phase 3+), remove the same way.
 *
 * Cached in component state; on mount, hydrates from DB; on every mutation,
 * optimistically updates state then persists via mergePreferences (read-
 * modify-write).
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §6.2
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 3
 */

import { useEffect, useState, useCallback } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { getPreferences, mergePreferences } from '../lib/db/profiles'

const MAX_PINS = 8

export function usePinnedNav() {
  const { user } = useAuth()
  const [pinned, setPinned] = useState([])
  const [loading, setLoading] = useState(true)

  // Hydrate from DB on user change. setState happens INSIDE the async
  // `.then()` callback (a microtask boundary past the effect body) so the
  // react-hooks/set-state-in-effect rule passes.
  useEffect(() => {
    if (!user?.id) {
      // No user → reset via a queued microtask so we don't synchronously
      // setState in the effect body.
      Promise.resolve().then(() => {
        setPinned([])
        setLoading(false)
      })
      return
    }
    let alive = true
    getPreferences(user.id).then(({ data, error }) => {
      if (!alive) return
      if (!error && Array.isArray(data?.preferences?.pinned_nav)) {
        setPinned(data.preferences.pinned_nav.slice(0, MAX_PINS))
      }
      setLoading(false)
    })
    return () => { alive = false }
  }, [user])

  const isPinned = useCallback(
    (path) => pinned.some(p => p.path === path),
    [pinned],
  )

  const pin = useCallback(async (item) => {
    if (!user?.id || !item?.path) return
    if (pinned.some(p => p.path === item.path)) return // already pinned
    if (pinned.length >= MAX_PINS) return // cap
    const next = [...pinned, { path: item.path, label: item.label || item.path }]
    setPinned(next)
    await mergePreferences(user.id, { pinned_nav: next })
  }, [user, pinned])

  const unpin = useCallback(async (path) => {
    if (!user?.id) return
    const next = pinned.filter(p => p.path !== path)
    if (next.length === pinned.length) return
    setPinned(next)
    await mergePreferences(user.id, { pinned_nav: next })
  }, [user, pinned])

  const togglePin = useCallback(async (item) => {
    if (isPinned(item.path)) {
      await unpin(item.path)
    } else {
      await pin(item)
    }
  }, [isPinned, pin, unpin])

  return { pinned, loading, isPinned, pin, unpin, togglePin }
}
