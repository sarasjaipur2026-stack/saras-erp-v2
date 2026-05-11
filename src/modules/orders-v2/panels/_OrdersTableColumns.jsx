/**
 * Pure column-definition factory for the Orders V2 list table.
 *
 * Returns an array of `{ key, label, render }` records consumable by the
 * shared `<DataTable>` component (src/components/ui/index.jsx).
 *
 * Kept separate from `OrdersV2Page.jsx` so:
 *   - the shape is unit-testable in isolation (key list, count, ordering)
 *   - column tweaks for view modes / role variants can fan out without
 *     touching the page composition
 *
 * The factory takes runtime helpers as arguments rather than reading from
 * context — keeps every render function deterministic given the row data.
 */

import { ExternalLink } from 'lucide-react'
import { Currency, StatusBadge, Badge } from '../../../components/ui'
// Note: column key list lives in `./columnKeys.js` so it can be imported
// by Node `--test` runners that don't transpile JSX. Don't re-export from
// here — react-refresh requires component files to export components only.

/**
 * Build column defs for the orders list.
 *
 * @param {object} [opts]
 * @param {Set<string>} [opts.selectedIds]            — bulk-select set
 * @param {(id: string) => void} [opts.onToggleSelect] — checkbox toggle
 * @param {() => void} [opts.onSelectAll]             — header checkbox
 * @param {boolean} [opts.allSelected]                — drives header checkbox state
 * @param {(id: string) => void} [opts.onOpenOrder]   — Open icon → navigate
 * @returns {Array<{ key: string, label: any, render: (value: unknown, row: object) => unknown }>}
 */
export function buildOrdersColumns(opts = {}) {
  const { selectedIds, onToggleSelect, onSelectAll, allSelected, onOpenOrder } = opts
  const bulkEnabled = Boolean(selectedIds && onToggleSelect && onSelectAll)

  const cols = []

  if (bulkEnabled) {
    cols.push({
      key: '_select',
      label: (
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onSelectAll}
          aria-label="Select all rows on this page"
          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
        />
      ),
      render: (_value, row) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.id)}
          onChange={() => onToggleSelect(row.id)}
          onClick={(e) => e.stopPropagation()}
          aria-label={`Select ${row.order_number || 'row'}`}
          className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
        />
      ),
    })
  }

  cols.push(
    {
      key: 'order_number',
      label: 'Order #',
      render: (value) => (
        // Monospace + indigo so the order number is the visual anchor of each row.
        <span className="font-mono font-semibold text-indigo-700">{value || '—'}</span>
      ),
    },
    {
      key: 'customers',
      label: 'Customer',
      render: (_value, row) => {
        const c = row?.customers
        if (!c) return <span className="text-slate-400">—</span>
        return (
          <div className="flex flex-col">
            <span className="text-slate-900">{c.firm_name || c.contact_name || '—'}</span>
            {c.firm_name && c.contact_name && c.contact_name !== c.firm_name && (
              <span className="text-[11px] text-slate-500">{c.contact_name}</span>
            )}
          </div>
        )
      },
    },
    {
      key: 'status',
      label: 'Status',
      render: (value) => <StatusBadge status={value} />,
    },
    {
      key: 'priority',
      label: 'Priority',
      render: (value) => (
        <Badge
          variant={
            value === 'High' ? 'danger' :
            value === 'Medium' ? 'warning' :
            'default'
          }
        >
          {value || 'Normal'}
        </Badge>
      ),
    },
    {
      key: 'grand_total',
      label: 'Amount',
      render: (value) => <Currency amount={Number(value) || 0} />,
    },
    {
      key: 'balance_due',
      label: 'Balance',
      render: (value) => {
        const bal = Number(value) || 0
        return bal > 0
          ? <span className="text-amber-700 font-medium"><Currency amount={bal} /></span>
          : <span className="text-slate-400">—</span>
      },
    },
    {
      key: 'delivery_date_1',
      label: 'Delivery',
      render: (value) => value
        ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        : <span className="text-slate-400">—</span>,
    },
    {
      key: 'created_at',
      label: 'Created',
      render: (value) => value
        ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
        : <span className="text-slate-400">—</span>,
    },
  )

  if (onOpenOrder) {
    cols.push({
      key: '_open',
      label: '',
      render: (_value, row) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenOrder(row.id)
          }}
          className="inline-flex items-center gap-1 rounded-md p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700 transition"
          aria-label="Open order"
          title="Open order details"
        >
          <ExternalLink size={13} />
        </button>
      ),
    })
  }

  return cols
}

