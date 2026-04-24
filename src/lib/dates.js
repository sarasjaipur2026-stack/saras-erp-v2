/**
 * Timezone-aware date helpers. Business is IST (Asia/Kolkata, UTC+05:30).
 *
 * `new Date().toISOString().slice(0, 10)` returns the UTC date — between
 * 18:30 and 24:00 UTC (= 00:00 to 05:30 IST) this gives the previous day's
 * date, which silently off-by-one's payments, invoices, POs, jobwork logs,
 * etc. Use these helpers for any `date` (date-only) column so the
 * accounting day aligns with the operator's wall clock.
 *
 * Do NOT use these for `timestamptz` columns (created_at / updated_at) —
 * those stay in UTC via `new Date().toISOString()`; Postgres renders the
 * timezone correctly on display.
 */

const BUSINESS_TZ = 'Asia/Kolkata'

/**
 * Today's date in IST as ISO `YYYY-MM-DD`.
 * @param {Date} [now]  Optional reference instant (defaults to now).
 * @returns {string}
 */
export function todayIST(now = new Date()) {
  return toISTDate(now)
}

/**
 * Format any Date / ISO string to `YYYY-MM-DD` in IST.
 * @param {Date|string|number} d
 * @returns {string}  `YYYY-MM-DD` or '' when input is falsy/invalid.
 */
export function toISTDate(d) {
  if (!d) return ''
  const date = d instanceof Date ? d : new Date(d)
  if (!Number.isFinite(date.getTime())) return ''
  // en-CA uses ISO-style YYYY-MM-DD, with the formatter doing the TZ offset.
  return date.toLocaleDateString('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
}

/** First day of the current month in IST. */
export function firstOfMonthIST(now = new Date()) {
  const ist = toISTDate(now)            // '2026-04-24'
  return ist ? `${ist.slice(0, 7)}-01` : ''
}

/** Start of the current financial year in IST (Apr 1, rolling). */
export function startOfFYIST(now = new Date()) {
  const ist = toISTDate(now)            // '2026-04-24'
  if (!ist) return ''
  const [y, m] = ist.split('-').map(Number)
  const fyYear = m >= 4 ? y : y - 1
  return `${fyYear}-04-01`
}

/** Shift an IST date string by N days (positive = forward). */
export function addDaysIST(dateStr, days) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  // Use UTC Date math on the date-only values so we never cross a DST edge
  // (India has none, but this is future-proof and TZ-drift-safe).
  const t = Date.UTC(y, m - 1, d) + days * 24 * 60 * 60 * 1000
  const nd = new Date(t)
  const yy = nd.getUTCFullYear()
  const mm = String(nd.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(nd.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}
