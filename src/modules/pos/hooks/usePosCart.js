/**
 * usePosCart — reducer-backed POS cart with localStorage persistence.
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §6
 * Plan: docs/specs/2026-04-28-pos-system-plan.md §Phase 5
 *
 * State shape:
 *   {
 *     customer: null | { id, firm_name, contact_name, gstin, state_code, ... },
 *     docType: 'tax_invoice' | 'bill_of_supply',
 *     lines: [
 *       { id, product_id, code, description, qty, unit, rate, gst_rate,
 *         hsn_code, discount_pct, discount_amt, sort_order }
 *     ],
 *     billDiscount: { pct: number, amount: number, reason: string },
 *     notes: string,
 *   }
 *
 * Derived (recomputed each render via gstSplit):
 *   subtotal, cgst_amount, sgst_amount, igst_amount, total_tax, grand_total,
 *   interState, lines (with taxable_amount + cgst/sgst/igst per line)
 */

import { useReducer, useEffect, useMemo, useCallback } from 'react'
import { computeCartGst } from '../lib/gstSplit'

const initialState = {
  customer: null,
  docType: 'bill_of_supply', // walk-in default
  lines: [],
  billDiscount: { pct: 0, amount: 0, reason: '' },
  notes: '',
}

function reducer(state, action) {
  switch (action.type) {
    case 'HYDRATE':
      return { ...initialState, ...action.payload }
    case 'CLEAR':
      return { ...initialState }
    case 'SET_CUSTOMER':
      return {
        ...state,
        customer: action.customer,
        // Walk-in defaults to bill_of_supply, registered defaults to tax_invoice
        // (cashier can flip after via SET_DOC_TYPE).
        docType: action.customer?.id ? 'tax_invoice' : 'bill_of_supply',
      }
    case 'SET_DOC_TYPE':
      return { ...state, docType: action.docType }
    case 'ADD_LINE': {
      const product = action.product
      const existingIdx = state.lines.findIndex(l => l.product_id === product.id)
      if (existingIdx >= 0) {
        const updated = [...state.lines]
        updated[existingIdx] = { ...updated[existingIdx], qty: round3(updated[existingIdx].qty + (action.qty || 1)) }
        return { ...state, lines: updated }
      }
      const newLine = {
        id: cryptoId(),
        product_id: product.id,
        code: product.code,
        description: product.name,
        qty: action.qty || 1,
        unit: product.default_rate_unit === 'per_kg' ? 'kg' : 'm',
        rate: Number(action.rate ?? product.default_rate ?? 0),
        gst_rate: Number(product.gst_rate ?? 0),
        hsn_code: product.hsn_code || '',
        discount_pct: 0,
        discount_amt: 0,
        sort_order: state.lines.length,
      }
      return { ...state, lines: [...state.lines, newLine] }
    }
    case 'UPDATE_LINE': {
      const updated = state.lines.map(l => l.id === action.id ? { ...l, ...action.patch } : l)
      return { ...state, lines: updated }
    }
    case 'REMOVE_LINE':
      return { ...state, lines: state.lines.filter(l => l.id !== action.id) }
    case 'SET_BILL_DISCOUNT':
      return { ...state, billDiscount: { ...state.billDiscount, ...action.patch } }
    case 'SET_NOTES':
      return { ...state, notes: action.notes }
    default:
      return state
  }
}

function cryptoId() {
  return (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
function round3(n) { return Math.round(n * 1000) / 1000 }

/**
 * @param {object} opts { sessionId, ourStateCode }
 *   sessionId — used as the localStorage cache key
 *   ourStateCode — defaults to '08' (Rajasthan)
 */
export function usePosCart({ sessionId, ourStateCode = '08' } = {}) {
  const storageKey = sessionId ? `pos_cart:${sessionId}` : null

  const [state, dispatch] = useReducer(reducer, initialState)

  // Hydrate from localStorage on mount / sessionId change
  useEffect(() => {
    if (!storageKey) return
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const parsed = JSON.parse(raw)
        dispatch({ type: 'HYDRATE', payload: parsed })
      }
    } catch (err) {
      // corrupt cache, ignore
      if (import.meta.env.DEV) console.warn('[usePosCart] hydrate failed', err)
    }
  }, [storageKey])

  // Persist on every change
  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(state))
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[usePosCart] persist failed', err)
    }
  }, [storageKey, state])

  // Derived totals — recomputed every render (cheap; cart usually < 50 lines)
  const totals = useMemo(() => {
    const computed = computeCartGst(state.lines, state.customer?.state_code, ourStateCode)
    // Bill-level discount applied AFTER per-line GST split
    const grossTotal = computed.grand_total
    const billPct = Number(state.billDiscount.pct) || 0
    const billAmt = Number(state.billDiscount.amount) || 0
    const billDiscount = round2(grossTotal * (billPct / 100) + billAmt)
    return {
      ...computed,
      bill_discount_amount: billDiscount,
      grand_total_after_discount: round2(Math.max(0, grossTotal - billDiscount)),
    }
  }, [state.lines, state.customer, state.billDiscount, ourStateCode])

  const api = useMemo(() => ({
    state,
    totals,
    setCustomer: (customer) => dispatch({ type: 'SET_CUSTOMER', customer }),
    setDocType: (docType) => dispatch({ type: 'SET_DOC_TYPE', docType }),
    addProduct: (product, opts = {}) => dispatch({ type: 'ADD_LINE', product, qty: opts.qty, rate: opts.rate }),
    updateLine: (id, patch) => dispatch({ type: 'UPDATE_LINE', id, patch }),
    removeLine: (id) => dispatch({ type: 'REMOVE_LINE', id }),
    setBillDiscount: (patch) => dispatch({ type: 'SET_BILL_DISCOUNT', patch }),
    setNotes: (notes) => dispatch({ type: 'SET_NOTES', notes }),
    clear: useCallback(() => {
      dispatch({ type: 'CLEAR' })
      if (storageKey) localStorage.removeItem(storageKey)
    }, [storageKey]),
  }), [state, totals, storageKey])

  return api
}

function round2(n) { return Math.round(n * 100) / 100 }
