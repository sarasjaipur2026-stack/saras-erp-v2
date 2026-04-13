/**
 * Shared formatting helpers for the SARAS ERP UI.
 * Centralised here to avoid duplicating identical definitions across 10+ page modules.
 */

/** Format a number with Indian locale grouping (e.g. 1,23,456.78) */
export const fmt = (v, maxDecimals = 3) =>
  Number.isFinite(+v)
    ? Number(v).toLocaleString('en-IN', { maximumFractionDigits: maxDecimals })
    : '—';

/** Format as Indian Rupee string: ₹1,23,456.78 */
export const fmtMoney = (v) =>
  Number.isFinite(+v)
    ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
    : '—';

/** Format an integer with Indian locale grouping */
export const fmtInt = (v) =>
  Number.isFinite(+v) ? Math.round(Number(v)).toLocaleString('en-IN') : '—';

/** Format a date to short Indian locale: "10 Apr '26" */
export const fmtDate = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
    : '—';

/** Format a date without year: "10 Apr" */
export const fmtDateShort = (d) =>
  d
    ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    : '—';
