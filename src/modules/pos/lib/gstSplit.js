/**
 * GST split helper for POS line items.
 *
 * Logic mirrors existing order/invoice flow:
 *   - same state (our state code === customer state code) → CGST + SGST
 *     each at half the GST rate
 *   - different state OR customer has no state code → IGST at full rate
 *   - walk-in (no customer) → treat as same-state cash sale, default to
 *     intra-state CGST/SGST split
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §6
 */

/**
 * Compute taxes for one line.
 * @param {object} line { qty, rate, discount_pct, discount_amt, gst_rate }
 * @param {boolean} interState true → IGST; false → CGST+SGST
 * @returns {{ taxable, cgst, sgst, igst, total }}
 */
export function computeLineGst(line, interState) {
  const qty = Number(line.qty) || 0
  const rate = Number(line.rate) || 0
  const discountPct = Number(line.discount_pct) || 0
  const discountAmt = Number(line.discount_amt) || 0
  const gstRate = Number(line.gst_rate) || 0

  const gross = qty * rate
  const pctOff = gross * (discountPct / 100)
  const taxable = Math.max(0, gross - pctOff - discountAmt)

  let cgst = 0, sgst = 0, igst = 0
  if (interState) {
    igst = taxable * (gstRate / 100)
  } else {
    const half = taxable * (gstRate / 200)
    cgst = half
    sgst = half
  }
  const total = taxable + cgst + sgst + igst
  return {
    taxable: round2(taxable),
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    total: round2(total),
  }
}

/**
 * Compute totals for the whole cart.
 * @param {Array} lines cart line array
 * @param {string|null} customerStateCode 2-char state code, or null/undefined for walk-in
 * @param {string} ourStateCode  state code where we ship from (default Rajasthan = '08')
 * @returns {{ lines, subtotal, cgst_amount, sgst_amount, igst_amount, total_tax, grand_total, interState }}
 */
export function computeCartGst(lines, customerStateCode, ourStateCode = '08') {
  const interState = !!customerStateCode && String(customerStateCode).trim() !== '' && String(customerStateCode) !== String(ourStateCode)

  let subtotal = 0, cgst = 0, sgst = 0, igst = 0
  const out = lines.map((line) => {
    const t = computeLineGst(line, interState)
    subtotal += t.taxable
    cgst += t.cgst
    sgst += t.sgst
    igst += t.igst
    return {
      ...line,
      taxable_amount: t.taxable,
      cgst_amount: t.cgst,
      sgst_amount: t.sgst,
      igst_amount: t.igst,
      line_total: t.total,
    }
  })

  return {
    lines: out,
    subtotal: round2(subtotal),
    cgst_amount: round2(cgst),
    sgst_amount: round2(sgst),
    igst_amount: round2(igst),
    total_tax: round2(cgst + sgst + igst),
    grand_total: round2(subtotal + cgst + sgst + igst),
    interState,
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}
