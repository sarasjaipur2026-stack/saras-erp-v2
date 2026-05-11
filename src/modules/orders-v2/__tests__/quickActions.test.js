import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  ORDER_STATUSES,
  quickActionsForStatus,
  isActionVisible,
} from '../panels/_quickActions.js'

// ─── shape integrity ────────────────────────────────────────

test('quickActionsForStatus — every status returns a fresh array', () => {
  for (const s of ORDER_STATUSES) {
    const a = quickActionsForStatus(s)
    const b = quickActionsForStatus(s)
    assert.notStrictEqual(a, b, `status "${s}" should return a new array on each call`)
    assert.ok(Array.isArray(a))
  }
})

test('quickActionsForStatus — unknown status returns []', () => {
  assert.deepEqual(quickActionsForStatus('eternity'), [])
  assert.deepEqual(quickActionsForStatus(null), [])
  assert.deepEqual(quickActionsForStatus(undefined), [])
})

test('quickActionsForStatus — every action has id + label + icon + variant', () => {
  for (const s of ORDER_STATUSES) {
    for (const a of quickActionsForStatus(s)) {
      assert.ok(typeof a.id === 'string' && a.id.length > 0, `${s}: action missing id`)
      assert.ok(typeof a.label === 'string' && a.label.length > 0, `${s} ${a.id}: missing label`)
      assert.ok(typeof a.icon === 'string' && a.icon.length > 0, `${s} ${a.id}: missing icon`)
      assert.ok(['primary', 'secondary', 'danger'].includes(a.variant), `${s} ${a.id}: bad variant ${a.variant}`)
    }
  }
})

test('quickActionsForStatus — every action has exactly one of nextStatus | navigateTo', () => {
  for (const s of ORDER_STATUSES) {
    for (const a of quickActionsForStatus(s)) {
      const hasStatus = Object.prototype.hasOwnProperty.call(a, 'nextStatus')
      const hasNav = Object.prototype.hasOwnProperty.call(a, 'navigateTo')
      assert.ok(hasStatus !== hasNav, `${s} ${a.id}: must have exactly one of nextStatus|navigateTo`)
      if (hasStatus) {
        assert.ok(ORDER_STATUSES.includes(a.nextStatus), `${s} ${a.id}: bad nextStatus ${a.nextStatus}`)
      }
      if (hasNav) {
        assert.equal(typeof a.navigateTo, 'function', `${s} ${a.id}: navigateTo must be a function`)
      }
    }
  }
})

test('quickActionsForStatus — no duplicate ids within a status', () => {
  for (const s of ORDER_STATUSES) {
    const ids = quickActionsForStatus(s).map((a) => a.id)
    assert.equal(new Set(ids).size, ids.length, `status "${s}" has duplicate action ids`)
  }
})

// ─── visibility matrix ──────────────────────────────────────

const EXPECTED = {
  draft:      ['approve', 'edit', 'cancel'],
  booking:    ['approve', 'edit', 'cancel'],
  approved:   ['start-production', 'edit', 'hold'],
  production: ['mark-qc', 'edit'],
  qc:         ['schedule-dispatch', 'back-to-production'],
  dispatch:   ['mark-completed', 'generate-invoice'],
  completed:  ['record-payment', 'generate-invoice'],
  cancelled:  ['reopen'],
}

for (const [status, expectedIds] of Object.entries(EXPECTED)) {
  test(`visibility matrix — ${status} shows exactly ${expectedIds.join(', ')}`, () => {
    const actual = quickActionsForStatus(status).map((a) => a.id)
    assert.deepEqual(actual, expectedIds)
  })
}

test('isActionVisible — true positives', () => {
  assert.equal(isActionVisible('draft', 'approve'), true)
  assert.equal(isActionVisible('qc', 'schedule-dispatch'), true)
  assert.equal(isActionVisible('completed', 'record-payment'), true)
  assert.equal(isActionVisible('cancelled', 'reopen'), true)
})

test('isActionVisible — true negatives', () => {
  assert.equal(isActionVisible('draft', 'record-payment'), false)
  assert.equal(isActionVisible('production', 'cancel'), false)
  assert.equal(isActionVisible('completed', 'reopen'), false)
  assert.equal(isActionVisible('cancelled', 'approve'), false)
  assert.equal(isActionVisible('eternity', 'approve'), false)
})

// ─── navigateTo URL contracts ───────────────────────────────

test('navigateTo URLs include the order id', () => {
  const order = { id: 'ord-123' }
  for (const s of ORDER_STATUSES) {
    for (const a of quickActionsForStatus(s)) {
      if (a.navigateTo) {
        const url = a.navigateTo(order)
        assert.ok(typeof url === 'string' && url.length > 0, `${s} ${a.id}: empty URL`)
        assert.ok(url.includes('ord-123'), `${s} ${a.id}: URL "${url}" doesn't include order id`)
      }
    }
  }
})

// ─── workflow legality ─────────────────────────────────────

// The status flow MUST never let a cancellation come back via a single click;
// reopening goes through draft (a deliberate two-step recovery).
test('cancelled → reopen lands in draft (not directly back to production)', () => {
  const acts = quickActionsForStatus('cancelled')
  const reopen = acts.find((a) => a.id === 'reopen')
  assert.ok(reopen, 'cancelled status should have a reopen action')
  assert.equal(reopen.nextStatus, 'draft')
})

test('qc back-to-production lands in production (not qc)', () => {
  const acts = quickActionsForStatus('qc')
  const back = acts.find((a) => a.id === 'back-to-production')
  assert.ok(back)
  assert.equal(back.nextStatus, 'production')
})

test('every primary action exists exactly once per status', () => {
  for (const s of ORDER_STATUSES) {
    const primaries = quickActionsForStatus(s).filter((a) => a.variant === 'primary')
    assert.ok(primaries.length <= 1, `status "${s}" has ${primaries.length} primary actions; expected 0 or 1`)
  }
})
