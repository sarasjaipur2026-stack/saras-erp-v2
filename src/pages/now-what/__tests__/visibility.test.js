/**
 * Unit tests for cardsForRole + isCardVisible (role-based card filtering).
 *
 * Pure-fn tests run via Node's built-in test runner — no Vitest or RTL needed.
 * Run with: npm run test:shell
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cardsForRole, isCardVisible } from '../visibility.js'

const ALL = [
  'overdue_payments',
  'orders_pending',
  'low_stock',
  'qc_pending',
  'dispatch_today',
  'held_bills',
  'today_sales',
  'new_enquiries',
]

test('cardsForRole — admin sees every card', () => {
  assert.deepEqual(cardsForRole('admin'), ALL)
})

test('cardsForRole — manager sees every card', () => {
  assert.deepEqual(cardsForRole('manager'), ALL)
})

test('cardsForRole — staff hides overdue_payments (financial-admin-only)', () => {
  const staff = cardsForRole('staff')
  assert.equal(staff.includes('overdue_payments'), false)
  assert.equal(staff.includes('orders_pending'), true)
  assert.equal(staff.includes('low_stock'), true)
})

test('cardsForRole — viewer sees only read-only operational cards', () => {
  const viewer = cardsForRole('viewer')
  assert.deepEqual(
    viewer.sort(),
    ['low_stock', 'dispatch_today', 'today_sales', 'new_enquiries'].sort(),
  )
})

test('cardsForRole — cashier sees only POS-relevant cards', () => {
  const cashier = cardsForRole('cashier')
  assert.deepEqual(cashier.sort(), ['held_bills', 'today_sales'].sort())
})

test('cardsForRole — unknown role defaults to admin (fail-open, RLS still gates DB)', () => {
  assert.deepEqual(cardsForRole('weird_new_role'), ALL)
  assert.deepEqual(cardsForRole(undefined), ALL)
  assert.deepEqual(cardsForRole(null), ALL)
})

test('cardsForRole — returns cards in canonical order (red → blue urgency)', () => {
  // Order matters for the UI grid layout — cards should appear in priority order.
  const admin = cardsForRole('admin')
  assert.equal(admin[0], 'overdue_payments') // red, top priority
  assert.equal(admin[1], 'orders_pending')   // amber
  assert.equal(admin[2], 'low_stock')        // red
  assert.equal(admin[admin.length - 2], 'today_sales')   // blue, informational
  assert.equal(admin[admin.length - 1], 'new_enquiries') // blue, informational
})

test('isCardVisible — true for admin on any card', () => {
  for (const card of ALL) {
    assert.equal(isCardVisible('admin', card), true)
  }
})

test('isCardVisible — false for cashier on non-POS cards', () => {
  assert.equal(isCardVisible('cashier', 'overdue_payments'), false)
  assert.equal(isCardVisible('cashier', 'orders_pending'), false)
  assert.equal(isCardVisible('cashier', 'low_stock'), false)
  assert.equal(isCardVisible('cashier', 'qc_pending'), false)
  assert.equal(isCardVisible('cashier', 'dispatch_today'), false)
  assert.equal(isCardVisible('cashier', 'new_enquiries'), false)
})

test('isCardVisible — true for cashier on POS cards', () => {
  assert.equal(isCardVisible('cashier', 'held_bills'), true)
  assert.equal(isCardVisible('cashier', 'today_sales'), true)
})

test('isCardVisible — true for staff on operational cards', () => {
  assert.equal(isCardVisible('staff', 'orders_pending'), true)
  assert.equal(isCardVisible('staff', 'low_stock'), true)
  assert.equal(isCardVisible('staff', 'dispatch_today'), true)
  assert.equal(isCardVisible('staff', 'held_bills'), true)
})

test('isCardVisible — unknown card id always false', () => {
  assert.equal(isCardVisible('admin', 'unknown_card'), false)
  assert.equal(isCardVisible('cashier', 'unknown_card'), false)
})
