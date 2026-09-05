import test from 'node:test'
import assert from 'node:assert/strict'
import { orderQuantity, deliveryProgress } from '../../src/lib/orderQuantity.js'

test('order displays preserve pieces, meters and kilograms', () => {
  assert.deepEqual(orderQuantity({ quantity: 10, unit: 'pcs' }), { quantity: 10, unit: 'pcs' })
  assert.deepEqual(orderQuantity({ meters: 20 }), { quantity: 20, unit: 'meters' })
  assert.deepEqual(orderQuantity({ weight_kg: 3 }), { quantity: 3, unit: 'kg' })
})
test('delivery progress uses persisted quantity_delivered and numeric quantities', () => {
  assert.deepEqual(deliveryProgress({ id: 'line', quantity: 10 }, [
    { line_item_id: 'line', quantity_delivered: '2' },
    { line_item_id: 'line', quantity_delivered: '3' },
    { line_item_id: 'other', quantity_delivered: 100 },
  ]), { totalQty: 10, deliveredQty: 5, percentage: 50 })
})
