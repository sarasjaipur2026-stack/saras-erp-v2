/**
 * Unit tests for tenderRules — pure-fn coverage.
 * Run with: node --test src/modules/pos/__tests__/tenderRules.test.js
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateTenders } from '../lib/tenderRules.js'

const walkIn = null
const reg = { id: 'cust-1', firm_name: 'Acme' }

test('rejects empty tender list', () => {
  const r = validateTenders([], 100, walkIn)
  assert.equal(r.ok, false)
  assert.match(r.errors[0], /at least one/i)
})

test('single full cash tender ok', () => {
  const r = validateTenders([{ tender_type: 'cash', amount: 100 }], 100, walkIn)
  assert.equal(r.ok, true)
  assert.equal(r.delta, 0)
})

test('split cash + UPI matching total ok', () => {
  const r = validateTenders([
    { tender_type: 'cash', amount: 60 },
    { tender_type: 'upi', amount: 40 },
  ], 100, walkIn)
  assert.equal(r.ok, true)
  assert.equal(r.paidTotal, 100)
})

test('short payment fails', () => {
  const r = validateTenders([{ tender_type: 'cash', amount: 50 }], 100, walkIn)
  assert.equal(r.ok, false)
  assert.match(r.errors[0], /short.*50/i)
})

test('over-payment fails', () => {
  const r = validateTenders([{ tender_type: 'cash', amount: 120 }], 100, walkIn)
  assert.equal(r.ok, false)
  assert.match(r.errors[0], /more than/i)
})

test('on-account requires registered customer (walk-in rejected)', () => {
  const r = validateTenders([{ tender_type: 'account', amount: 100 }], 100, walkIn)
  assert.equal(r.ok, false)
  assert.ok(r.errors.some(e => /registered customer/i.test(e)))
})

test('on-account allowed for registered customer', () => {
  const r = validateTenders([{ tender_type: 'account', amount: 100 }], 100, reg)
  assert.equal(r.ok, true)
})

test('zero or negative amount on a tender fails', () => {
  const r = validateTenders([{ tender_type: 'cash', amount: 0 }], 100, walkIn)
  assert.equal(r.ok, false)
  assert.ok(r.errors.some(e => /amount must be > 0/i.test(e)))
})

test('unknown tender type rejected', () => {
  const r = validateTenders([{ tender_type: 'crypto', amount: 100 }], 100, walkIn)
  assert.equal(r.ok, false)
  assert.ok(r.errors.some(e => /unknown type/i.test(e)))
})

test('split with one penny rounding tolerated', () => {
  const r = validateTenders([
    { tender_type: 'cash', amount: 33.33 },
    { tender_type: 'upi', amount: 33.33 },
    { tender_type: 'card', amount: 33.34 },
  ], 100, walkIn)
  assert.equal(r.ok, true)
})
