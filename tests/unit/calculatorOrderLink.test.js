import test from 'node:test'
import assert from 'node:assert/strict'
import { deriveCalculatorLinkFromOrder, deriveEffectiveOrderQuantity } from '../../src/lib/calculatorOrderLink.js'

test('hydrates calculator quantities and mapped master types from an order', () => {
  const result = deriveCalculatorLinkFromOrder({
    order_number: 'ORD-1',
    taxable_amount: 2400,
    customers: { firm_name: 'Acme' },
    order_line_items: [
      {
        meters: 100,
        weight_kg: 12,
        amount: 2400,
        products: { name: 'Cord', product_type_id: 'product-type' },
        machines: { name: 'Braider', machine_type_id: 'machine-type' },
      },
    ],
  })

  assert.deepEqual(result.statePatch, {
    order_meters: 100,
    order_kgs: 12,
    actual_sell_per_kg: 200,
    product_type_id: 'product-type',
    machine_type_id: 'machine-type',
  })
  assert.equal(result.summary.customerName, 'Acme')
  assert.deepEqual(result.summary.productNames, ['Cord'])
})

test('uses unit quantities and leaves unavailable mappings explicit', () => {
  const result = deriveCalculatorLinkFromOrder({
    order_line_items: [
      { quantity: 75, unit: 'm', amount: 1500, products: { name: 'Tape' } },
      { quantity: 5, unit: 'kg', amount: 500, machines: { name: 'M-1' } },
    ],
  })

  assert.equal(result.statePatch.order_meters, 75)
  assert.equal(result.statePatch.order_kgs, 5)
  assert.equal(result.statePatch.actual_sell_per_kg, 100)
  assert.equal(result.statePatch.product_type_id, '')
  assert.equal(result.summary.productTypeMapped, false)
})

test('does not invent kilograms before a sample conversion exists', () => {
  assert.deepEqual(deriveEffectiveOrderQuantity({
    orderMeters: 100,
    orderKgs: 0,
    metersPerKg: 0,
  }), {
    effectiveMeters: 100,
    effectiveKgs: 0,
  })

  assert.deepEqual(deriveEffectiveOrderQuantity({
    orderMeters: 100,
    orderKgs: 0,
    metersPerKg: 20,
  }), {
    effectiveMeters: 100,
    effectiveKgs: 5,
  })
})

test('hydrates only the selected order line for item-level costing', () => {
  const result = deriveCalculatorLinkFromOrder({
    taxable_amount: 9999,
    order_line_items: [
      {
        id: 'line-a',
        meters: 100,
        weight_kg: 10,
        amount: 1200,
        products: { name: 'Cord A', product_type_id: 'type-a' },
      },
      {
        id: 'line-b',
        meters: 250,
        weight_kg: 25,
        amount: 5000,
        products: { name: 'Cord B', product_type_id: 'type-b' },
      },
    ],
  }, 'line-b')

  assert.equal(result.statePatch.order_meters, 250)
  assert.equal(result.statePatch.order_kgs, 25)
  assert.equal(result.statePatch.actual_sell_per_kg, 200)
  assert.equal(result.statePatch.product_type_id, 'type-b')
  assert.equal(result.summary.lineItemId, 'line-b')
  assert.equal(result.summary.lineItemName, 'Cord B')
  assert.equal(result.summary.lineItemOptions.length, 2)
})

test('does not silently aggregate when a requested order line is missing', () => {
  const result = deriveCalculatorLinkFromOrder({
    order_line_items: [{ id: 'line-a', meters: 100, amount: 500 }],
  }, 'missing-line')

  assert.equal(result.summary.selectedLineFound, false)
  assert.equal(result.statePatch.order_meters, 0)
  assert.equal(result.statePatch.order_kgs, 0)
})
