/**
 * <OrdersV2Page> — the Orders Workspace list page.
 *
 * Spec: docs/specs/2026-05-11-orders-workspace-design.md
 * Plan: docs/specs/2026-05-11-orders-workspace-plan.md §Phase 2
 *
 * Phase 2 deliverable: skeleton that renders the orders list inside
 * <ShellShell> with empty rails. Phase 3 fills navRail with filter chips,
 * Phase 5 fills context with mini-summary + customer card + activity, Phase 4
 * is the route swap that makes this page live at `/orders`.
 *
 * The hook (`useOrdersList`) owns:
 *   - URL filter state (?status=…&date=…&q=…&page=…)
 *   - SWR cache one-entry-per-filter-combo
 *   - Realtime auto-refetch on orders table change
 *   - Multi-status client-side narrowing
 *
 * This component owns:
 *   - The ShellShell scaffold
 *   - The header (title · count · primary action)
 *   - Mounting <DataTable> with the centralised column defs
 *   - Server-side pagination prev/next (driven by `filters.page` + setFilter)
 *   - Selection state for the future right-context summary card
 *
 * NOT yet here (deferred per plan):
 *   - navRail filter chips        → Phase 3
 *   - context summary stack       → Phase 5
 *   - bulk-select / actions menu  → Phase 5
 *   - column sort                 → Phase 5+ (DataTable doesn't support yet)
 *   - view-mode toggles           → Phase 5
 *   - quick actions (status-gated) → Phase 8 (detail page)
 */

import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import ShellShell from '../../components/shell/ShellShell'
import { Button, DataTable } from '../../components/ui'
import { useOrdersList } from './hooks/useOrdersList'
import { buildOrdersColumns } from './panels/_OrdersTableColumns'

export default function OrdersV2Page() {
  const navigate = useNavigate()
  const { filters, rows, count, loading, setFilter } = useOrdersList()

  // Selection state — read by the right-context summary card (Phase 5).
  // Clicking a row both updates this AND navigates to the detail route, so
  // Phase 4's route swap is a behavioural drop-in for legacy OrdersPage.
  const [selectedId, setSelectedId] = useState(null)

  const handleRowClick = useCallback((row) => {
    setSelectedId(row.id)
    navigate(`/orders/${row.id}`)
  }, [navigate])

  // Pagination derived from server-side `count`. The hook gives us one page
  // worth of rows at filters.pageSize.
  const pageSize = filters.pageSize || 50
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const page = filters.page || 0

  const goToPage = useCallback((next) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, next))
    setFilter({ page: clamped })
  }, [totalPages, setFilter])

  // Use the static columns. Phase 5 will swap to a viewMode-aware factory.
  const columns = buildOrdersColumns()

  return (
    <ShellShell navRail={null} context={null}>
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
            <span className="text-sm text-slate-500" data-testid="orders-count">
              {count === 0 ? '0 orders' : `${count.toLocaleString('en-IN')} ${count === 1 ? 'order' : 'orders'}`}
            </span>
          </div>
          <Button onClick={() => navigate('/orders/new')}>
            <Plus size={16} /> New Order
          </Button>
        </div>

        {/* Selection echo — invisible until Phase 5 wires the context card.
            Useful in dev to confirm selection state propagates. */}
        {import.meta.env.DEV && selectedId && (
          <div className="text-[11px] text-slate-400">selectedId: {selectedId}</div>
        )}

        {/* Data table */}
        <DataTable
          columns={columns}
          data={rows}
          onRowClick={handleRowClick}
          loading={loading && rows.length === 0}
          emptyTitle={
            filters.status === 'all' && !filters.q && filters.date === 'all'
              ? 'No orders yet'
              : 'No orders match these filters'
          }
          // pageSize matches the server-side page so DataTable's internal
          // pagination never kicks in — we drive pages via setFilter below.
          pageSize={Math.max(pageSize, rows.length || 1)}
        />

        {/* Server-side pagination */}
        {count > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <div className="text-slate-500">
              {page * pageSize + 1}–{Math.min((page + 1) * pageSize, count)} of {count.toLocaleString('en-IN')}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => goToPage(0)}
                className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
                aria-label="First page"
              >
                «
              </button>
              <button
                type="button"
                disabled={page === 0}
                onClick={() => goToPage(page - 1)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
                aria-label="Previous page"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="px-2 text-slate-500" data-testid="orders-page-label">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => goToPage(page + 1)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
                aria-label="Next page"
              >
                Next <ChevronRight size={14} />
              </button>
              <button
                type="button"
                disabled={page + 1 >= totalPages}
                onClick={() => goToPage(totalPages - 1)}
                className="px-2 py-1 rounded-lg border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 text-slate-600"
                aria-label="Last page"
              >
                »
              </button>
            </div>
          </div>
        )}
      </div>
    </ShellShell>
  )
}
