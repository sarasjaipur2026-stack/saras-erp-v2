import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  computeLineNet,
  computeTotals,
  validateForm,
  resolveGstType,
  transformLines,
  transformCharges,
  buildOrderPayload,
} from '../hooks/_wizardMath.js'

// ─── computeLineNet ─────────────────────────────────────────

test('computeLineNet — empty line is all zeros', () => {
  const n = computeLineNet({})
  assert.deepEqual(n, { gross: 0, discount: 0, taxable: 0, gst: 0, net: 0 })
})

test('computeLineNet — qty 10 × rate 5 with 18% GST', () => {
  const n = computeLineNet({ qty: 10, rate: 5, gstRate: 18 })
  assert.equal(n.gross, 50)
  assert.equal(n.discount, 0)
  assert.equal(n.taxable, 50)
  assert.equal(n.gst, 9)
  assert.equal(n.net, 59)
})

test('computeLineNet — string inputs from <input type=number>', () => {
  const n = computeLineNet({ qty: '10', rate: '5', gstRate: '18' })
  assert.equal(n.net, 59)
})

test('computeLineNet — 50% line discount before GST', () => {
  const n = computeLineNet({ qty: 10, rate: 100, gstRate: 18, discountPct: 50 })
  assert.equal(n.gross, 1000)
  assert.equal(n.discount, 500)
  assert.equal(n.taxable, 500)
  assert.equal(n.gst, 90)
  assert.equal(n.net, 590)
})

test('computeLineNet — discount over 100 clamps to 100', () => {
  const n = computeLineNet({ qty: 10, rate: 100, gstRate: 18, discountPct: 250 })
  assert.equal(n.discount, 1000)
  assert.equal(n.taxable, 0)
  assert.equal(n.net, 0)
})

test('computeLineNet — negative discount clamps to 0', () => {
  const n = computeLineNet({ qty: 10, rate: 100, discountPct: -25 })
  assert.equal(n.discount, 0)
  assert.equal(n.taxable, 1000)
})

test('computeLineNet — non-numeric GST treated as 0', () => {
  const n = computeLineNet({ qty: 10, rate: 5, gstRate: 'abc' })
  assert.equal(n.gst, 0)
  assert.equal(n.net, 50)
})

test('computeLineNet — null line returns zeros (no throw)', () => {
  const n = computeLineNet(null)
  assert.deepEqual(n, { gross: 0, discount: 0, taxable: 0, gst: 0, net: 0 })
})

// ─── computeTotals ──────────────────────────────────────────

test('computeTotals — empty arrays return all zeros', () => {
  const t = computeTotals([], [])
  assert.deepEqual(t, { subtotal: 0, discount: 0, taxable: 0, gst: 0, charges: 0, grand: 0 })
})

test('computeTotals — single line, no charges', () => {
  const t = computeTotals([{ qty: 10, rate: 5, gstRate: 18 }], [])
  assert.equal(t.subtotal, 50)
  assert.equal(t.gst, 9)
  assert.equal(t.grand, 59)
})

test('computeTotals — multi-line sums correctly', () => {
  const t = computeTotals([
    { qty: 10, rate: 5,  gstRate: 18 },               // taxable 50, gst 9
    { qty: 4,  rate: 25, gstRate: 12, discountPct: 10 }, // gross 100, disc 10, taxable 90, gst 10.8
  ], [])
  assert.equal(t.subtotal, 150)
  assert.equal(t.discount, 10)
  assert.equal(t.taxable, 140)
  assert.equal(t.gst.toFixed(2), '19.80')
  assert.equal(t.grand.toFixed(2), '159.80')
})

test('computeTotals — charges added AFTER GST, do not feed gst calc', () => {
  const t = computeTotals(
    [{ qty: 10, rate: 5, gstRate: 18 }],
    [{ amount: 100 }, { amount: '50' }],
  )
  assert.equal(t.charges, 150)
  assert.equal(t.gst, 9)         // unchanged by charges
  assert.equal(t.grand, 50 + 9 + 150)
})

test('computeTotals — string amounts coerced via Number(...)', () => {
  const t = computeTotals([{ qty: '10', rate: '5.5', gstRate: '18' }], [])
  assert.equal(t.subtotal, 55)
})

test('computeTotals — invalid charge amount treated as 0', () => {
  const t = computeTotals([{ qty: 10, rate: 5, gstRate: 0 }], [{ amount: 'abc' }, { amount: null }])
  assert.equal(t.charges, 0)
})

// ─── validateForm ───────────────────────────────────────────

test('validateForm — empty form fails both checks', () => {
  const v = validateForm({ customerId: '', lines: [] })
  assert.equal(v.isValid, false)
  assert.equal(v.errors.customerId, 'Customer is required')
  assert.equal(v.errors.lines, 'At least one line with product, qty, and rate is required')
})

test('validateForm — customer set, no valid lines fails', () => {
  const v = validateForm({
    customerId: 'cust-1',
    lines: [{ productId: '', qty: '', rate: '' }, { productId: 'p', qty: 0, rate: 5 }],
  })
  assert.equal(v.isValid, false)
  assert.equal(v.errors.lines, 'At least one line with product, qty, and rate is required')
  assert.equal(v.errors.customerId, undefined)
})

test('validateForm — one valid line passes', () => {
  const v = validateForm({
    customerId: 'cust-1',
    lines: [{ productId: 'p', qty: 1, rate: 1 }],
  })
  assert.equal(v.isValid, true)
  assert.equal(v.validLineCount, 1)
  assert.deepEqual(v.errors, {})
})

test('validateForm — mixed valid + invalid lines reports correct count', () => {
  const v = validateForm({
    customerId: 'cust-1',
    lines: [
      { productId: 'p', qty: 1, rate: 1 },
      { productId: '',  qty: 5, rate: 5 },  // missing productId
      { productId: 'p', qty: 0, rate: 5 },  // qty 0
      { productId: 'p', qty: 5, rate: 5 },
    ],
  })
  assert.equal(v.isValid, true)
  assert.equal(v.validLineCount, 2)
})

test('validateForm — null/undefined form is invalid (no crash)', () => {
  assert.equal(validateForm(null).isValid, false)
  assert.equal(validateForm(undefined).isValid, false)
})

// ─── resolveGstType ─────────────────────────────────────────

test('resolveGstType — explicit non-auto returns as-is', () => {
  assert.equal(resolveGstType('intra_state', { state_code: '27' }), 'intra_state')
  assert.equal(resolveGstType('inter_state', { state_code: '08' }), 'inter_state')
})

test('resolveGstType — auto + Rajasthan (08) → intra', () => {
  assert.equal(resolveGstType('auto', { state_code: '08' }), 'intra_state')
})

test('resolveGstType — auto + other state → inter', () => {
  assert.equal(resolveGstType('auto', { state_code: '27' }), 'inter_state')
})

test('resolveGstType — auto + no customer → inter (safer default)', () => {
  assert.equal(resolveGstType('auto', null), 'inter_state')
  assert.equal(resolveGstType('auto', undefined), 'inter_state')
  assert.equal(resolveGstType('auto', {}), 'inter_state')
})

// ─── transformLines ─────────────────────────────────────────

test('transformLines — filters invalid lines', () => {
  const out = transformLines([
    { productId: 'p', qty: 5, rate: 10 },
    { productId: '',  qty: 5, rate: 10 },
    { productId: 'p', qty: 0, rate: 10 },
    { productId: 'p', qty: 5, rate: 0 },
  ])
  assert.equal(out.length, 1)
  assert.equal(out[0].sort_order, 1)
  assert.equal(out[0].product_id, 'p')
})

test('transformLines — produces createAtomic schema fields', () => {
  const out = transformLines([{ productId: 'p', qty: 10, rate: 5, gstRate: 18, discountPct: 20 }])
  assert.deepEqual(out[0], {
    sort_order: 1,
    line_type: 'production',
    product_id: 'p',
    total_qty: 10,
    rate_per_unit: 5,
    amount: 50,
    discount_pct: 20,
    discount_amount: 10,
    gst_rate: 18,
    net_amount: 40,
  })
})

test('transformLines — sort_order is 1-based and contiguous after filtering', () => {
  const out = transformLines([
    { productId: 'a', qty: 1, rate: 1 },
    { productId: '',  qty: 9, rate: 9 },   // dropped
    { productId: 'b', qty: 2, rate: 2 },
    { productId: 'c', qty: 3, rate: 3 },
  ])
  assert.equal(out.length, 3)
  assert.deepEqual(out.map((l) => l.sort_order), [1, 2, 3])
})

// ─── transformCharges ───────────────────────────────────────

test('transformCharges — filters invalid', () => {
  const out = transformCharges([
    { chargeTypeId: 'a', amount: 100 },
    { chargeTypeId: '',  amount: 50 },
    { chargeTypeId: 'b', amount: 0 },
    { chargeTypeId: 'c', amount: '50' },
  ])
  assert.equal(out.length, 2)
  assert.equal(out[0].charge_type_id, 'a')
  assert.equal(out[0].amount, 100)
  assert.equal(out[1].charge_type_id, 'c')
  assert.equal(out[1].amount, 50)
})

test('transformCharges — string amounts coerced', () => {
  const out = transformCharges([{ chargeTypeId: 'a', amount: '199.50' }])
  assert.equal(out[0].amount, 199.5)
})

// ─── buildOrderPayload ──────────────────────────────────────

test('buildOrderPayload — all fields mapped', () => {
  const form = {
    customerId: 'cust-1',
    orderTypeId: 'ot-1',
    paymentTermsId: 'pt-1',
    deliveryDate: '2026-06-01',
    notes: 'urgent',
    nature: 'sample',
  }
  const p = buildOrderPayload(form, 'intra_state')
  assert.equal(p.customer_id, 'cust-1')
  assert.equal(p.order_type_id, 'ot-1')
  assert.equal(p.payment_terms_id, 'pt-1')
  assert.equal(p.gst_type, 'intra_state')
  assert.equal(p.delivery_date_1, '2026-06-01')
  assert.equal(p.notes, 'urgent')
  assert.equal(p.nature, 'sample')
  assert.equal(p.status, 'draft')
})

test('buildOrderPayload — empty optionals become null', () => {
  const form = {
    customerId: 'cust-1',
    orderTypeId: '',
    paymentTermsId: '',
    deliveryDate: '',
    notes: '',
  }
  const p = buildOrderPayload(form, 'inter_state')
  assert.equal(p.order_type_id, null)
  assert.equal(p.payment_terms_id, null)
  assert.equal(p.delivery_date_1, null)
  assert.equal(p.notes, null)
  assert.equal(p.nature, 'regular') // default
})

// ─── workflow integration ──────────────────────────────────

test('integration — totals + transforms agree on the final net', () => {
  // Build a realistic mini-order then check the math agrees with the
  // transformed schema fields.
  const lines = [
    { productId: 'p1', qty: 10, rate: 100, gstRate: 18, discountPct: 10 },
    { productId: 'p2', qty: 5,  rate: 50,  gstRate: 12 },
  ]
  const charges = [{ chargeTypeId: 'freight', amount: 200 }]

  const t = computeTotals(lines, charges)
  const xfLines = transformLines(lines)
  const xfCharges = transformCharges(charges)

  // Sum the transformed lines manually and check it matches totals.taxable
  const taxableFromXf = xfLines.reduce((a, l) => a + l.net_amount, 0)
  assert.equal(taxableFromXf, t.taxable, 'transformed net_amount should sum to taxable')

  // Sum charges
  const chargesFromXf = xfCharges.reduce((a, c) => a + c.amount, 0)
  assert.equal(chargesFromXf, t.charges)
})

test('integration — happy-path save shape', () => {
  const form = {
    customerId: 'cust-1',
    orderTypeId: '',
    paymentTermsId: '',
    gstType: 'auto',
    deliveryDate: '',
    notes: '',
    nature: 'regular',
    lines: [{ productId: 'p1', qty: 1, rate: 100, gstRate: 18 }],
    charges: [],
  }
  const v = validateForm(form)
  assert.equal(v.isValid, true)

  const customersById = new Map([['cust-1', { id: 'cust-1', state_code: '08' }]])
  const customer = customersById.get(form.customerId)
  const gstType = resolveGstType(form.gstType, customer)
  assert.equal(gstType, 'intra_state')

  const payload = buildOrderPayload(form, gstType)
  const lines = transformLines(form.lines)
  const charges = transformCharges(form.charges)

  assert.equal(payload.customer_id, 'cust-1')
  assert.equal(payload.gst_type, 'intra_state')
  assert.equal(lines.length, 1)
  assert.equal(lines[0].net_amount, 100)
  assert.equal(charges.length, 0)
})
