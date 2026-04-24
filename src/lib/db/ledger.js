import { supabase } from '../supabase'
import { safe, createTable } from './core'
import { todayIST } from '../dates'

// ─── CUSTOMER LEDGER ──────────────────────────────────────
// Append-only double-entry log. Invoice → debit, payment → credit.
// Ledger rows are written server-side via triggers on payments/invoices,
// so client code mostly reads here. The customer_statement RPC computes
// running balance via window function in one round-trip.
const base = createTable('customer_ledger', {
  orderBy: 'txn_date',
  orderAsc: true,
  ownerFilter: false, // RLS enforces customer_id/user_id already
  select: '*, customers(firm_name), orders(order_number), invoices(invoice_number), payments(amount, payment_mode)',
})

export const customerLedger = {
  ...base,

  statement: async (customerId) => safe(() =>
    supabase.rpc('customer_statement', { p_customer_id: customerId })
  ),

  // Manual adjustment (opening balance / credit note / debit note / correction).
  // Server trigger only auto-posts from payments + invoices; anything else
  // (opening balance, manual correction) goes through this path.
  postAdjustment: async ({ customer_id, txn_type, debit, credit, txn_date, reference_number, notes }) => {
    if (!customer_id) return { data: null, error: new Error('customer_id required') }
    const d = Number(debit) || 0
    const c = Number(credit) || 0
    if (d < 0 || c < 0) return { data: null, error: new Error('debit/credit must be non-negative') }
    if ((d === 0) === (c === 0)) {
      return { data: null, error: new Error('Exactly one of debit or credit must be positive') }
    }
    return safe(() => supabase.from('customer_ledger').insert([{
      customer_id,
      txn_type: txn_type || 'adjustment',
      debit: d,
      credit: c,
      txn_date: txn_date || todayIST(),
      reference_number: reference_number || null,
      notes: notes || null,
    }]).select().single())
  },

  listByCustomer: async (customerId) => safe(() =>
    supabase
      .from('customer_ledger')
      .select('*, invoices(invoice_number), payments(amount, payment_mode), orders(order_number)')
      .eq('customer_id', customerId)
      .order('txn_date', { ascending: true })
      .order('created_at', { ascending: true })
      .limit(1000)
  ),
}
