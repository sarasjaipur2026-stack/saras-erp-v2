/**
 * Unit tests for gstSplit — pure-fn coverage.
 * Run with: node --test src/modules/pos/__tests__/gstSplit.test.js
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeLineGst, computeCartGst } from '../lib/gstSplit.js'

test('computeLineGst — intra-state CGST+SGST split', () => {
  const r = computeLineGst({ qty: 10, rate: 100, gst_rate: 12 }, false)
  assert.equal(r.taxable, 1000)
  assert.equal(r.cgst, 60)
  assert.equal(r.sgst, 60)
  assert.equal(r.igst, 0)
  assert.equal(r.total, 1120)
})

test('computeLineGst — inter-state IGST', () => {
  const r = computeLineGst({ qty: 10, rate: 100, gst_rate: 12 }, true)
  assert.equal(r.cgst, 0)
  assert.equal(r.sgst, 0)
  assert.equal(r.igst, 120)
  assert.equal(r.total, 1120)
})

test('computeLineGst — line discount % subtracts before tax', () => {
  const r = computeLineGst({ qty: 10, rate: 100, gst_rate: 12, discount_pct: 10 }, false)
  assert.equal(r.taxable, 900)
  assert.equal(r.cgst, 54)
  assert.equal(r.total, 1008)
})

test('computeLineGst — flat discount amount subtracts before tax', () => {
  const r = computeLineGst({ qty: 10, rate: 100, gst_rate: 12, discount_amt: 100 }, false)
  assert.equal(r.taxable, 900)
})

test('computeLineGst — both pct + flat discount stack', () => {
  // 1000 → 10% off = 900 → -100 = 800 taxable
  const r = computeLineGst({ qty: 10, rate: 100, gst_rate: 12, discount_pct: 10, discount_amt: 100 }, false)
  assert.equal(r.taxable, 800)
})

test('computeLineGst — zero rate returns zero everywhere', () => {
  const r = computeLineGst({ qty: 10, rate: 0, gst_rate: 12 }, false)
  assert.deepEqual({ ...r }, { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 })
})

test('computeLineGst — discount > total clamps to zero taxable', () => {
  const r = computeLineGst({ qty: 1, rate: 100, gst_rate: 12, discount_amt: 200 }, false)
  assert.equal(r.taxable, 0)
})

test('computeCartGst — walk-in (no state code) defaults to intra-state', () => {
  const t = computeCartGst([{ qty: 10, rate: 100, gst_rate: 12 }], null)
  assert.equal(t.interState, false)
  assert.equal(t.cgst_amount, 60)
  assert.equal(t.sgst_amount, 60)
  assert.equal(t.igst_amount, 0)
  assert.equal(t.grand_total, 1120)
})

test('computeCartGst — same state (08 = 08) → CGST+SGST', () => {
  const t = computeCartGst([{ qty: 10, rate: 100, gst_rate: 12 }], '08', '08')
  assert.equal(t.interState, false)
  assert.equal(t.grand_total, 1120)
})

test('computeCartGst — different state (27 ≠ 08) → IGST', () => {
  const t = computeCartGst([{ qty: 10, rate: 100, gst_rate: 12 }], '27', '08')
  assert.equal(t.interState, true)
  assert.equal(t.igst_amount, 120)
  assert.equal(t.cgst_amount, 0)
})

test('computeCartGst — multi-line totals sum correctly', () => {
  const t = computeCartGst([
    { qty: 10, rate: 100, gst_rate: 12 },   // 1120
    { qty: 5, rate: 50, gst_rate: 5 },      // 262.50
  ], null)
  assert.equal(t.subtotal, 1250)
  assert.equal(t.grand_total, 1382.5)
})

test('computeCartGst — empty lines returns zeros', () => {
  const t = computeCartGst([], null)
  assert.equal(t.subtotal, 0)
  assert.equal(t.grand_total, 0)
  assert.equal(t.lines.length, 0)
})

test('computeCartGst — preserves line metadata + adds taxable/total', () => {
  const t = computeCartGst([{ qty: 10, rate: 100, gst_rate: 12, description: 'Test SKU', code: 'X1' }], null)
  assert.equal(t.lines[0].description, 'Test SKU')
  assert.equal(t.lines[0].code, 'X1')
  assert.equal(t.lines[0].taxable_amount, 1000)
  assert.equal(t.lines[0].line_total, 1120)
})
