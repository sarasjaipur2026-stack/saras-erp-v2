/**
 * <OrderDetailV2> — the Orders Workspace detail page.
 *
 * Spec: docs/specs/2026-05-11-orders-workspace-design.md
 * Plan: docs/specs/2026-05-11-orders-workspace-plan.md §Phase 6
 *
 * Phase 6 ships the scaffold:
 *   - useOrderDetail hook (orders.get + realtime filtered by id)
 *   - sticky DetailHeader (order # · status · customer · total · actions)
 *   - DetailTabsRail in ShellShell navRail · 6 tabs with keyboard 1-6
 *   - OverviewTab content; other 5 tabs render <StubTab> placeholder
 *   - 404-style not-found state for bad IDs
 *   - Cmd/Ctrl+E shortcut → /orders/:id/edit (legacy OrderForm until Phase 9)
 *
 * The right-rail context slot stays null — Phase 8 fills it with the pinned
 * customer card + status-gated quick-action stack.
 */

import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import ShellShell from '../../components/shell/ShellShell'
import { Button } from '../../components/ui'
import { useToast } from '../../contexts/ToastContext'
import { useOrderDetail } from './hooks/useOrderDetail'
import DetailHeader from './panels/DetailHeader'
import DetailTabsRail from './panels/DetailTabsRail'
import OverviewTab from './tabs/OverviewTab'
import StubTab from './tabs/_StubTab'

const TAB_STUB_COPY = {
  production: 'Linked production jobs, machine assignment, and progress bars. Inline "+ New production job" creator.',
  dispatch:   'Linked deliveries, transporter assignment, dispatch dates. "+ Schedule dispatch" inline form.',
  invoice:    'Linked invoice(s), balance, and "Generate invoice" CTA. Click invoice → opens the invoice detail.',
  payments:   'Payments timeline + inline add-payment form. Settled balance + receipt links.',
  activity:   'Full activity_log feed with comment-box for free-text notes. Filter by event type.',
}

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
    production: order?.production_plans?.length, // join may not exist yet; safe null-undefined
    dispatch:   Array.isArray(order?.deliveries) ? order.deliveries.length : 0,
    invoice:    Array.isArray(order?.invoices)   ? order.invoices.length   : 0,
    payments:   Array.isArray(order?.payments)   ? order.payments.length   : 0,
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
              {tab === 'overview' && <OverviewTab order={order} summary={summary} />}
              {tab === 'production' && <StubTab label="Production" description={TAB_STUB_COPY.production} />}
              {tab === 'dispatch' && <StubTab label="Dispatch" description={TAB_STUB_COPY.dispatch} />}
              {tab === 'invoice' && <StubTab label="Invoice" description={TAB_STUB_COPY.invoice} />}
              {tab === 'payments' && <StubTab label="Payments" description={TAB_STUB_COPY.payments} />}
              {tab === 'activity' && <StubTab label="Activity" description={TAB_STUB_COPY.activity} />}
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
