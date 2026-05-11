/**
 * <OrdersV2Page> — the Orders Workspace list page.
 *
 * Spec: docs/specs/2026-05-11-orders-workspace-design.md
 * Plan: docs/specs/2026-05-11-orders-workspace-plan.md
 *
 * The hook (`useOrdersList`) owns:
 *   - URL filter state (?status=…&date=…&q=…&page=…)
 *   - SWR cache one-entry-per-filter-combo
 *   - Realtime auto-refetch on orders table change
 *   - Multi-status client-side narrowing
 *
 * This component owns:
 *   - The ShellShell scaffold (navRail · centre · context)
 *   - The header (title · count · primary action)
 *   - Mounting <DataTable> with the centralised column defs
 *   - Server-side pagination prev/next
 *   - `cursorId` — the highlighted row whose summary the right context shows
 *   - `selectedIds` — bulk-select Set; when non-empty, context switches to
 *     <BulkActionsCard> until the user clears.
 *
 * Click semantics (Phase 5):
 *   - Single click sets cursorId (right-context populates; user stays on list).
 *   - Re-clicking the cursor row clears it (toggle off).
 *   - Open-icon button on each row's right edge navigates to /orders/:id.
 *   - The MiniSummary card's "Open" button also navigates.
 *
 * NOT yet here (deferred per plan):
 *   - column sort                  → Phase 5+ (DataTable doesn't support yet)
 *   - status-gated quick actions   → Phase 8 (detail page)
 *   - server-side bulk mutations   → Phase 8 (toasts "Coming soon" for now)
 */

import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ChevronLeft, ChevronRight } from 'lucide-react'
import ShellShell from '../../components/shell/ShellShell'
import { Button, DataTable } from '../../components/ui'
import { useToast } from '../../contexts/ToastContext'
import { useOrdersList } from './hooks/useOrdersList'
import { buildOrdersColumns } from './panels/_OrdersTableColumns'
import OrdersNavRail from './panels/OrdersNavRail'
import OrdersListContext from './panels/OrdersListContext'

export default function OrdersV2Page() {
  const navigate = useNavigate()
  const toast = useToast()
  const { filters, rows, count, loading, setFilter } = useOrdersList()

  // ─── State owned by the page ───────────────────────────────
  // cursorId: the currently-highlighted row whose summary the right context
  // shows. Distinct from selectedIds (the bulk-select Set).
  const [cursorId, setCursorId] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())

  // ─── Derived state ────────────────────────────────────────
  const cursorRow = useMemo(
    () => (cursorId ? rows.find((r) => r.id === cursorId) || null : null),
    [cursorId, rows],
  )

  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id))

  // ─── Pagination ───────────────────────────────────────────
  const pageSize = filters.pageSize || 50
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const page = filters.page || 0

  const goToPage = useCallback((next) => {
    const clamped = Math.max(0, Math.min(totalPages - 1, next))
    setFilter({ page: clamped })
  }, [totalPages, setFilter])

  // ─── Row interactions ─────────────────────────────────────
  // DataTable's onRowClick passes the row only (no event). To navigate, the
  // user clicks the dedicated Open icon at the right edge of each row (or
  // the "Open" button in the MiniSummary card).
  const handleRowClick = useCallback((row) => {
    setCursorId((prev) => (prev === row.id ? null : row.id))
  }, [])

  const handleOpenOrder = useCallback((id) => {
    navigate(`/orders/${id}`)
  }, [navigate])

  const handleOpenCustomer = useCallback((id) => {
    navigate(`/customers/${id}`)
  }, [navigate])

  // ─── Bulk selection ───────────────────────────────────────
  const handleToggleSelect = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allOnPage = rows.map((r) => r.id)
      const allSelectedNow = allOnPage.length > 0 && allOnPage.every((id) => prev.has(id))
      if (allSelectedNow) {
        // Deselect just this page's rows; preserve any selections from elsewhere.
        const next = new Set(prev)
        for (const id of allOnPage) next.delete(id)
        return next
      }
      return new Set([...prev, ...allOnPage])
    })
  }, [rows])

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  // ─── Bulk handlers (toast Coming Soon for now) ────────────
  const handleBulkPrint = useCallback(() => {
    toast.info?.(`Bulk print queued for ${selectedIds.size} orders (Phase 8)`)
  }, [selectedIds.size, toast])

  const handleBulkExport = useCallback(() => {
    toast.info?.(`Bulk export queued for ${selectedIds.size} orders (Phase 8)`)
  }, [selectedIds.size, toast])

  const handleBulkChangeStatus = useCallback(() => {
    toast.info?.(`Bulk status change queued for ${selectedIds.size} orders (Phase 8)`)
  }, [selectedIds.size, toast])

  // ─── Columns ──────────────────────────────────────────────
  const columns = useMemo(() => buildOrdersColumns({
    selectedIds,
    onToggleSelect: handleToggleSelect,
    onSelectAll: handleSelectAll,
    allSelected,
    onOpenOrder: handleOpenOrder,
  }), [selectedIds, handleToggleSelect, handleSelectAll, allSelected, handleOpenOrder])

  // ─── Render ───────────────────────────────────────────────
  return (
    <ShellShell
      navRail={<OrdersNavRail filters={filters} setFilter={setFilter} />}
      context={
        <OrdersListContext
          cursorRow={cursorRow}
          selectedIds={selectedIds}
          onOpenOrder={handleOpenOrder}
          onOpenCustomer={handleOpenCustomer}
          onClearSelection={handleClearSelection}
          onBulkPrint={handleBulkPrint}
          onBulkExport={handleBulkExport}
          onBulkChangeStatus={handleBulkChangeStatus}
        />
      }
    >
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold text-slate-900">Orders</h1>
            <span className="text-sm text-slate-500" data-testid="orders-count">
              {count === 0 ? '0 orders' : `${count.toLocaleString('en-IN')} ${count === 1 ? 'order' : 'orders'}`}
            </span>
            {selectedIds.size > 0 && (
              <span className="text-sm text-indigo-700">
                · {selectedIds.size} selected
              </span>
            )}
          </div>
          <Button onClick={() => navigate('/orders/new')}>
            <Plus size={16} /> New Order
          </Button>
        </div>

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
          // pagination never kicks in — we drive pages via setFilter.
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
