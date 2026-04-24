import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

// Module-level echo map: lets callers record a self-write so the immediate
// realtime echo doesn't surface a "someone else changed X" toast. Callers
// invoke markSelfWrite(table) right before a mutation — any realtime event
// for that table within `ECHO_WINDOW_MS` after that timestamp is treated as
// self-echo and suppressed from toast notification.
const ECHO_WINDOW_MS = 1200
const selfWrites = new Map()

export function markSelfWrite(table) {
  if (!table) return
  selfWrites.set(table, Date.now())
}

function isEcho(table) {
  const ts = selfWrites.get(table)
  if (!ts) return false
  return Date.now() - ts < ECHO_WINDOW_MS
}

/**
 * Subscribe to realtime changes on a Postgres table and trigger `onChange`
 * when any INSERT / UPDATE / DELETE lands.
 *
 * - `onChange` is called with the payload so callers can do selective merge
 *   (ideal) or a full refetch (simple).
 * - Debounce is built-in so a burst of payloads collapses into one refetch.
 * - Auto-reconnects: Supabase client handles retry; we just re-subscribe on
 *   `enabled` flip or deps change.
 *
 * Usage:
 *   useRealtimeTable('orders', () => refetch())
 *   useRealtimeTable('orders', (p) => merge(p), { event: 'UPDATE' })
 */
export function useRealtimeTable(table, onChange, options = {}) {
  const {
    event = '*',           // '*', 'INSERT', 'UPDATE', 'DELETE'
    schema = 'public',
    filter,                // e.g. 'order_id=eq.abc-123'
    debounceMs = 250,
    enabled = true,
  } = options

  // Keep the latest callback in a ref so we don't re-subscribe on every render
  const cbRef = useRef(onChange)
  useEffect(() => { cbRef.current = onChange }, [onChange])

  useEffect(() => {
    if (!enabled || !table) return

    let timer = null
    let lastPayload = null

    const handler = (payload) => {
      lastPayload = payload
      // Annotate payload with echo flag so callers can short-circuit
      // toasts / merge-into-own-changes logic without duplicating timing.
      if (payload && typeof payload === 'object') {
        payload.isEcho = isEcho(table)
      }
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        try { cbRef.current?.(lastPayload) } catch (e) {
          if (import.meta.env.DEV) console.error('[useRealtimeTable]', table, e)
        }
      }, debounceMs)
    }

    const channelName = `rt:${schema}:${table}:${filter || 'all'}:${Date.now()}`
    const postgresChanges = { event, schema, table }
    if (filter) postgresChanges.filter = filter

    const channel = supabase
      .channel(channelName)
      .on('postgres_changes', postgresChanges, handler)
      .subscribe((status, err) => {
        if (import.meta.env.DEV && (status === 'CHANNEL_ERROR' || err)) {
          console.warn('[useRealtimeTable] channel status', table, status, err)
        }
      })

    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [table, event, schema, filter, debounceMs, enabled])
}
