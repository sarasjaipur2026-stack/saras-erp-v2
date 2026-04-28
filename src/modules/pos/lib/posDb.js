/**
 * SARAS POS — RPC + business-logic data access.
 * Wraps the Postgres functions (pos_create_sale, pos_recall_sale,
 * pos_close_session) and adds open-session / current-session helpers.
 *
 * All calls go through `safe()` so they pick up the 30s timeout +
 * pre-flight ensureFreshSession() that protects against the auth-queue
 * stall described in d2f68c5 (CRIT-4).
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §6
 * Plan: docs/specs/2026-04-28-pos-system-plan.md §Phase 2
 */

import { supabase } from '../../../lib/supabase'
import { safe } from '../../../lib/db'

/**
 * Atomically create a POS sale.
 *
 * @param {object} payload {
 *   session_id, terminal_id, customer_id, warehouse_id,
 *   doc_type ('tax_invoice'|'bill_of_supply'),
 *   held, hold_label, notes,
 *   subtotal, cgst_amount, sgst_amount, igst_amount, total_tax, grand_total,
 *   lines: [{ product_id, description, qty, unit, rate, hsn_code, gst_rate,
 *             discount_pct, discount_amt, taxable_amount,
 *             cgst_amount, sgst_amount, igst_amount, line_total, sort_order }],
 *   tenders: [{ tender_type, amount, reference }],
 *   outputs: ['thermal'|'a4'|'whatsapp'|'email'],
 *   print_payload: { ...arbitrary payload for print bridge },
 * }
 * @param {string} idempotencyKey UUID — same key returns same invoice id
 * @returns {Promise<{ data: string|null, error: any }>} invoice_id
 */
export async function createSale(payload, idempotencyKey) {
  return safe(async () => {
    const { data, error } = await supabase.rpc('pos_create_sale', {
      p_payload: payload,
      p_idempotency_key: idempotencyKey,
    })
    if (error) throw error
    return data
  })
}

/** Hold a bill — same as createSale with held=true, no payments/print/stock. */
export async function holdSale(payload, idempotencyKey) {
  return createSale({ ...payload, held: true, tenders: [], outputs: [] }, idempotencyKey)
}

/** Recall a held bill by id → returns { invoice, lines } JSON. */
export async function recallSale(invoiceId) {
  return safe(async () => {
    const { data, error } = await supabase.rpc('pos_recall_sale', { p_invoice_id: invoiceId })
    if (error) throw error
    return data
  })
}

/** List all held bills for the current open session. */
export async function listHeldSales(sessionId) {
  return safe(async () => {
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, hold_label, grand_total, created_at, customer_id')
      .eq('held', true)
      .eq('pos_session_id', sessionId)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data || []
  })
}

/** Open a cashier drawer / session. */
export async function openSession({ terminalId, openedWith, notes }) {
  return safe(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('not authenticated')
    const { data, error } = await supabase
      .from('pos_sessions')
      .insert({
        user_id: user.id,
        terminal_id: terminalId,
        cashier_id: user.id,
        opened_with: openedWith,
        notes,
      })
      .select()
      .single()
    if (error) throw error
    return data
  })
}

/** Close session via RPC — returns Z-report data. */
export async function closeSession({ sessionId, countedCash, notes }) {
  return safe(async () => {
    const { data, error } = await supabase.rpc('pos_close_session', {
      p_session_id: sessionId,
      p_counted_cash: countedCash,
      p_notes: notes ?? null,
    })
    if (error) throw error
    return data
  })
}

/** Get current open session for this user + terminal. Returns null if none. */
export async function currentSession(terminalId) {
  return safe(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data, error } = await supabase
      .from('pos_sessions')
      .select('*')
      .eq('user_id', user.id)
      .eq('terminal_id', terminalId)
      .is('closed_at', null)
      .maybeSingle()
    if (error) throw error
    return data
  })
}

/** Get the user's default counter terminal (or first available). */
export async function defaultTerminal() {
  return safe(async () => {
    const { data, error } = await supabase
      .from('pos_terminals')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    return data
  })
}
