/**
 * Integer-paise money helpers.
 *
 * Float rupees drift. (0.1 + 0.2 !== 0.3). Add 1000 rows of GST and you're ₹0.50
 * off on the grand total — the kind of mismatch that turns into a support ticket.
 *
 * Strategy: convert to paise (integers) at the edge, do arithmetic in integers,
 * convert back to rupees at the boundary. The DB column stays numeric(12,2) so
 * no schema change is needed; we just stop letting JS floats touch intermediate
 * sums.
 *
 * All helpers return plain `number`s in rupees at 2 decimal places, safe for
 * Postgres numeric(12,2) insertion.
 */

// ─── Core conversions ──────────────────────────────────────

/** Rupees (any fraction) → integer paise. Rounds half-away-from-zero. */
export const toPaise = (rupees) => {
  const n = Number(rupees);
  if (!Number.isFinite(n)) return 0;
  // `Math.round` on (n * 100) has binary-float rounding edge cases for values
  // like 1.005 — `+n.toFixed(2)` first collapses to a clean 2-decimal string,
  // then multiply and round.
  return Math.round(Number(n.toFixed(2)) * 100);
};

/** Integer paise → rupees (2 decimals). */
export const toRupees = (paise) => {
  const p = Math.round(Number(paise) || 0);
  return Math.round(p) / 100;
};

// ─── Money arithmetic (safe against float drift) ──────────

/** Sum an array of rupee values without float drift. */
export const sumMoney = (values) =>
  toRupees(
    (values || []).reduce((acc, v) => acc + toPaise(v), 0),
  );

/** amount * pct (e.g. apply a GST rate). */
export const percentOf = (amount, pct) => {
  const p = toPaise(amount);
  const rate = Number(pct) || 0;
  // Multiply then integer-divide by 100 on the paise scale.
  return toRupees(Math.round((p * rate) / 100));
};

/** Split a total into [cgst, sgst] halves; guarantees cgst + sgst === total to the paise. */
export const splitEvenly = (total) => {
  const p = toPaise(total);
  const half = Math.floor(p / 2);
  return [toRupees(half), toRupees(p - half)];
};

/** Multiply rupees by a quantity (qty can be fractional meters/kg, money stays clean). */
export const multiplyMoney = (rate, qty) => {
  const r = Number(rate) || 0;
  const q = Number(qty) || 0;
  return toRupees(Math.round(r * q * 100));
};

/** Subtract rupees cleanly: balance_due = grand_total - advance_paid. */
export const subtractMoney = (a, b) => toRupees(toPaise(a) - toPaise(b));

/** Clamp a rupee value to >= 0 (balances, payments — never negative in UI). */
export const clampNonNegative = (v) => {
  const r = Number(v);
  return Number.isFinite(r) && r > 0 ? toRupees(toPaise(r)) : 0;
};

/** Round a rupee value to 2dp via the integer-paise path (use for display-bound money). */
export const roundMoney = (v) => toRupees(toPaise(v));
