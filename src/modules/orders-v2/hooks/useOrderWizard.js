/**
 * Hook for the Orders V2 wizard (smart progressive single-page form).
 *
 * State + side-effect orchestration only — all math, validation, and
 * save-payload transforms live in `./_wizardMath.js` so they can be
 * unit-tested under Node --test without a React runtime.
 *
 * Phase 9 ships the new-order path; legacy 4-step OrderForm still owns
 * /orders/:id/edit and /orders/:id/duplicate.
 *
 * State shape:
 *   {
 *     customerId,
 *     orderTypeId,
 *     paymentTermsId,
 *     gstType,            // 'auto' | 'intra_state' | 'inter_state'
 *     deliveryDate,
 *     notes,
 *     nature,             // 'regular' | 'sample'
 *     lines: [{ productId, qty, rate, gstRate, discountPct }],
 *     charges: [{ chargeTypeId, amount }],
 *   }
 */

import { useCallback, useMemo, useState } from 'react'
import { orders as ordersDb } from '../../../lib/db/orders'
import { markSelfWrite } from '../../../hooks/useRealtimeTable'
import {
  computeTotals,
  validateForm,
  resolveGstType,
  transformLines,
  transformCharges,
  buildOrderPayload,
} from './_wizardMath'

const EMPTY_LINE = () => ({ productId: '', qty: '', rate: '', gstRate: 18, discountPct: '' })

const INITIAL = {
  customerId: '',
  orderTypeId: '',
  paymentTermsId: '',
  gstType: 'auto',
  deliveryDate: '',
  notes: '',
  nature: 'regular',
  lines: [EMPTY_LINE()],
  charges: [],
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

  const totals = useMemo(
    () => computeTotals(form.lines, form.charges),
    [form.lines, form.charges],
  )

  const validation = useMemo(() => validateForm(form), [form])

  /**
   * Save handler. Returns `{ data, error }` so callers can route on result.
   *
   * @param {Map<string, object>} customersById — to resolve gst_type from
   *                                              customer.state_code
   */
  const save = useCallback(async (customersById = new Map()) => {
    if (saving) return { data: null, error: new Error('already saving') }
    if (!validation.isValid) {
      return { data: null, error: new Error('Form is invalid') }
    }
    setSaving(true)
    setError(null)
    try {
      const customer = customersById.get(form.customerId)
      const gstType = resolveGstType(form.gstType, customer)
      const lines = transformLines(form.lines)
      const charges = transformCharges(form.charges)
      const orderPayload = buildOrderPayload(form, gstType)

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
