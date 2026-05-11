import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  SAVED_SEARCH_CAP,
  normalizeEntry,
  upsertEntry,
  removeEntry,
  sanitiseList,
} from '../../../lib/db/_savedSearchOps.js'

// ─── normalizeEntry ──────────────────────────────────────────

test('normalizeEntry — null/undefined returns null', () => {
  assert.equal(normalizeEntry(null), null)
  assert.equal(normalizeEntry(undefined), null)
})

test('normalizeEntry — non-object returns null', () => {
  assert.equal(normalizeEntry('string'), null)
  assert.equal(normalizeEntry(42), null)
})

test('normalizeEntry — empty/whitespace name returns null', () => {
  assert.equal(normalizeEntry({ name: '' }), null)
  assert.equal(normalizeEntry({ name: '   ' }), null)
})

test('normalizeEntry — name trimmed + capped at 48 chars', () => {
  const e = normalizeEntry({ name: '  ' + 'x'.repeat(100) + '  ' })
  assert.equal(e.name.length, 48)
})

test('normalizeEntry — default params is empty object', () => {
  const e = normalizeEntry({ name: 'foo' })
  assert.deepEqual(e.params, {})
})

test('normalizeEntry — primitive params kept as strings', () => {
  const e = normalizeEntry({
    name: 'foo',
    params: { status: 'booking', page: 3, urgent: true },
  })
  assert.deepEqual(e.params, { status: 'booking', page: '3', urgent: 'true' })
})

test('normalizeEntry — null/undefined/object param values dropped', () => {
  const e = normalizeEntry({
    name: 'foo',
    params: { ok: 'yes', skip1: null, skip2: undefined, skip3: { nested: true } },
  })
  assert.deepEqual(e.params, { ok: 'yes' })
})

// ─── upsertEntry ─────────────────────────────────────────────

test('upsertEntry — empty list → single entry', () => {
  const out = upsertEntry([], { name: 'first', params: { status: 'booking' } })
  assert.equal(out.length, 1)
  assert.equal(out[0].name, 'first')
})

test('upsertEntry — null list treated as empty', () => {
  const out = upsertEntry(null, { name: 'first' })
  assert.equal(out.length, 1)
})

test('upsertEntry — invalid entry returns original list unchanged', () => {
  const list = [{ name: 'a', params: {} }]
  const out = upsertEntry(list, null)
  assert.deepEqual(out, list)
  assert.notEqual(out, list, 'should return a copy, not the same reference')
})

test('upsertEntry — replaces entry with same name', () => {
  const list = [{ name: 'recent', params: { status: 'booking' } }]
  const out = upsertEntry(list, { name: 'recent', params: { status: 'approved' } })
  assert.equal(out.length, 1)
  assert.equal(out[0].params.status, 'approved')
})

test('upsertEntry — appends new name', () => {
  const list = [{ name: 'a', params: {} }, { name: 'b', params: {} }]
  const out = upsertEntry(list, { name: 'c', params: { q: 'sharma' } })
  assert.equal(out.length, 3)
  assert.equal(out[2].name, 'c')
})

test('upsertEntry — enforces cap by dropping oldest', () => {
  const list = []
  for (let i = 0; i < SAVED_SEARCH_CAP; i++) list.push({ name: `s${i}`, params: {} })
  const out = upsertEntry(list, { name: 'overflow', params: {} })
  assert.equal(out.length, SAVED_SEARCH_CAP)
  // First entry (oldest) dropped
  assert.equal(out.find((e) => e.name === 's0'), undefined)
  // New entry kept
  assert.equal(out[out.length - 1].name, 'overflow')
})

test('upsertEntry — custom cap respected', () => {
  const list = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
  const out = upsertEntry(list, { name: 'd' }, 2)
  assert.equal(out.length, 2)
  // Newest 2 retained
  assert.equal(out[0].name, 'c')
  assert.equal(out[1].name, 'd')
})

// ─── removeEntry ─────────────────────────────────────────────

test('removeEntry — present name removed', () => {
  const list = [{ name: 'a' }, { name: 'b' }, { name: 'c' }]
  const out = removeEntry(list, 'b')
  assert.equal(out.length, 2)
  assert.equal(out.find((e) => e.name === 'b'), undefined)
})

test('removeEntry — absent name is no-op', () => {
  const list = [{ name: 'a' }, { name: 'b' }]
  const out = removeEntry(list, 'missing')
  assert.deepEqual(out, list)
})

test('removeEntry — invalid name returns copy of list', () => {
  const list = [{ name: 'a' }]
  const out = removeEntry(list, '')
  assert.deepEqual(out, list)
  assert.notEqual(out, list)
})

test('removeEntry — non-array input returns empty array', () => {
  assert.deepEqual(removeEntry(null, 'a'), [])
  assert.deepEqual(removeEntry(undefined, 'a'), [])
  assert.deepEqual(removeEntry('not-array', 'a'), [])
})

// ─── sanitiseList ────────────────────────────────────────────

test('sanitiseList — drops invalid entries', () => {
  const dirty = [
    { name: 'good', params: { status: 'booking' } },
    null,
    'bogus',
    { name: '' },
    { name: 'also-good', params: {} },
  ]
  const clean = sanitiseList(dirty)
  assert.equal(clean.length, 2)
  assert.equal(clean[0].name, 'good')
  assert.equal(clean[1].name, 'also-good')
})

test('sanitiseList — non-array returns []', () => {
  assert.deepEqual(sanitiseList(null), [])
  assert.deepEqual(sanitiseList(undefined), [])
  assert.deepEqual(sanitiseList('whatever'), [])
})

test('sanitiseList — round-trip preserves clean entries', () => {
  const input = [{ name: 'a', params: { q: 'sharma' } }, { name: 'b', params: { status: 'booking' } }]
  const out = sanitiseList(input)
  assert.deepEqual(out, input)
})

// ─── integration — saved-search workflow ─────────────────────

test('workflow — save → save same name → remove → save', () => {
  let list = []
  list = upsertEntry(list, { name: 'my_approvals', params: { status: 'approved' } })
  assert.equal(list.length, 1)

  // Save with same name should replace, not duplicate
  list = upsertEntry(list, { name: 'my_approvals', params: { status: 'approved,production' } })
  assert.equal(list.length, 1)
  assert.equal(list[0].params.status, 'approved,production')

  // Remove
  list = removeEntry(list, 'my_approvals')
  assert.equal(list.length, 0)

  // Save again — different params
  list = upsertEntry(list, { name: 'my_approvals', params: { status: 'production' } })
  assert.equal(list.length, 1)
  assert.equal(list[0].params.status, 'production')
})
