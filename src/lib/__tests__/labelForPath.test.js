/**
 * Unit tests for labelForPath.
 * Run with: npm run test:shell
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { labelForPath } from '../labelForPath.js'

test('root path returns Dashboard', () => {
  assert.equal(labelForPath('/'), 'Dashboard')
})

test('empty / null / undefined return Dashboard', () => {
  assert.equal(labelForPath(''), 'Dashboard')
  assert.equal(labelForPath(null), 'Dashboard')
  assert.equal(labelForPath(undefined), 'Dashboard')
})

test('order detail path gets friendly label', () => {
  assert.equal(labelForPath('/orders/abc-123'), 'Order detail')
})

test('orders list path returns "Orders"', () => {
  assert.equal(labelForPath('/orders'), 'Orders')
})

test('orders/new returns "New"', () => {
  // /orders/new is the "create" route, treat as "New" not "Order detail"
  assert.equal(labelForPath('/orders/new'), 'New')
})

test('enquiry detail path gets friendly label', () => {
  assert.equal(labelForPath('/enquiries/abc-123'), 'Enquiry detail')
})

test('masters route gets prefixed label', () => {
  assert.equal(labelForPath('/masters/customers'), 'Master customers')
  assert.equal(labelForPath('/masters/yarn-types'), 'Master yarn types')
})

test('single-segment route is prettified', () => {
  assert.equal(labelForPath('/calculator'), 'Calculator')
  assert.equal(labelForPath('/dispatch'), 'Dispatch')
})

test('nested unknown route uses last segment, prettified', () => {
  assert.equal(labelForPath('/pos/photo-wizard'), 'Photo Wizard')
})

test('snake_case and kebab-case both prettified', () => {
  assert.equal(labelForPath('/foo/bar_baz'), 'Bar Baz')
  assert.equal(labelForPath('/foo/qux-quux'), 'Qux Quux')
})
