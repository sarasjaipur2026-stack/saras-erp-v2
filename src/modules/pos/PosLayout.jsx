/**
 * PosLayout — full-screen register shell.
 * No Topbar, no Sidebar. Esc returns to /dashboard for non-cashier roles.
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §4.1
 */

import { useEffect } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'

export default function PosLayout() {
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e) => {
      // Esc → exit POS
      if (e.key === 'Escape' && !e.target.matches?.('input, textarea, select')) {
        navigate('/dashboard')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  return (
    <div className="fixed inset-0 bg-slate-50 overflow-hidden flex flex-col">
      <Outlet />
    </div>
  )
}
