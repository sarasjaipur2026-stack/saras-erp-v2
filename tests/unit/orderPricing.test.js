import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateOrderPricing } from '../../src/lib/orderPricing.js'
import { normalizeOrderForForm } from '../../src/lib/orderFormModel.js'

const order = {
  gst_type: 'intra_state', order_discount_type: 'flat', order_discount_value: 100,
  line_items: [{ quantity: 10, rate_per_unit: 100, gst_rate: 18 }],
  charges: [{ amount: 100, is_taxable: false }],
}
test('flat discount and non-taxable charges produce the correct total', () => {
  const result = calculateOrderPricing(order)
  assert.equal(result.order_discount_amount, 100)
  assert.equal(result.taxable_amount, 900)
  assert.equal(result.cgst_amount, 81)
  assert.equal(result.sgst_amount, 81)
  assert.equal(result.grand_total, 1162)
})
test('taxable charges and percentage discounts recalculate for interstate orders', () => {
  const result = calculateOrderPricing({ ...order, gst_type: 'inter_state', order_discount_type: 'percentage', order_discount_value: 10, charges: [{ amount: 100, is_taxable: true }] })
  assert.equal(result.igst_amount, 180)
  assert.equal(result.cgst_amount, 0)
  assert.equal(result.grand_total, 1180)
})
test('quantity edits recalculate amounts and configured zero tax remains zero', () => {
  const result = calculateOrderPricing({ ...order, order_discount_value: 0, charges: [], line_items: [{ product_id: 'p', quantity: 3, rate_per_unit: 12.5, amount: 999, gst_rate: 18 }] }, [{ id: 'p', gst_rate: 0 }])
  assert.equal(result.subtotal, 37.5)
  assert.equal(result.grand_total, 37.5)
})
test('duplicates reset receipts and delivery dates without changing the original', () => {
  const original = { advance_paid: 50, grand_total: 100, balance_due: 50, delivery_date_1: '2026-01-01' }
  const duplicate = normalizeOrderForForm(original, { duplicate: true })
  assert.equal(duplicate.advance_paid, 0)
  assert.equal(duplicate.balance_due, 100)
  assert.equal(duplicate.delivery_date_1, null)
  assert.equal(original.advance_paid, 50)
})
