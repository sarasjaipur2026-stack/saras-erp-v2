import assert from 'node:assert/strict'
import test from 'node:test'

import { aggregateCustomerOutstanding, isMissingRpcError } from '../../src/lib/reportFallback.js'

test('falls back only when PostgREST reports a missing RPC', () => {
  assert.equal(isMissingRpcError({ code: 'PGRST202' }), true)
  assert.equal(isMissingRpcError({ code: '42501' }), false)
  assert.equal(isMissingRpcError(null), false)
})

test('aggregates the legacy customer outstanding report accurately', () => {
  const rows = aggregateCustomerOutstanding([
    {
      customer_id: 'a', grand_total: '1000', advance_paid: '250', balance_due: '750',
      created_at: '2026-01-02T00:00:00Z', customers: { firm_name: 'A', phone: '1' },
    },
    {
      customer_id: 'a', grand_total: '500', advance_paid: '500', balance_due: '0',
      created_at: '2026-02-02T00:00:00Z', customers: { firm_name: 'A', phone: '1' },
    },
    {
      customer_id: 'b', grand_total: '2000', advance_paid: '500', balance_due: '1500',
      created_at: '2026-03-02T00:00:00Z', customers: { firm_name: 'B', phone: '2' },
    },
  ])

  assert.deepEqual(rows, [
    {
      customer_id: 'b', firm_name: 'B', phone: '2', order_count: 1,
      total_billed: 2000, total_paid: 500, total_outstanding: 1500,
      oldest_open: '2026-03-02T00:00:00Z',
    },
    {
      customer_id: 'a', firm_name: 'A', phone: '1', order_count: 2,
      total_billed: 1500, total_paid: 750, total_outstanding: 750,
      oldest_open: '2026-01-02T00:00:00Z',
    },
  ])
})
