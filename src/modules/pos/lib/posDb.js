/**
 * SARAS POS — RPC + business-logic data access.
 *
 * Wraps the Postgres functions (pos_create_sale, pos_recall_sale,
 * pos_close_session) and adds open-session / current-session helpers.
 *
 * All calls go through `safe()` so they pick up the 30s timeout +
 * pre-flight ensureFreshSession() that protects against the auth-queue
 * stall described in d2f68c5 (CRIT-4).
 *
 * Convention: every export returns `{ data, error }` to match the rest of
 * the codebase. `safe()` passes through whatever the supabase query
 * builder yields (which is `{ data, error }` natively); on thrown
 * exception it returns `{ data: null, error }`.
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §6
 * Plan: docs/specs/2026-04-28-pos-system-plan.md §Phase 2
 */

import { supabase } from '../../../lib/supabase'
import { safe } from '../../../lib/db'

/**
 * Atomically create a POS sale.
 * @returns {Promise<{ data: string|null, error: any }>} invoice_id in `data`
 */
export async function createSale(payload, idempotencyKey) {
  return safe(() => supabase.rpc('pos_create_sale', {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
  }))
}

/** Hold a bill — same as createSale with held=true, no payments/print/stock. */
export async function holdSale(payload, idempotencyKey) {
  return createSale({ ...payload, held: true, tenders: [], outputs: [] }, idempotencyKey)
}

/** Recall a held bill by id → returns { invoice, lines } JSON in `data`. */
export async function recallSale(invoiceId) {
  return safe(() => supabase.rpc('pos_recall_sale', { p_invoice_id: invoiceId }))
}

/** List all held bills for the current open session. */
export async function listHeldSales(sessionId) {
  return safe(() =>
    supabase
      .from('invoices')
      .select('id, invoice_number, hold_label, grand_total, created_at, customer_id')
      .eq('held', true)
      .eq('pos_session_id', sessionId)
      .order('created_at', { ascending: false })
  )
}

/** Open a cashier drawer / session. */
export async function openSession({ terminalId, openedWith, notes }) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: new Error('not authenticated') }
  return safe(() =>
    supabase
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
  )
}

/** Close session via RPC — returns Z-report data. */
export async function closeSession({ sessionId, countedCash, notes }) {
  return safe(() => supabase.rpc('pos_close_session', {
    p_session_id: sessionId,
    p_counted_cash: countedCash,
    p_notes: notes ?? null,
  }))
}

/** Get current open session for this user + terminal. Returns null in data if none. */
export async function currentSession(terminalId) {
  return safe(() =>
    supabase
      .from('pos_sessions')
      .select('*')
      .eq('terminal_id', terminalId)
      .is('closed_at', null)
      .maybeSingle()
  )
}

/** Get the user's default counter terminal (or first available). */
export async function defaultTerminal() {
  return safe(() =>
    supabase
      .from('pos_terminals')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
  )
}
