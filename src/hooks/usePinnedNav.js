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

  useEffect(() => {
    if (!user?.id) {
      setPinned([])
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    ;(async () => {
      const { data, error } = await getPreferences(user.id)
      if (!alive) return
      if (!error && Array.isArray(data?.preferences?.pinned_nav)) {
        setPinned(data.preferences.pinned_nav.slice(0, MAX_PINS))
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [user?.id])

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
  }, [user?.id, pinned])

  const unpin = useCallback(async (path) => {
    if (!user?.id) return
    const next = pinned.filter(p => p.path !== path)
    if (next.length === pinned.length) return
    setPinned(next)
    await mergePreferences(user.id, { pinned_nav: next })
  }, [user?.id, pinned])

  const togglePin = useCallback(async (item) => {
    if (isPinned(item.path)) {
      await unpin(item.path)
    } else {
      await pin(item)
    }
  }, [isPinned, pin, unpin])

  return { pinned, loading, isPinned, pin, unpin, togglePin }
}
