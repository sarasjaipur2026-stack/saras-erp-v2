import test from 'node:test'
import assert from 'node:assert/strict'
import { orderDocumentModel } from '../../src/lib/orderExport.js'

const order = {
  order_number: 'AUDIT-ORDER-001',
  created_at: '2026-09-04T00:00:00.000Z',
  delivery_date_1: '2026-09-10',
  status: 'booking',
  subtotal: 1200,
  order_discount_amount: 100,
  cgst_amount: 99,
  sgst_amount: 99,
  grand_total: 1298,
  advance_paid: 300,
  balance_due: 998,
  customers: { firm_name: 'Audit Customer', contact_name: 'Test Buyer', phone: '9999999999' },
  order_line_items: [
    {
      id: 'line-1', meters: 100, rate_per_unit: 12, amount: 1200,
      products: { name: '5mm Cord' }, materials: { name: 'Polyester' },
      machines: { name: 'Braider 24' }, colors: { name: 'Red' }, instructions: 'Pack in 50m rolls',
    },
  ],
}

test('builds an order confirmation with accurate financial totals', () => {
  const model = orderDocumentModel(order, 'confirmation')
  assert.equal(model.label, 'Order Confirmation')
  assert.equal(model.lines[0].quantity, 100)
  assert.equal(model.lines[0].unit, 'm')
  assert.equal(model.discount, 100)
  assert.equal(model.tax, 198)
  assert.equal(model.balance, 998)
})

test('builds production and delivery documents from the same order truth', () => {
  const production = orderDocumentModel(order, 'production')
  assert.equal(production.lines[0].machine, 'Braider 24')
  assert.equal(production.lines[0].instructions, 'Pack in 50m rolls')

  const challan = orderDocumentModel(order, 'challan', [
    { line_item_id: 'line-1', quantity_delivered: 25 },
    { line_item_id: 'line-1', quantity_delivered: 15 },
  ])
  assert.equal(challan.lines[0].delivered, 40)
  assert.equal(challan.lines[0].pending, 60)
})
