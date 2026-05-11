/**
 * Hook for the Orders V2 wizard (smart progressive single-page form).
 *
 * Phase 9 scope:
 *   - new-order creation only — edit + duplicate stay on the legacy form
 *     so we don't regress the complex shapes (sample-order branching,
 *     spec cards, charges, broker commission) until the wizard catches up
 *   - one customer, 1+ line items, optional payment terms / notes / dates
 *   - save via orders.createAtomic — atomic header + lines + charges
 *
 * State shape (all in one local object for predictable resets):
 *   {
 *     customerId,
 *     orderTypeId,
 *     paymentTermsId,
 *     gstType,            // 'auto' | 'intra_state' | 'inter_state'
 *     deliveryDate,
 *     notes,
 *     lines: [{ productId, qty, rate, gstRate }],
 *   }
 */

import { useCallback, useMemo, useState } from 'react'
import { orders as ordersDb } from '../../../lib/db/orders'
import { markSelfWrite } from '../../../hooks/useRealtimeTable'

// Phase 10: lines gain a `discountPct` field (line-level discount applied
// before GST). Charges array sits alongside lines for order-level extras.
const EMPTY_LINE = () => ({ productId: '', qty: '', rate: '', gstRate: 18, discountPct: '' })

const INITIAL = {
  customerId: '',
  orderTypeId: '',
  paymentTermsId: '',
  gstType: 'auto', // resolved on save from customer.state_code
  deliveryDate: '',
  notes: '',
  nature: 'regular', // 'regular' | 'sample' — Phase 10 sample toggle
  lines: [EMPTY_LINE()],
  charges: [], // [{ chargeTypeId, amount }]
}

export function useOrderWizard() {
  const [form, setForm] = useState(INITIAL)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const patch = useCallback((p) => {
    setForm((prev) => ({ ...prev, ...p }))
  }, [])

  const patchLine = useCallback((idx, p) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((l, i) => (i === idx ? { ...l, ...p } : l)),
    }))
  }, [])

  const addLine = useCallback(() => {
    setForm((prev) => ({ ...prev, lines: [...prev.lines, EMPTY_LINE()] }))
  }, [])

  const removeLine = useCallback((idx) => {
    setForm((prev) => ({
      ...prev,
      // Always keep at least one line — the form is invalid without it.
      lines: prev.lines.length <= 1 ? prev.lines : prev.lines.filter((_, i) => i !== idx),
    }))
  }, [])

  const reset = useCallback(() => setForm(INITIAL), [])

  // ─── derived totals ───────────────────────────────────────
  // Per-line: (qty × rate) less discountPct, then add GST. Then sum
  // line nets + charges → grand. Charges are added AFTER GST (legacy
  // behaviour — they're typically freight/packing, not part of taxable value).
  const totals = useMemo(() => {
    let subtotal = 0
    let discount = 0
    let taxable = 0
    let gst = 0
    for (const l of form.lines) {
      const qty = Number(l.qty) || 0
      const rate = Number(l.rate) || 0
      const gross = qty * rate
      const discPct = Math.min(100, Math.max(0, Number(l.discountPct) || 0))
      const discAmt = (gross * discPct) / 100
      const base = gross - discAmt
      const gstRate = Number(l.gstRate) || 0
      const gstAmt = (base * gstRate) / 100
      subtotal += gross
      discount += discAmt
      taxable += base
      gst += gstAmt
    }
    const chargesTotal = form.charges.reduce(
      (a, c) => a + (Number(c.amount) || 0), 0,
    )
    const grand = taxable + gst + chargesTotal
    return { subtotal, discount, taxable, gst, charges: chargesTotal, grand }
  }, [form.lines, form.charges])

  // ─── validation ───────────────────────────────────────────
  const validation = useMemo(() => {
    const errors = {}
    if (!form.customerId) errors.customerId = 'Customer is required'
    const validLines = form.lines.filter((l) => l.productId && Number(l.qty) > 0 && Number(l.rate) > 0)
    if (validLines.length === 0) errors.lines = 'At least one line with product, qty, and rate is required'
    return { errors, isValid: Object.keys(errors).length === 0 }
  }, [form])

  /**
   * Save handler. Resolves `gstType` from the customer's state_code if 'auto'
   * (08 = intra_state for RPK Industries in Rajasthan; everything else =
   * inter_state). Returns the created order on success.
   *
   * @param {object} customersById — map(id → customer row) so we can read
   *                                 state_code without an extra fetch
   */
  const save = useCallback(async (customersById = new Map()) => {
    if (saving) return { data: null, error: new Error('already saving') }
    if (!validation.isValid) {
      return { data: null, error: new Error('Form is invalid') }
    }
    setSaving(true)
    setError(null)
    try {
      // Resolve GST type
      let gstType = form.gstType
      if (gstType === 'auto') {
        const customer = customersById.get(form.customerId)
        const stateCode = customer?.state_code
        gstType = stateCode === '08' ? 'intra_state' : 'inter_state'
      }

      // Transform lines → schema. Apply discountPct before storing the
      // net amount so the server-side balance + invoice calc see the
      // already-reduced base. GST is intentionally stored as a rate (not
      // amount); downstream code re-derives the tax breakdown.
      const lines = form.lines
        .filter((l) => l.productId && Number(l.qty) > 0 && Number(l.rate) > 0)
        .map((l, idx) => {
          const qty = Number(l.qty)
          const rate = Number(l.rate)
          const amount = qty * rate
          const discPct = Math.min(100, Math.max(0, Number(l.discountPct) || 0))
          const discAmt = (amount * discPct) / 100
          const net = amount - discAmt
          const gstRate = Number(l.gstRate) || 0
          return {
            sort_order: idx + 1,
            line_type: 'production',
            product_id: l.productId,
            total_qty: qty,
            rate_per_unit: rate,
            amount,
            discount_pct: discPct,
            discount_amount: discAmt,
            gst_rate: gstRate,
            net_amount: net,
          }
        })

      const charges = form.charges
        .filter((c) => c.chargeTypeId && Number(c.amount) > 0)
        .map((c, idx) => ({
          sort_order: idx + 1,
          charge_type_id: c.chargeTypeId,
          amount: Number(c.amount),
        }))

      const orderPayload = {
        customer_id: form.customerId,
        order_type_id: form.orderTypeId || null,
        payment_terms_id: form.paymentTermsId || null,
        status: 'draft',
        gst_type: gstType,
        delivery_date_1: form.deliveryDate || null,
        notes: form.notes || null,
        nature: form.nature || 'regular',
      }

      markSelfWrite('orders')
      const { data, error: err } = await ordersDb.createAtomic(orderPayload, lines, charges)
      if (err) throw err
      return { data, error: null }
    } catch (e) {
      setError(e)
      return { data: null, error: e }
    } finally {
      setSaving(false)
    }
  }, [form, validation.isValid, saving])

  return {
    form, patch, patchLine, addLine, removeLine, reset,
    totals, validation, saving, error, save,
  }
}
