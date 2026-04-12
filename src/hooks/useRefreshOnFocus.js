import { useEffect, useRef } from 'react'

/**
 * Calls `onRefresh` when the browser tab regains visibility after being
 * hidden for longer than `staleAfterMs` (default 5 minutes).
 *
 * This prevents "failed to load" errors when the ERP is left open in a
 * background tab and the user switches back after the auth token or
 * connection has gone stale.
 */
export function useRefreshOnFocus(onRefresh, staleAfterMs = 5 * 60 * 1000) {
  const lastHidden = useRef(0)

  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        lastHidden.current = Date.now()
      } else if (document.visibilityState === 'visible') {
        const idle = Date.now() - lastHidden.current
        if (lastHidden.current > 0 && idle > staleAfterMs) {
          onRefresh()
        }
      }
    }
    document.addEventListener('visibilitychange', handler)
    return () => document.removeEventListener('visibilitychange', handler)
  }, [onRefresh, staleAfterMs])
}
