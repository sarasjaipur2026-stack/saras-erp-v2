/**
 * useShellHealth — consolidates the signals that drive the topbar status pills.
 *
 * Returns:
 *   {
 *     connection: 'online' | 'reconnecting' | 'offline',
 *     realtime:   'subscribed' | 'reconnecting' | 'disconnected',
 *   }
 *
 * Signals:
 *  - connection: navigator.onLine listener + Supabase auth state changes.
 *    Goes amber when an auth refresh kicks off, red on outright offline.
 *  - realtime: subscribes to a tiny dedicated channel (`shell:health`) and
 *    tracks its lifecycle. Goes amber on CHANNEL_ERROR / TIMED_OUT,
 *    red on CLOSED, green on SUBSCRIBED.
 *
 * Print-bridge and notifications pills are handled separately by their own
 * hooks (usePrintBridge / Topbar's notifDb fetcher) — they don't go through
 * useShellHealth because they're scoped (print-bridge only on /pos,
 * notifications already drawn as its own bell icon).
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.5
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 2 (stub) → §Phase 8 (real signals)
 */

import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function useShellHealth() {
  const [connection, setConnection] = useState(
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online',
  )
  const [realtime, setRealtime] = useState('reconnecting')
  const channelRef = useRef(null)
  const refreshDebounceRef = useRef(null)

  // ----- Network / connection state -----
  useEffect(() => {
    const onOnline = () => setConnection('online')
    const onOffline = () => setConnection('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    // Supabase auth state changes — a TOKEN_REFRESHED event implies a brief
    // moment where outgoing requests would queue against the old JWT. Flip to
    // 'reconnecting' for ~2s then back to 'online'.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') {
        setConnection((c) => (c === 'offline' ? c : 'reconnecting'))
        if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current)
        refreshDebounceRef.current = setTimeout(() => {
          setConnection((c) => (c === 'reconnecting' ? 'online' : c))
        }, 2000)
      }
      if (event === 'SIGNED_OUT') {
        setConnection('offline')
      }
    })

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      if (refreshDebounceRef.current) clearTimeout(refreshDebounceRef.current)
      sub?.subscription?.unsubscribe?.()
    }
  }, [])

  // ----- Realtime channel state -----
  // Maintain a tiny health channel for the lifetime of the shell. It carries
  // no payload — its only job is to surface the realtime connection state.
  useEffect(() => {
    const channel = supabase.channel('shell:health')
    channelRef.current = channel

    channel.subscribe((status) => {
      // Supabase RealtimeChannel status values:
      // 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
      if (status === 'SUBSCRIBED') setRealtime('subscribed')
      else if (status === 'CLOSED') setRealtime('disconnected')
      else setRealtime('reconnecting')
    })

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [])

  return { connection, realtime }
}
