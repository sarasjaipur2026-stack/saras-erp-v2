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

const EMPTY_LINE = () => ({ productId: '', qty: '', rate: '', gstRate: 18 })

const INITIAL = {
  customerId: '',
  orderTypeId: '',
  paymentTermsId: '',
  gstType: 'auto', // resolved on save from customer.state_code
  deliveryDate: '',
  notes: '',
  lines: [EMPTY_LINE()],
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
  const totals = useMemo(() => {
    let subtotal = 0
    let gst = 0
    for (const l of form.lines) {
      const qty = Number(l.qty) || 0
      const rate = Number(l.rate) || 0
      const amt = qty * rate
      const gstRate = Number(l.gstRate) || 0
      subtotal += amt
      gst += (amt * gstRate) / 100
    }
    return { subtotal, gst, grand: subtotal + gst }
  }, [form.lines])

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

      // Transform lines → schema. Use total_qty as the catch-all qty field
      // (legacy uses meters/weight_kg for kg/m products but total_qty is
      // always populated and the pricing engine reads it as a fallback).
      const lines = form.lines
        .filter((l) => l.productId && Number(l.qty) > 0 && Number(l.rate) > 0)
        .map((l, idx) => {
          const qty = Number(l.qty)
          const rate = Number(l.rate)
          const amount = qty * rate
          const gstRate = Number(l.gstRate) || 0
          return {
            sort_order: idx + 1,
            line_type: 'production',
            product_id: l.productId,
            total_qty: qty,
            rate_per_unit: rate,
            amount,
            gst_rate: gstRate,
            net_amount: amount,
          }
        })

      const orderPayload = {
        customer_id: form.customerId,
        order_type_id: form.orderTypeId || null,
        payment_terms_id: form.paymentTermsId || null,
        status: 'draft',
        gst_type: gstType,
        delivery_date_1: form.deliveryDate || null,
        notes: form.notes || null,
      }

      markSelfWrite('orders')
      const { data, error: err } = await ordersDb.createAtomic(orderPayload, lines, [])
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
