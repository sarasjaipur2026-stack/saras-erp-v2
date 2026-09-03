import assert from 'node:assert/strict'
import test from 'node:test'

import {
  allVisibleRowsSelected,
  buildOrderPayload,
  normalizeOrderForForm,
  toggleAllVisibleRows,
} from '../../src/lib/orderFormModel.js'
import { ordersToCsv } from '../../src/lib/orderExport.js'

test('normalizes database relation names for edit and duplicate forms', () => {
  const order = {
    id: 'server-id', customer_id: 'customer', status: 'booking', grand_total: 10,
    order_line_items: [{ id: 'line-id', product_id: 'product', amount: 10, products: { name: 'ignored' } }],
    order_charges: [{ id: 'charge-id', charge_type_id: 'charge', amount: 2, charge_types: { name: 'ignored' } }],
    customers: { firm_name: 'Ignored relation' },
  }
  const edit = normalizeOrderForForm(order)
  assert.equal(edit.line_items[0].id, 'line-id')
  assert.equal(edit.charges[0].id, 'charge-id')
  assert.equal(edit.customers, undefined)

  const duplicate = normalizeOrderForForm(order, { duplicate: true, now: 123 })
  assert.equal(duplicate.status, 'draft')
  assert.match(duplicate.line_items[0].id, /^temp_duplicate_line_123_/)
  assert.match(duplicate.charges[0].id, /^temp_duplicate_charge_123_/)
})

test('order payload excludes server relations and immutable columns', () => {
  const payload = buildOrderPayload({
    id: 'server-id', order_number: 'ORD-1', customer_id: 'customer',
    customers: { firm_name: 'Relation' }, line_items: [{ id: 'line' }], grand_total: 25,
  }, 'booking')
  assert.deepEqual(payload, { customer_id: 'customer', grand_total: 25, status: 'booking' })
})

test('select-all works only on visible rows while preserving hidden selections', () => {
  const visible = [{ id: 'a' }, { id: 'b' }]
  const selected = new Set(['hidden', 'a'])
  assert.equal(allVisibleRowsSelected(visible, selected), false)
  const all = toggleAllVisibleRows(visible, selected)
  assert.deepEqual([...all].sort(), ['a', 'b', 'hidden'])
  assert.deepEqual([...toggleAllVisibleRows(visible, all)], ['hidden'])
})

test('CSV export escapes formulas, quotes, and numeric totals', () => {
  const csv = ordersToCsv([{
    order_number: '=2+2', customers: { firm_name: 'A, "Firm"' }, status: 'draft',
    grand_total: '10.5', advance_paid: 2, balance_due: 8.5,
  }])
  assert.match(csv, /'=2\+2/)
  assert.match(csv, /"A, ""Firm"""/)
  assert.match(csv, /10\.50,2\.00,8\.50/)
})
