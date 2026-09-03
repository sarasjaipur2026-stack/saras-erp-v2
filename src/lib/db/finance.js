import { supabase } from '../supabase'
import { safe, createTable } from './core'
import { notifications } from './notifications'

// ─── INVOICES ──────────────────────────────────────────────
const invoicesBase = createTable('invoices', {
  orderBy: 'invoice_date',
  orderAsc: false,
  ownerFilter: false,
  select: '*, customers(firm_name, gstin, state_code), orders(order_number)',
})
export const invoices = {
  ...invoicesBase,
  createFromOrder: async (orderId, requestId = crypto.randomUUID()) => {
    try {
      return await safe(() => supabase.rpc('create_invoice_from_order_transactional', {
        p_order_id: orderId,
        p_request_id: requestId,
      }))
    } catch (error) {
      return { data: null, error }
    }
  },
}

// ─── PAYMENTS ────────────────────────────────────────────
export const payments = {
  ...createTable('payments', {
    orderBy: 'payment_date', orderAsc: false, ownerFilter: false,
    select: '*, orders(order_number, grand_total, customers(firm_name)), banks(bank_name)',
  }),

  record: async ({ order_id, amount, payment_mode, payment_date, reference_number, bank_id, notes, request_id }) => {
    try {
      // Validate amount
      const numAmount = Number(amount)
      if (!numAmount || numAmount <= 0) return { data: null, error: new Error('Amount must be greater than zero') }

      const operationId = request_id || crypto.randomUUID()
      const { data: inserted, error: pErr } = await safe(() => supabase.rpc('record_payment_transactional', {
        p_order_id: order_id,
        p_amount: numAmount,
        p_payment_mode: payment_mode,
        p_payment_date: payment_date || new Date().toISOString().slice(0, 10),
        p_reference_number: reference_number || null,
        p_bank_id: bank_id || null,
        p_notes: notes || null,
        p_request_id: operationId,
      }))
      if (pErr) return { data: null, error: pErr }

      try {
        const { data: orderRow } = await supabase
          .from('orders')
          .select('order_number, customers(firm_name)')
          .eq('id', order_id)
          .single()
        notifications.emit({
          type: 'payment_received',
          title: `Payment received · ₹${numAmount.toLocaleString('en-IN')}`,
          message: `${orderRow?.customers?.firm_name || 'Customer'} · ${orderRow?.order_number || ''} · balance ₹${Number(inserted?.balance_due || 0).toLocaleString('en-IN')}`,
          entity_type: 'order',
          entity_id: order_id,
        }).catch(() => {})
      } catch {
        // Notification failures must never break the payment flow
      }

      return { data: inserted, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

  listByOrder: async (orderId) => safe(() =>
    supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .order('payment_date', { ascending: false })
      .limit(200)
  ),

  getOrderBalance: async (orderId) => {
    try {
      return await safe(() => supabase.rpc('get_order_balance', { p_order_id: orderId }))
    } catch (error) {
      return { data: null, error }
    }
  },
}
