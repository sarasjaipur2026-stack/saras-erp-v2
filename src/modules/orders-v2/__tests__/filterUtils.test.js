import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  EMPTY_FILTERS,
  ORDER_STATUSES,
  parseFiltersFromURL,
  serializeFiltersToURL,
  cacheKey,
  dateRangeFromPreset,
  matchesFilter,
  filtersToListPagedArgs,
} from '../hooks/filterUtils.js'

// ─── parseFiltersFromURL ─────────────────────────────────────

test('parseFiltersFromURL — empty input → defaults', () => {
  assert.deepEqual(parseFiltersFromURL(''),         { ...EMPTY_FILTERS })
  assert.deepEqual(parseFiltersFromURL(null),       { ...EMPTY_FILTERS })
  assert.deepEqual(parseFiltersFromURL(undefined),  { ...EMPTY_FILTERS })
  assert.deepEqual(parseFiltersFromURL(new URLSearchParams()), { ...EMPTY_FILTERS })
})

test('parseFiltersFromURL — single status', () => {
  const f = parseFiltersFromURL('status=booking')
  assert.equal(f.status, 'booking')
})

test('parseFiltersFromURL — multi status comma list', () => {
  const f = parseFiltersFromURL('status=booking,approved,production')
  assert.equal(f.status, 'booking,approved,production')
})

test('parseFiltersFromURL — drops unknown status values', () => {
  const f = parseFiltersFromURL('status=booking,bogus,approved')
  assert.equal(f.status, 'booking,approved')
})

test('parseFiltersFromURL — all-bogus status falls back to "all"', () => {
  const f = parseFiltersFromURL('status=bogus1,bogus2')
  assert.equal(f.status, 'all')
})

test('parseFiltersFromURL — date preset + q + saved', () => {
  const f = parseFiltersFromURL('status=approved&date=week&q=sharma&saved=my_approvals')
  assert.equal(f.status, 'approved')
  assert.equal(f.date, 'week')
  assert.equal(f.q, 'sharma')
  assert.equal(f.saved, 'my_approvals')
})

test('parseFiltersFromURL — custom date range', () => {
  const f = parseFiltersFromURL('date=custom&from=2026-05-01T00:00:00Z&to=2026-05-08T23:59:59Z')
  assert.equal(f.date, 'custom')
  assert.equal(f.dateFrom, '2026-05-01T00:00:00Z')
  assert.equal(f.dateTo,   '2026-05-08T23:59:59Z')
})

test('parseFiltersFromURL — from/to ignored when date != custom', () => {
  const f = parseFiltersFromURL('date=week&from=2026-05-01T00:00:00Z')
  assert.equal(f.date, 'week')
  assert.equal(f.dateFrom, null)
})

test('parseFiltersFromURL — bad date preset falls back to "all"', () => {
  const f = parseFiltersFromURL('date=eternity')
  assert.equal(f.date, 'all')
})

test('parseFiltersFromURL — page + pageSize parsed', () => {
  const f = parseFiltersFromURL('page=4&pageSize=100')
  assert.equal(f.page, 4)
  assert.equal(f.pageSize, 100)
})

test('parseFiltersFromURL — negative page clamped to default 0', () => {
  const f = parseFiltersFromURL('page=-3')
  assert.equal(f.page, 0)
})

test('parseFiltersFromURL — pageSize > 200 clamped to default', () => {
  const f = parseFiltersFromURL('pageSize=99999')
  assert.equal(f.pageSize, EMPTY_FILTERS.pageSize)
})

test('parseFiltersFromURL — q capped at 100 chars', () => {
  const long = 'x'.repeat(500)
  const f = parseFiltersFromURL(`q=${long}`)
  assert.equal(f.q.length, 100)
})

test('parseFiltersFromURL — unknown keys ignored, do not throw', () => {
  const f = parseFiltersFromURL('weird=value&__proto__=evil&page=2')
  assert.equal(f.page, 2)
  // No prototype pollution
  assert.equal(Object.prototype.hasOwnProperty.call(f, 'weird'), false)
})

// ─── serializeFiltersToURL ───────────────────────────────────

test('serializeFiltersToURL — empty filters → empty query', () => {
  const p = serializeFiltersToURL({ ...EMPTY_FILTERS })
  assert.equal(p.toString(), '')
})

test('serializeFiltersToURL — all defaults stripped from URL', () => {
  const p = serializeFiltersToURL({
    ...EMPTY_FILTERS,
    status: 'all',
    date: 'all',
    page: 0,
    pageSize: 50,
  })
  assert.equal(p.toString(), '')
})

test('serializeFiltersToURL — single status round-trips', () => {
  const out = serializeFiltersToURL({ ...EMPTY_FILTERS, status: 'booking' }).toString()
  assert.equal(out, 'status=booking')
})

test('serializeFiltersToURL — multi status round-trips', () => {
  const out = serializeFiltersToURL({ ...EMPTY_FILTERS, status: 'booking,approved' }).toString()
  assert.equal(out, 'status=booking%2Capproved') // URLSearchParams encodes ','
})

test('serializeFiltersToURL — custom date with from/to', () => {
  const out = serializeFiltersToURL({
    ...EMPTY_FILTERS,
    date: 'custom',
    dateFrom: '2026-05-01T00:00:00Z',
    dateTo:   '2026-05-08T23:59:59Z',
  }).toString()
  // Order in URLSearchParams is insertion order — date first, then from, then to
  assert.match(out, /date=custom/)
  assert.match(out, /from=2026-05-01T00%3A00%3A00Z/)
  assert.match(out, /to=2026-05-08T23%3A59%3A59Z/)
})

// ─── round-trip ──────────────────────────────────────────────

test('URL round-trip — multi-status + week + q + saved', () => {
  const input = 'status=booking%2Capproved&date=week&q=sharma&saved=my_approvals'
  const f = parseFiltersFromURL(input)
  const out = serializeFiltersToURL(f).toString()
  // Same key set, same values (just possibly different ordering)
  const reparsed = parseFiltersFromURL(out)
  assert.deepEqual(reparsed, f)
})

test('URL round-trip — custom date range', () => {
  const f = parseFiltersFromURL('date=custom&from=2026-05-01T00:00:00Z&to=2026-05-08T23:59:59Z')
  const reparsed = parseFiltersFromURL(serializeFiltersToURL(f))
  assert.deepEqual(reparsed, f)
})

// ─── cacheKey ────────────────────────────────────────────────

test('cacheKey — same filters → same key regardless of property insertion order', () => {
  const a = cacheKey({ status: 'booking', date: 'week', q: 'x', page: 0, pageSize: 50, nature: 'all', saved: null, dateFrom: null, dateTo: null })
  const b = cacheKey({ pageSize: 50, page: 0, saved: null, status: 'booking', q: 'x', nature: 'all', dateFrom: null, date: 'week', dateTo: null })
  assert.equal(a, b)
})

test('cacheKey — different filters → different keys', () => {
  const a = cacheKey({ ...EMPTY_FILTERS, status: 'booking' })
  const b = cacheKey({ ...EMPTY_FILTERS, status: 'approved' })
  assert.notEqual(a, b)
})

test('cacheKey — empty + null produces a stable string', () => {
  const k = cacheKey({})
  assert.equal(typeof k, 'string')
  assert.ok(k.startsWith('orders:'))
})

// ─── dateRangeFromPreset ─────────────────────────────────────

test('dateRangeFromPreset — today returns 24h window for given now', () => {
  const now = new Date('2026-05-11T14:30:00Z')
  const { from, to } = dateRangeFromPreset('today', now)
  assert.ok(from && to)
  // from < now < to
  assert.ok(from < now.toISOString())
  assert.ok(to > now.toISOString())
})

test('dateRangeFromPreset — week returns ~7 day window', () => {
  const now = new Date('2026-05-11T00:00:00Z')
  const { from, to } = dateRangeFromPreset('week', now)
  const fromMs = new Date(from).getTime()
  const toMs = new Date(to).getTime()
  const diffDays = (toMs - fromMs) / 86_400_000
  assert.ok(diffDays >= 6.9 && diffDays <= 7.1, `expected ~7 days, got ${diffDays}`)
})

test('dateRangeFromPreset — "all" returns nulls', () => {
  const { from, to } = dateRangeFromPreset('all')
  assert.equal(from, null)
  assert.equal(to, null)
})

test('dateRangeFromPreset — unknown preset → nulls (safe fallback)', () => {
  const { from, to } = dateRangeFromPreset('eternity')
  assert.equal(from, null)
  assert.equal(to, null)
})

// ─── matchesFilter ───────────────────────────────────────────

test('matchesFilter — null row → false', () => {
  assert.equal(matchesFilter(null, EMPTY_FILTERS), false)
})

test('matchesFilter — defaults match anything', () => {
  const row = { id: '1', status: 'booking', order_number: 'ORD-001', customers: { firm_name: 'Test' }, created_at: '2026-05-11T00:00:00Z' }
  assert.equal(matchesFilter(row, EMPTY_FILTERS), true)
})

test('matchesFilter — multi-status filter includes', () => {
  const row = { status: 'approved' }
  assert.equal(matchesFilter(row, { ...EMPTY_FILTERS, status: 'booking,approved' }), true)
})

test('matchesFilter — multi-status filter excludes', () => {
  const row = { status: 'completed' }
  assert.equal(matchesFilter(row, { ...EMPTY_FILTERS, status: 'booking,approved' }), false)
})

test('matchesFilter — q matches order_number', () => {
  const row = { status: 'booking', order_number: 'ORD-2425-0047', customers: {} }
  assert.equal(matchesFilter(row, { ...EMPTY_FILTERS, q: '0047' }), true)
})

test('matchesFilter — q matches customer firm_name (case-insensitive)', () => {
  const row = { status: 'booking', customers: { firm_name: 'SHARMA Textiles' } }
  assert.equal(matchesFilter(row, { ...EMPTY_FILTERS, q: 'sharma' }), true)
})

test('matchesFilter — q non-match excludes', () => {
  const row = { status: 'booking', order_number: 'ORD-2425-0047', customers: { firm_name: 'Patel' } }
  assert.equal(matchesFilter(row, { ...EMPTY_FILTERS, q: 'sharma' }), false)
})

test('matchesFilter — custom date window includes/excludes correctly', () => {
  const row = { status: 'booking', created_at: '2026-05-05T12:00:00Z' }
  assert.equal(matchesFilter(row, { ...EMPTY_FILTERS, date: 'custom', dateFrom: '2026-05-01T00:00:00Z', dateTo: '2026-05-08T23:59:59Z' }), true)
  assert.equal(matchesFilter(row, { ...EMPTY_FILTERS, date: 'custom', dateFrom: '2026-05-06T00:00:00Z' }), false)
})

// ─── filtersToListPagedArgs ─────────────────────────────────

test('filtersToListPagedArgs — defaults', () => {
  const args = filtersToListPagedArgs({ ...EMPTY_FILTERS })
  assert.deepEqual(args, { page: 0, pageSize: 50 })
})

test('filtersToListPagedArgs — single status pushes down', () => {
  const args = filtersToListPagedArgs({ ...EMPTY_FILTERS, status: 'booking' })
  assert.equal(args.status, 'booking')
})

test('filtersToListPagedArgs — multi-status does NOT push down (client filters)', () => {
  const args = filtersToListPagedArgs({ ...EMPTY_FILTERS, status: 'booking,approved' })
  assert.equal(args.status, undefined)
})

test('filtersToListPagedArgs — date preset → dateFrom/dateTo', () => {
  const args = filtersToListPagedArgs({ ...EMPTY_FILTERS, date: 'today' })
  assert.ok(args.dateFrom)
  assert.ok(args.dateTo)
})

test('filtersToListPagedArgs — q → customerTerm (trimmed)', () => {
  const args = filtersToListPagedArgs({ ...EMPTY_FILTERS, q: '  sharma  ' })
  assert.equal(args.customerTerm, 'sharma')
})

// ─── boundaries / regression ─────────────────────────────────

test('predicate boundary — 0 rows passes empty', () => {
  const rows = []
  const filtered = rows.filter((r) => matchesFilter(r, EMPTY_FILTERS))
  assert.equal(filtered.length, 0)
})

test('predicate boundary — 50+ rows with mixed statuses', () => {
  const rows = []
  for (let i = 0; i < 60; i++) {
    rows.push({
      id: String(i),
      status: ORDER_STATUSES[i % ORDER_STATUSES.length],
      order_number: `ORD-${i}`,
      customers: { firm_name: i % 2 ? 'Sharma' : 'Patel' },
      created_at: '2026-05-11T00:00:00Z',
    })
  }
  // Multi-status filter — booking or approved
  const filtered = rows.filter((r) => matchesFilter(r, { ...EMPTY_FILTERS, status: 'booking,approved' }))
  // 60 rows / 8 statuses by i%8: status[1] booking i={1,9,…,57}=8, status[2] approved i={2,10,…,58}=8.
  assert.equal(filtered.length, 16)
})

test('predicate boundary — q + status combined', () => {
  const rows = [
    { status: 'booking',  customers: { firm_name: 'Sharma' }, order_number: 'A' },
    { status: 'approved', customers: { firm_name: 'Sharma' }, order_number: 'B' },
    { status: 'booking',  customers: { firm_name: 'Patel' },  order_number: 'C' },
  ]
  const filtered = rows.filter((r) => matchesFilter(r, { ...EMPTY_FILTERS, status: 'booking', q: 'sharma' }))
  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].order_number, 'A')
})
