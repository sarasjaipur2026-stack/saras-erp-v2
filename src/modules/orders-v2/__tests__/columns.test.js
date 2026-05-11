import { test } from 'node:test'
import assert from 'node:assert/strict'

import { ORDERS_COLUMN_KEYS } from '../panels/columnKeys.js'

// We test the static `ORDERS_COLUMN_KEYS` list rather than the JSX-producing
// factory — the factory imports components which transitively need React's
// runtime. Static list captures the contract that matters: which columns
// exist and in what order.

test('ORDERS_COLUMN_KEYS — exposes 8 columns in expected order', () => {
  assert.equal(ORDERS_COLUMN_KEYS.length, 8)
  assert.deepEqual(ORDERS_COLUMN_KEYS, [
    'order_number',
    'customers',
    'status',
    'priority',
    'grand_total',
    'balance_due',
    'delivery_date_1',
    'created_at',
  ])
})

test('ORDERS_COLUMN_KEYS — order_number is the leading identifier', () => {
  assert.equal(ORDERS_COLUMN_KEYS[0], 'order_number')
})

test('ORDERS_COLUMN_KEYS — has no duplicates', () => {
  const set = new Set(ORDERS_COLUMN_KEYS)
  assert.equal(set.size, ORDERS_COLUMN_KEYS.length)
})

test('ORDERS_COLUMN_KEYS — all keys correspond to fields on the listPaged select', () => {
  // The listPaged() select in src/lib/db/orders.js returns:
  //   id, order_number, status, priority, grand_total, balance_due,
  //   advance_paid, delivery_date_1, created_at, nature, customers(...)
  // Every column key must match a top-level returned field (or 'customers'
  // which we render via the join).
  const allowed = new Set([
    'order_number', 'status', 'priority', 'grand_total', 'balance_due',
    'advance_paid', 'delivery_date_1', 'created_at', 'nature', 'customers',
  ])
  for (const key of ORDERS_COLUMN_KEYS) {
    assert.ok(allowed.has(key), `column key "${key}" not in listPaged select`)
  }
})
