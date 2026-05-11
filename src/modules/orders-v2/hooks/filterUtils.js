/**
 * Pure helpers for the Orders V2 list — URL serde, filter predicate, cache key,
 * and listPaged argument translation. No React, no Supabase — testable in
 * isolation under `node --test`.
 *
 * Filter shape:
 *   {
 *     status:    'all' | comma-list of ORDER_STATUSES,
 *     date:      'all' | 'today' | 'week' | 'month' | 'custom',
 *     dateFrom:  ISO string or null (only when date === 'custom'),
 *     dateTo:    ISO string or null (only when date === 'custom'),
 *     q:         search term (customer firm/contact/order#),
 *     nature:    'all' | order-nature string,
 *     saved:     name of a saved search (UI-only marker; params load over top),
 *     page:      0-based page number,
 *     pageSize:  rows per page (cap 200),
 *   }
 */

export const ORDER_STATUSES = [
  'draft', 'booking', 'approved', 'production', 'qc', 'dispatch', 'completed', 'cancelled',
]

export const DATE_PRESETS = ['today', 'week', 'month', 'all', 'custom']

export const EMPTY_FILTERS = Object.freeze({
  status: 'all',
  date: 'all',
  dateFrom: null,
  dateTo: null,
  q: '',
  nature: 'all',
  saved: null,
  page: 0,
  pageSize: 50,
})

const MAX_Q_LEN = 100
const MAX_NATURE_LEN = 32
const MAX_SAVED_LEN = 64
const MAX_PAGE = 10_000
const MAX_PAGE_SIZE = 200

/**
 * Parse URL search params → filter object. Unknown keys ignored. Bad values
 * fall back to defaults rather than throwing — never let a malformed bookmark
 * crash the page.
 *
 * @param {URLSearchParams | string | null | undefined} input
 * @returns {object}
 */
export function parseFiltersFromURL(input) {
  const p = input instanceof URLSearchParams
    ? input
    : new URLSearchParams(typeof input === 'string' ? input : '')

  const out = { ...EMPTY_FILTERS }

  const statusRaw = (p.get('status') || '').trim()
  if (statusRaw && statusRaw !== 'all') {
    const list = statusRaw.split(',').map((s) => s.trim()).filter((s) => ORDER_STATUSES.includes(s))
    out.status = list.length ? list.join(',') : 'all'
  }

  const dateRaw = (p.get('date') || '').trim()
  if (dateRaw && DATE_PRESETS.includes(dateRaw)) out.date = dateRaw

  if (out.date === 'custom') {
    const from = p.get('from')
    const to = p.get('to')
    if (from) out.dateFrom = from
    if (to) out.dateTo = to
  }

  const q = p.get('q')
  if (q) out.q = q.slice(0, MAX_Q_LEN)

  const nature = p.get('nature')
  if (nature && nature !== 'all') out.nature = nature.slice(0, MAX_NATURE_LEN)

  const saved = p.get('saved')
  if (saved) out.saved = saved.slice(0, MAX_SAVED_LEN)

  const pageNum = Number.parseInt(p.get('page') || '', 10)
  if (Number.isFinite(pageNum) && pageNum >= 0 && pageNum < MAX_PAGE) out.page = pageNum

  const psNum = Number.parseInt(p.get('pageSize') || '', 10)
  if (Number.isFinite(psNum) && psNum > 0 && psNum <= MAX_PAGE_SIZE) out.pageSize = psNum

  return out
}

/**
 * Serialize filters → URLSearchParams. Default/empty keys are stripped so the
 * URL stays clean (`/orders` vs `/orders?status=all&date=all&page=0`).
 *
 * @param {object} filters
 * @returns {URLSearchParams}
 */
export function serializeFiltersToURL(filters) {
  const p = new URLSearchParams()
  if (!filters) return p

  if (filters.status && filters.status !== 'all') p.set('status', filters.status)
  if (filters.date && filters.date !== 'all') p.set('date', filters.date)
  if (filters.date === 'custom' && filters.dateFrom) p.set('from', filters.dateFrom)
  if (filters.date === 'custom' && filters.dateTo) p.set('to', filters.dateTo)
  if (filters.q) p.set('q', filters.q)
  if (filters.nature && filters.nature !== 'all') p.set('nature', filters.nature)
  if (filters.saved) p.set('saved', filters.saved)
  if (filters.page && filters.page > 0) p.set('page', String(filters.page))
  if (filters.pageSize && filters.pageSize !== EMPTY_FILTERS.pageSize) {
    p.set('pageSize', String(filters.pageSize))
  }
  return p
}

/**
 * Deterministic cache key for `useSWRList` — same filters always produce the
 * same string regardless of insertion order.
 *
 * @param {object} filters
 * @returns {string}
 */
export function cacheKey(filters) {
  const ordered = {
    status:   filters?.status   ?? EMPTY_FILTERS.status,
    date:     filters?.date     ?? EMPTY_FILTERS.date,
    dateFrom: filters?.dateFrom ?? null,
    dateTo:   filters?.dateTo   ?? null,
    q:        filters?.q        ?? '',
    nature:   filters?.nature   ?? EMPTY_FILTERS.nature,
    saved:    filters?.saved    ?? null,
    page:     filters?.page     ?? 0,
    pageSize: filters?.pageSize ?? EMPTY_FILTERS.pageSize,
  }
  return `orders:${JSON.stringify(ordered)}`
}

const MS_PER_DAY = 86_400_000

/**
 * Compute concrete {from, to} window for a date preset. Returns nulls when
 * the preset is 'all' or unrecognised.
 *
 * @param {string} preset
 * @param {Date} [now]
 * @returns {{ from: string|null, to: string|null }}
 */
export function dateRangeFromPreset(preset, now = new Date()) {
  const d = new Date(now)
  d.setHours(0, 0, 0, 0)
  const startOfToday = d.getTime()
  const endOfToday = startOfToday + MS_PER_DAY - 1

  if (preset === 'today') {
    return {
      from: new Date(startOfToday).toISOString(),
      to:   new Date(endOfToday).toISOString(),
    }
  }
  if (preset === 'week') {
    return {
      from: new Date(startOfToday - 6 * MS_PER_DAY).toISOString(),
      to:   new Date(endOfToday).toISOString(),
    }
  }
  if (preset === 'month') {
    return {
      from: new Date(startOfToday - 29 * MS_PER_DAY).toISOString(),
      to:   new Date(endOfToday).toISOString(),
    }
  }
  return { from: null, to: null }
}

/**
 * Predicate: does a row pass the current filter set? Used for client-side
 * narrowing when we fetched a broader set than is currently displayed (e.g.
 * multi-status — server pushes down at most one status, client filters down).
 *
 * @param {object} row
 * @param {object} filters
 * @returns {boolean}
 */
export function matchesFilter(row, filters) {
  if (!row || !filters) return false

  if (filters.status && filters.status !== 'all') {
    const allowed = filters.status.split(',').map((s) => s.trim()).filter(Boolean)
    if (allowed.length && !allowed.includes(row.status)) return false
  }

  if (filters.nature && filters.nature !== 'all' && row.nature !== filters.nature) return false

  if (filters.q && filters.q.trim()) {
    const needle = filters.q.toLowerCase()
    const hay = [
      row.order_number || '',
      row.customers?.firm_name || '',
      row.customers?.contact_name || '',
    ].join(' ').toLowerCase()
    if (!hay.includes(needle)) return false
  }

  if (filters.date === 'custom') {
    if (filters.dateFrom && row.created_at < filters.dateFrom) return false
    if (filters.dateTo && row.created_at > filters.dateTo) return false
  } else if (filters.date && filters.date !== 'all') {
    const { from, to } = dateRangeFromPreset(filters.date)
    if (from && row.created_at < from) return false
    if (to && row.created_at > to) return false
  }

  return true
}

/**
 * Translate filters → arguments accepted by `ordersDb.listPaged`. The server
 * push-down handles single-status, date range, and customerTerm; multi-status
 * is left for client-side predicate filtering.
 *
 * @param {object} filters
 * @returns {object}
 */
export function filtersToListPagedArgs(filters) {
  const args = {
    page: Number.isFinite(filters?.page) ? filters.page : 0,
    pageSize: Number.isFinite(filters?.pageSize) ? filters.pageSize : EMPTY_FILTERS.pageSize,
  }

  const list = (filters?.status && filters.status !== 'all')
    ? filters.status.split(',').map((s) => s.trim()).filter(Boolean)
    : []
  if (list.length === 1) args.status = list[0]

  if (filters?.date === 'custom') {
    if (filters.dateFrom) args.dateFrom = filters.dateFrom
    if (filters.dateTo) args.dateTo = filters.dateTo
  } else if (filters?.date && filters.date !== 'all') {
    const { from, to } = dateRangeFromPreset(filters.date)
    if (from) args.dateFrom = from
    if (to) args.dateTo = to
  }

  if (filters?.q && filters.q.trim()) args.customerTerm = filters.q.trim()

  return args
}
