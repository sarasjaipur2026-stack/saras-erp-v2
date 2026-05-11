/**
 * useRecentPages — auto-tracks the last N visited routes.
 *
 * Listens to react-router's useLocation and pushes each unique path into a
 * ring buffer kept in sessionStorage. The most recent page is at index 0.
 * Shown in the Sidebar's "Recent" section under "Pinned".
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §6.3
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 3
 *
 * Storage key: `saras_recent_pages:<user_id>` so different users on the
 * same device don't see each other's recent list.
 */

import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const MAX = 5

// Routes we don't want cluttering the recent list (transient screens).
const SKIP = new Set(['/', '/login', '/notifications'])

function storageKey(userId) {
  return `saras_recent_pages:${userId || 'anon'}`
}

function readBuffer(userId) {
  try {
    const raw = sessionStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : []
  } catch {
    return []
  }
}

function writeBuffer(userId, list) {
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(list))
  } catch {
    // sessionStorage full / disabled — silently drop
  }
}

/**
 * @returns {{ recent: Array<{ path: string, label: string }>, clear: () => void }}
 */
export function useRecentPages() {
  const { user } = useAuth()
  const location = useLocation()
  const [recent, setRecent] = useState(() => readBuffer(user?.id))

  useEffect(() => {
    if (!user?.id) return
    const path = location.pathname
    if (SKIP.has(path)) return

    const existing = readBuffer(user.id)
    // Move-to-front: dedup by path, prepend current.
    const without = existing.filter(e => e.path !== path)
    const label = labelForPath(path)
    const next = [{ path, label }, ...without].slice(0, MAX)
    writeBuffer(user.id, next)
    setRecent(next)
  }, [location.pathname, user?.id])

  const clear = useCallback(() => {
    if (!user?.id) return
    sessionStorage.removeItem(storageKey(user.id))
    setRecent([])
  }, [user?.id])

  return { recent, clear }
}

/**
 * Best-effort label generation from a path. Used when we don't have a NAV_ITEM
 * match — falls back to the last path segment, prettified.
 *
 * @param {string} path
 * @returns {string}
 */
function labelForPath(path) {
  if (!path || path === '/') return 'Dashboard'
  const segs = path.split('/').filter(Boolean)
  // /orders/abc → "Order detail" feels nicer than "Abc"
  if (segs[0] === 'orders' && segs[1] && segs[1] !== 'new') return 'Order detail'
  if (segs[0] === 'enquiries' && segs[1] && segs[1] !== 'new') return 'Enquiry detail'
  // Default — prettify last segment
  const last = segs[segs.length - 1] || segs[0] || ''
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
