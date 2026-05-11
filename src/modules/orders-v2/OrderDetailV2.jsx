/**
 * <OrderDetailV2> — the Orders Workspace detail page.
 *
 * Spec: docs/specs/2026-05-11-orders-workspace-design.md
 * Plan: docs/specs/2026-05-11-orders-workspace-plan.md §Phase 6 + §Phase 7
 *
 * Phase 6 shipped the scaffold + Overview tab.
 * Phase 7 fills in Dispatch + Payments with real content from the
 *   order's already-fetched joins (zero extra round-trips) and wires
 *   Production / Invoice / Activity to their respective modules. All
 *   six tabs become lazy chunks so the first paint stays fast.
 *
 * The right-rail context slot stays null — Phase 8 fills it with the pinned
 * customer card + status-gated quick-action stack.
 */

import { lazy, Suspense, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Loader2 } from 'lucide-react'
import ShellShell from '../../components/shell/ShellShell'
import { Button } from '../../components/ui'
import { useToast } from '../../contexts/ToastContext'
import { useOrderDetail } from './hooks/useOrderDetail'
import DetailHeader from './panels/DetailHeader'
import DetailTabsRail from './panels/DetailTabsRail'

// Each tab is its own lazy chunk so the initial detail-page paint loads
// just Overview. Switching tabs incurs a single chunk fetch (cached
// thereafter by the browser).
const OverviewTab   = lazy(() => import('./tabs/OverviewTab'))
const ProductionTab = lazy(() => import('./tabs/ProductionTab'))
const DispatchTab   = lazy(() => import('./tabs/DispatchTab'))
const InvoiceTab    = lazy(() => import('./tabs/InvoiceTab'))
const PaymentsTab   = lazy(() => import('./tabs/PaymentsTab'))
const ActivityTab   = lazy(() => import('./tabs/ActivityTab'))

export default function OrderDetailV2() {
  const navigate = useNavigate()
  const toast = useToast()
  const { id, order, summary, loading, error, refetch, tab, setTab } = useOrderDetail()

  // Keyboard: Cmd/Ctrl+E → edit. Skip when typing in inputs.
  useEffect(() => {
    if (!order) return
    const handler = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (e.key !== 'e' && e.key !== 'E') return
      const tgt = e.target
      if (tgt && typeof tgt.matches === 'function') {
        if (tgt.matches('input, textarea, [contenteditable], [contenteditable="true"]')) return
      }
      e.preventDefault()
      navigate(`/orders/${order.id}/edit`)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navigate, order])

  const handleDuplicate = useCallback(() => {
    if (!order) return
    navigate(`/orders/${order.id}/duplicate`)
  }, [navigate, order])

  const handlePrint = useCallback(() => {
    toast.info?.('Print queued (Phase 8 wires real PDF render)')
  }, [toast])

  // ─── Tab counts for the rail badges ───────────────────────
  const counts = {
    dispatch: Array.isArray(order?.deliveries) ? order.deliveries.length : 0,
    payments: Array.isArray(order?.payments)   ? order.payments.length   : 0,
  }

  // ─── 404 / error handling ─────────────────────────────────
  if (!loading && (error || !order) && id) {
    return (
      <ShellShell navRail={null} context={null}>
        <div className="p-6 max-w-md mx-auto mt-24 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle size={22} />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Order not found</h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            {error?.message || 'This order may have been deleted or you do not have access to it.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/orders')}>← Back to orders</Button>
            <Button onClick={refetch}>Retry</Button>
          </div>
        </div>
      </ShellShell>
    )
  }

  return (
    <ShellShell
      navRail={<DetailTabsRail tab={tab} setTab={setTab} counts={counts} />}
      context={null}
    >
      <div className="p-6 space-y-5">
        {loading && !order ? (
          <DetailSkeleton />
        ) : (
          <>
            <DetailHeader
              order={order}
              onPrint={handlePrint}
              onDuplicate={handleDuplicate}
            />

            <div role="tabpanel" aria-labelledby={`tab-${tab}`}>
              <Suspense fallback={<TabSkeleton />}>
                {tab === 'overview' && <OverviewTab order={order} summary={summary} />}
                {tab === 'production' && <ProductionTab order={order} />}
                {tab === 'dispatch' && <DispatchTab order={order} />}
                {tab === 'invoice' && <InvoiceTab order={order} />}
                {tab === 'payments' && <PaymentsTab order={order} summary={summary} />}
                {tab === 'activity' && <ActivityTab order={order} />}
              </Suspense>
            </div>
          </>
        )}
      </div>
    </ShellShell>
  )
}

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-64 rounded bg-slate-200" />
      <div className="h-4 w-40 rounded bg-slate-100" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-40 rounded-2xl bg-slate-100" />
        <div className="h-40 rounded-2xl bg-slate-100" />
      </div>
      <div className="h-24 rounded-2xl bg-slate-100" />
    </div>
  )
}

function TabSkeleton() {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-slate-400">
      <Loader2 size={14} className="animate-spin" />
      Loading tab…
    </div>
  )
}
