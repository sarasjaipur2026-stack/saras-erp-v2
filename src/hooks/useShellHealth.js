/**
 * useShellHealth — consolidates the signals that drive the topbar status pills.
 *
 * Phase 2 ships this as a minimal observer of `navigator.onLine` and a stub
 * 'subscribed' realtime state. Phase 8 wires real Supabase realtime channel
 * state callbacks + auth refresh failure tracking.
 *
 * Returns:
 *   {
 *     connection: 'online' | 'reconnecting' | 'offline',
 *     realtime:   'subscribed' | 'reconnecting' | 'disconnected',
 *   }
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.5
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 2 (stub) → §Phase 8 (wire real signals)
 */

import { useEffect, useState } from 'react'

export function useShellHealth() {
  const [connection, setConnection] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
  )

  useEffect(() => {
    const onOnline = () => setConnection('online')
    const onOffline = () => setConnection('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Realtime stub — Phase 8 replaces with channel callback subscriptions.
  const realtime = connection === 'offline' ? 'disconnected' : 'subscribed'

  return { connection, realtime }
}
