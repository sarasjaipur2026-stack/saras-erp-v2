// ─── OFFLINE WRITE QUEUE ─────────────────────────────────────
// Simple persistent queue for writes that failed due to connectivity / timeout.
// Stored in localStorage so a page refresh / browser close doesn't lose them.
// When the browser comes back online (or the user manually flushes), the queue
// replays each item in FIFO order against the supabase client.
//
// This is intentionally minimal: it handles direct `supabase.from(table).insert(row)`
// style writes. Complex multi-step mutations (atomic RPCs, multi-row transactions)
// should not use this queue — they need per-domain recovery logic.
//
// Usage:
//   import { queueWrite, flushQueue, useOnlineFlush } from './offlineQueue'
//   try { ... } catch (err) {
//     if (isOffline(err)) queueWrite({ table: 'payments', row: { ... } })
//   }

import { useEffect, useState } from 'react'
import { supabase } from './supabase'

const STORAGE_KEY = 'saras.offlineQueue.v1'
const MAX_QUEUE = 200

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(items) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-MAX_QUEUE)))
  } catch {
    // Quota exceeded — drop the oldest half and retry once. If still failing,
    // give up silently; the user will see the write as "pending" and can retry.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(-Math.floor(MAX_QUEUE / 2))))
    } catch { /* ignore */ }
  }
}

let subscribers = new Set()
function notify() {
  const items = load()
  for (const cb of subscribers) { try { cb(items) } catch { /* ignore */ } }
}

/**
 * Queue a write. Returns the queued item's id so callers can reference it.
 */
export function queueWrite({ table, row, op = 'insert', where, label }) {
  if (!table || !row) return null
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const items = load()
  items.push({ id, table, row, op, where: where || null, label: label || table, ts: Date.now(), attempts: 0, lastError: null })
  save(items)
  notify()
  return id
}

export function getQueue() { return load() }
export function queueSize() { return load().length }

export function removeFromQueue(id) {
  const items = load().filter(it => it.id !== id)
  save(items)
  notify()
}

export function clearQueue() {
  save([])
  notify()
}

/**
 * Heuristic: is this error likely offline/connectivity vs a real server reject?
 * True for network errors, timeouts, 5xx, and Supabase "Failed to fetch".
 */
export function isOfflineError(err) {
  if (!err) return false
  if (typeof err === 'object') {
    const msg = String(err.message || err || '').toLowerCase()
    if (/network|fetch|timed out|timeout|failed to fetch|offline|connection/.test(msg)) return true
    // PostgREST 5xx / 0
    if (err.status && (err.status === 0 || err.status >= 500)) return true
  }
  return false
}

/**
 * Replay the queue. Returns { succeeded, failed, remaining }.
 */
export async function flushQueue() {
  const items = load()
  if (!items.length) return { succeeded: 0, failed: 0, remaining: 0 }
  const stillPending = []
  let succeeded = 0
  let failed = 0
  for (const item of items) {
    try {
      let query = supabase.from(item.table)
      let result
      if (item.op === 'insert') {
        result = await query.insert(item.row).select()
      } else if (item.op === 'update' && item.where?.id) {
        result = await query.update(item.row).eq('id', item.where.id).select()
      } else if (item.op === 'delete' && item.where?.id) {
        result = await query.delete().eq('id', item.where.id)
      } else {
        // Unsupported — drop it to avoid infinite retries
        failed += 1
        continue
      }
      if (result?.error) throw result.error
      succeeded += 1
    } catch (err) {
      const next = { ...item, attempts: (item.attempts || 0) + 1, lastError: String(err?.message || err) }
      // Drop an item after 5 attempts so a permanently-rejecting row doesn't clog the queue forever
      if (next.attempts < 5) stillPending.push(next)
      else failed += 1
    }
  }
  save(stillPending)
  notify()
  return { succeeded, failed, remaining: stillPending.length }
}

/**
 * React hook — subscribes to queue changes + auto-flushes when the browser
 * comes back online. Returns the current queue snapshot.
 */
export function useOfflineQueue() {
  const [items, setItems] = useState(load)
  useEffect(() => {
    subscribers.add(setItems)
    return () => { subscribers.delete(setItems) }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const onOnline = () => { flushQueue().catch(() => {}) }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [])

  return items
}
