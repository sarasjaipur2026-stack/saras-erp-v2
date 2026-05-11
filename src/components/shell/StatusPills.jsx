/**
 * StatusPills — always-visible health indicators in the topbar's right zone.
 *
 * Each pill shows green / amber / red based on the underlying signal. Tooltips
 * (via title attr) explain the state. Pills hide when not relevant to the
 * current page (e.g. the print bridge pill only shows on /pos).
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.5
 */

import { useLocation } from 'react-router-dom'
import { useShellHealth } from '../../hooks/useShellHealth'
import { usePrintBridge } from '../../modules/pos/hooks/usePrintBridge'

export default function StatusPills() {
  const { connection, realtime } = useShellHealth()
  const location = useLocation()
  const onPos = location.pathname.startsWith('/pos')

  // Print-bridge pill only mounts when on /pos (so the 5-second polling
  // doesn't run on every page). The hook itself is no-op when unmounted.
  //
  // Hidden on phone (<sm) to keep the topbar uncluttered at 320px width.
  // Critical errors still surface via toasts; the pills are an
  // at-a-glance reassurance for desktop users.
  return (
    <div className="hidden sm:flex items-center gap-1.5">
      <Pill
        state={connection === 'online' ? 'green' : connection === 'reconnecting' ? 'amber' : 'red'}
        label="Net"
        title={
          connection === 'online' ? 'Online'
          : connection === 'reconnecting' ? 'Reconnecting…'
          : 'Offline — writes will queue'
        }
      />
      <Pill
        state={realtime === 'subscribed' ? 'green' : realtime === 'reconnecting' ? 'amber' : 'red'}
        label="Live"
        title={
          realtime === 'subscribed' ? 'Realtime updates active'
          : realtime === 'reconnecting' ? 'Realtime reconnecting…'
          : 'Realtime disconnected — refresh to resync'
        }
      />
      {onPos && <PrintBridgePill />}
    </div>
  )
}

function PrintBridgePill() {
  const { status } = usePrintBridge()
  const state = status === 'online' ? 'green' : status === 'offline' ? 'red' : 'gray'
  const title = (
    status === 'online' ? 'Thermal printer ready'
    : status === 'offline' ? 'Print bridge offline — bills will queue'
    : 'Checking print bridge…'
  )
  return <Pill state={state} label="Print" title={title} />
}

function Pill({ state, label, title }) {
  const cls = (
    state === 'green' ? 'bg-emerald-50 text-emerald-700'
    : state === 'amber' ? 'bg-amber-50 text-amber-700'
    : state === 'red' ? 'bg-red-50 text-red-700'
    : 'bg-slate-100 text-slate-500'
  )
  const dotCls = (
    state === 'green' ? 'bg-emerald-500'
    : state === 'amber' ? 'bg-amber-500'
    : state === 'red' ? 'bg-red-500'
    : 'bg-slate-400'
  )
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${cls}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
      {label}
    </span>
  )
}
