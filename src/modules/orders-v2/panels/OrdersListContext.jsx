/**
 * <OrdersListContext> — right-rail context stack for the Orders V2 list.
 *
 * Switches between three modes based on UI state owned by OrdersV2Page:
 *
 *   1. `selectedIds.size > 0` → BulkActionsCard (replaces the per-row stack)
 *   2. `cursorRow` is set      → MiniSummary + Customer + RecentActivity
 *   3. otherwise               → EmptyStateCard
 *
 * Renders pure-presentational cards — no fetches here. All data flows in
 * via props from the parent page.
 */

import MiniSummaryCard from './cards/MiniSummaryCard'
import CustomerCard from './cards/CustomerCard'
import RecentActivityCard from './cards/RecentActivityCard'
import BulkActionsCard from './cards/BulkActionsCard'
import EmptyStateCard from './cards/EmptyStateCard'

/**
 * @param {object} props
 * @param {object|null} props.cursorRow       — currently-clicked row (or null)
 * @param {Set<string>} props.selectedIds     — bulk-select set
 * @param {(id: string) => void} props.onOpenOrder
 * @param {(id: string) => void} props.onOpenCustomer
 * @param {() => void} props.onClearSelection
 * @param {() => void} props.onBulkPrint
 * @param {() => void} props.onBulkExport
 * @param {() => void} props.onBulkChangeStatus
 */
export default function OrdersListContext({
  cursorRow,
  selectedIds,
  onOpenOrder,
  onOpenCustomer,
  onClearSelection,
  onBulkPrint,
  onBulkExport,
  onBulkChangeStatus,
}) {
  const bulkCount = selectedIds?.size || 0

  return (
    <div className="flex h-full flex-col gap-3 p-3">
      {bulkCount > 0 ? (
        <BulkActionsCard
          count={bulkCount}
          onPrint={onBulkPrint}
          onExport={onBulkExport}
          onChangeStatus={onBulkChangeStatus}
          onClear={onClearSelection}
        />
      ) : cursorRow ? (
        <>
          <MiniSummaryCard row={cursorRow} onOpen={() => onOpenOrder?.(cursorRow.id)} />
          <CustomerCard row={cursorRow} onOpenCustomer={onOpenCustomer} />
          <RecentActivityCard row={cursorRow} />
        </>
      ) : (
        <EmptyStateCard />
      )}
    </div>
  )
}
