/**
 * Tender validation rules.
 * Spec: docs/specs/2026-04-28-pos-system-design.md §6, §8
 */

const PENNY = 0.01

/**
 * Validate that a tender list satisfies the bill total + customer-type rules.
 *
 * @param {Array} tenders [{ tender_type, amount, reference }]
 * @param {number} billTotal grand_total of the bill
 * @param {{ id?: string }|null} customer null = walk-in; truthy = registered
 * @returns {{ ok: boolean, errors: string[], paidTotal: number, delta: number }}
 */
export function validateTenders(tenders, billTotal, customer) {
  const errors = []
  const list = Array.isArray(tenders) ? tenders : []

  if (list.length === 0) {
    errors.push('Add at least one tender')
  }

  let paidTotal = 0
  for (const [i, t] of list.entries()) {
    const amt = Number(t.amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      errors.push(`Tender ${i + 1}: amount must be > 0`)
      continue
    }
    paidTotal += amt
    if (!['cash', 'upi', 'card', 'account'].includes(t.tender_type)) {
      errors.push(`Tender ${i + 1}: unknown type "${t.tender_type}"`)
    }
    if (t.tender_type === 'account' && !customer?.id) {
      errors.push(`On-account tender requires a registered customer (currently walk-in)`)
    }
    if ((t.tender_type === 'upi' || t.tender_type === 'card') && !t.reference) {
      // Soft requirement — UPI/card without reference is allowed but encouraged
    }
  }

  const delta = round2(paidTotal - Number(billTotal))
  if (Math.abs(delta) >= PENNY) {
    if (delta > 0) errors.push(`Tendered ₹${delta.toFixed(2)} more than bill (₹${Number(billTotal).toFixed(2)})`)
    else errors.push(`Short ₹${Math.abs(delta).toFixed(2)} of bill total (₹${Number(billTotal).toFixed(2)})`)
  }

  return {
    ok: errors.length === 0,
    errors,
    paidTotal: round2(paidTotal),
    delta,
  }
}

function round2(n) {
  return Math.round(n * 100) / 100
}
