/**
 * Pure helpers backing `useOrderWizard`.
 *
 * Kept here (no React import) so the math + validation + save-payload
 * transforms can be unit-tested under `node --test` without any React
 * runtime.
 *
 * Contract notes:
 *   - Discount is applied BEFORE GST (per legacy form behaviour).
 *   - Charges are added AFTER GST (freight / packing aren't taxable here).
 *   - All numeric inputs are coerced via Number(...) || 0, clamped where
 *     it matters (discountPct 0–100), so callers can pass strings straight
 *     from <input type="number">.
 */

const safeNum = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

const clampPct = (v) => {
  const n = safeNum(v)
  if (n < 0) return 0
  if (n > 100) return 100
  return n
}

/**
 * Compute the per-line breakdown.
 *
 * @param {{qty: any, rate: any, discountPct?: any, gstRate?: any}} line
 * @returns {{gross: number, discount: number, taxable: number, gst: number, net: number}}
 */
export function computeLineNet(line) {
  const qty = safeNum(line?.qty)
  const rate = safeNum(line?.rate)
  const gross = qty * rate
  const discount = (gross * clampPct(line?.discountPct)) / 100
  const taxable = gross - discount
  const gstRate = safeNum(line?.gstRate)
  const gst = (taxable * gstRate) / 100
  const net = taxable + gst
  return { gross, discount, taxable, gst, net }
}

/**
 * Aggregate totals across all lines + charges.
 *
 * @param {Array} lines
 * @param {Array} charges
 * @returns {{subtotal: number, discount: number, taxable: number, gst: number, charges: number, grand: number}}
 */
export function computeTotals(lines = [], charges = []) {
  let subtotal = 0
  let discount = 0
  let taxable = 0
  let gst = 0
  for (const l of lines) {
    const n = computeLineNet(l)
    subtotal += n.gross
    discount += n.discount
    taxable += n.taxable
    gst += n.gst
  }
  const chargesTotal = charges.reduce((a, c) => a + safeNum(c?.amount), 0)
  const grand = taxable + gst + chargesTotal
  return { subtotal, discount, taxable, gst, charges: chargesTotal, grand }
}

/**
 * Validate the form. A line is valid when product + qty>0 + rate>0.
 *
 * @param {object} form
 * @returns {{errors: Record<string, string>, isValid: boolean, validLineCount: number}}
 */
export function validateForm(form) {
  const errors = {}
  if (!form?.customerId) errors.customerId = 'Customer is required'
  const validLines = (form?.lines || []).filter(
    (l) => l?.productId && safeNum(l.qty) > 0 && safeNum(l.rate) > 0,
  )
  if (validLines.length === 0) {
    errors.lines = 'At least one line with product, qty, and rate is required'
  }
  return {
    errors,
    isValid: Object.keys(errors).length === 0,
    validLineCount: validLines.length,
  }
}

/**
 * Resolve the on-save gst_type. 'auto' looks at customer.state_code:
 *   '08' (Rajasthan, RPK Industries' home) → intra_state
 *   anything else                          → inter_state
 *   no customer / no state_code            → inter_state (safer default)
 */
export function resolveGstType(formGstType, customer) {
  if (formGstType && formGstType !== 'auto') return formGstType
  const stateCode = customer?.state_code
  return stateCode === '08' ? 'intra_state' : 'inter_state'
}

/**
 * Filter + map valid lines → orders.createAtomic schema.
 */
export function transformLines(lines = []) {
  return lines
    .filter((l) => l?.productId && safeNum(l.qty) > 0 && safeNum(l.rate) > 0)
    .map((l, idx) => {
      const qty = safeNum(l.qty)
      const rate = safeNum(l.rate)
      const amount = qty * rate
      const discountPct = clampPct(l.discountPct)
      const discountAmount = (amount * discountPct) / 100
      const net = amount - discountAmount
      const gstRate = safeNum(l.gstRate)
      return {
        sort_order: idx + 1,
        line_type: 'production',
        product_id: l.productId,
        total_qty: qty,
        rate_per_unit: rate,
        amount,
        discount_pct: discountPct,
        discount_amount: discountAmount,
        gst_rate: gstRate,
        net_amount: net,
      }
    })
}

/**
 * Filter + map valid charges → orders.createAtomic schema.
 */
export function transformCharges(charges = []) {
  return charges
    .filter((c) => c?.chargeTypeId && safeNum(c.amount) > 0)
    .map((c, idx) => ({
      sort_order: idx + 1,
      charge_type_id: c.chargeTypeId,
      amount: safeNum(c.amount),
    }))
}

/**
 * Build the order header payload for orders.createAtomic.
 */
export function buildOrderPayload(form, gstType) {
  return {
    customer_id: form.customerId,
    order_type_id: form.orderTypeId || null,
    payment_terms_id: form.paymentTermsId || null,
    status: 'draft',
    gst_type: gstType,
    delivery_date_1: form.deliveryDate || null,
    notes: form.notes || null,
    nature: form.nature || 'regular',
  }
}
