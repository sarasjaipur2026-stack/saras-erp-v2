/**
 * usePrintBridge — checks the local thermal print bridge health.
 *
 * Bridge is a Node helper running at localhost:9100 on the counter PC.
 * It polls Supabase for pending pos_print_jobs and writes ESC/POS to
 * the USB thermal printer. See tools/print-bridge/README.md.
 *
 * This hook just pings GET /health every 30s and exposes status for
 * the topbar pill (online/offline).
 */

import { useEffect, useState } from 'react'

const ENDPOINT = 'http://localhost:9100/health'
const POLL_MS = 30_000

export function usePrintBridge() {
  const [status, setStatus] = useState('unknown') // 'online' | 'offline' | 'unknown'
  const [lastChecked, setLastChecked] = useState(null)

  useEffect(() => {
    let alive = true
    let timer

    async function check() {
      try {
        const ctrl = new AbortController()
        const t = setTimeout(() => ctrl.abort(), 1500)
        const res = await fetch(ENDPOINT, { signal: ctrl.signal, mode: 'cors' })
        clearTimeout(t)
        if (!alive) return
        setStatus(res.ok ? 'online' : 'offline')
      } catch {
        if (!alive) return
        setStatus('offline')
      }
      if (!alive) return
      setLastChecked(Date.now())
      timer = setTimeout(check, POLL_MS)
    }

    check()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [])

  return { status, lastChecked }
}
