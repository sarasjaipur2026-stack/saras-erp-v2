import { supabase } from '../supabase'
import { safe, createTable } from './core'
import { notifications } from './notifications'
import { todayIST } from '../dates'

// ─── INVOICES ──────────────────────────────────────────────
const invoicesBase = createTable('invoices', {
  orderBy: 'invoice_date',
  orderAsc: false,
  ownerFilter: false,
  select: '*, customers(firm_name, gstin, state_code), orders(order_number)',
})
export const invoices = {
  ...invoicesBase,
  createFromOrder: async (orderId) => {
    try {
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('*, customers(*)')
        .eq('id', orderId)
        .single()
      if (orderErr || !order) return { data: null, error: orderErr }

      const { data: numResult, error: numErr } = await supabase.rpc('next_invoice_number')
      if (numErr) return { data: null, error: numErr }

      // Use server-side single-source-of-truth for paid/balance. The
      // orders.advance_paid column has had drift issues when payments fail
      // halfway; the view always derives from the payments table directly.
      const { data: fin } = await supabase.rpc('order_financials', { p_order_id: order.id })
      const finRow = Array.isArray(fin) ? fin[0] : fin
      const totalPaid = Number(finRow?.total_paid || 0)
      const balanceDue = Number(finRow?.balance_due || 0)

      const payload = {
        invoice_number: numResult,
        order_id: order.id,
        customer_id: order.customer_id,
        invoice_date: todayIST(),
        due_date: order.payment_due_date,
        subtotal: order.taxable_amount || order.subtotal || 0,
        cgst_amount: order.cgst_amount || 0,
        sgst_amount: order.sgst_amount || 0,
        igst_amount: order.igst_amount || 0,
        total_tax: (order.cgst_amount || 0) + (order.sgst_amount || 0) + (order.igst_amount || 0),
        grand_total: order.grand_total || 0,
        amount_paid: totalPaid,
        balance_due: balanceDue,
        status: balanceDue <= 0 ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'issued',
      }
      return await safe(() => supabase.from('invoices').insert([payload]).select().single())
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

  // Atomic payment recording via apply_payment_atomic RPC.
  // Server acquires SELECT FOR UPDATE on the order row — eliminates the TOCTOU race
  // that existed when two tellers recorded payments against the same order concurrently.
  // The RPC inserts the payment, updates orders.advance_paid/balance_due/status,
  // all in one transaction. Invoice-sync + notification stay client-side (non-critical).
  record: async ({ order_id, amount, payment_mode, payment_date, reference_number, bank_id, notes }) => {
    try {
      const numAmount = Number(amount)
      if (!numAmount || numAmount <= 0) return { data: null, error: new Error('Amount must be greater than zero') }

      const { data: paymentRow, error: rpcErr } = await supabase.rpc('apply_payment_atomic', {
        p_payment: {
          order_id,
          amount: numAmount,
          payment_mode,
          payment_date: payment_date || todayIST(),
          reference_number: reference_number || null,
          bank_id: bank_id || null,
          notes: notes || null,
        },
      })
      if (rpcErr) return { data: null, error: rpcErr }

      // Post-payment: refresh invoice snapshot from the order_financials view
      // so paid/balance always matches the authoritative payments table.
      const { data: orderAfter } = await supabase
        .from('orders')
        .select('order_number, customers(firm_name)')
        .eq('id', order_id)
        .single()

      const { data: fin } = await supabase.rpc('order_financials', { p_order_id: order_id })
      const finRow = Array.isArray(fin) ? fin[0] : fin
      const totalPaid = Number(finRow?.total_paid || 0)
      const invBalance = Number(finRow?.balance_due || 0)

      const { data: inv } = await supabase.from('invoices').select('id, grand_total').eq('order_id', order_id).maybeSingle()
      if (inv) {
        const invStatus = invBalance <= 0 ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'issued'
        await supabase.from('invoices').update({
          amount_paid: totalPaid,
          balance_due: invBalance,
          status: invStatus,
        }).eq('id', inv.id)
      }

      try {
        notifications.emit({
          type: 'payment_received',
          title: `Payment received · ₹${numAmount.toLocaleString('en-IN')}`,
          message: `${orderAfter?.customers?.firm_name || 'Customer'} · ${orderAfter?.order_number || ''} · balance ₹${invBalance.toLocaleString('en-IN')}`,
          entity_type: 'order',
          entity_id: order_id,
        }).catch(() => {})
      } catch {
        // Notification failures must never break the payment flow
      }

      return { data: paymentRow, error: null }
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

  // Single source of truth for order balance — reads the server-side view
  // that joins orders + payments. No longer uses orders.advance_paid (which
  // had drift issues) or caps payments to 500 rows.
  getOrderBalance: async (orderId) => {
    try {
      const { data, error } = await supabase.rpc('order_financials', { p_order_id: orderId })
      if (error) return { data: null, error }
      const row = Array.isArray(data) ? data[0] : data
      if (!row) return { data: null, error: new Error('Order not found') }
      return {
        data: {
          grandTotal: Number(row.grand_total || 0),
          totalPayments: Number(row.total_paid || 0),
          balance: Number(row.balance_due || 0),
          balanceDue: Number(row.balance_due || 0),
          customerCredit: Number(row.customer_credit || 0),
        },
        error: null,
      }
    } catch (error) {
      return { data: null, error }
    }
  },
}
