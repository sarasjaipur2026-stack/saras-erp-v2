/**
 * Static column-key list for the Orders V2 list table.
 *
 * Lives separately from `_OrdersTableColumns.jsx` so the keys can be imported
 * under Node's `--test` runner (which does not transpile JSX). The JSX-using
 * factory imports this same constant for the source-of-truth ordering.
 *
 * Keep in sync with `buildOrdersColumns()` in `_OrdersTableColumns.jsx`.
 */

export const ORDERS_COLUMN_KEYS = [
  'order_number',
  'customers',
  'status',
  'priority',
  'grand_total',
  'balance_due',
  'delivery_date_1',
  'created_at',
]
