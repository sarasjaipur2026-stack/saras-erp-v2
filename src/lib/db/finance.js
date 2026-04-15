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

      const payload = {
        invoice_number: numResult,
        order_id: order.id,
        customer_id: order.customer_id,
        invoice_date: new Date().toISOString().slice(0, 10),
        due_date: order.payment_due_date,
        subtotal: order.taxable_amount || order.subtotal || 0,
        cgst_amount: order.cgst_amount || 0,
        sgst_amount: order.sgst_amount || 0,
        igst_amount: order.igst_amount || 0,
        total_tax: (order.cgst_amount || 0) + (order.sgst_amount || 0) + (order.igst_amount || 0),
        grand_total: order.grand_total || 0,
        amount_paid: order.advance_paid || 0,
        balance_due: (order.grand_total || 0) - (order.advance_paid || 0),
        status: 'issued',
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

  record: async ({ order_id, amount, payment_mode, payment_date, reference_number, bank_id, notes }) => {
    try {
      // Validate amount
      const numAmount = Number(amount)
      if (!numAmount || numAmount <= 0) return { data: null, error: new Error('Amount must be greater than zero') }

      // Re-read order state immediately before inserting to minimise race window
      const { data: order, error: oErr } = await supabase
        .from('orders')
        .select('grand_total, advance_paid, balance_due, status')
        .eq('id', order_id)
        .single()
      if (oErr) return { data: null, error: oErr }

      // Guard: prevent overpayment
      if (numAmount > Number(order.balance_due || 0) + 0.01) {
        return { data: null, error: new Error(`Amount ₹${numAmount} exceeds balance due ₹${order.balance_due}`) }
      }

      const { data: inserted, error: pErr } = await supabase.from('payments').insert([{
        order_id, amount: numAmount, payment_mode, payment_date, reference_number, bank_id, notes,
      }]).select().single()
      if (pErr) return { data: null, error: pErr }

      // Recalculate from ALL payments (source-of-truth) to stay consistent even under concurrency
      const { data: allPayments } = await supabase.from('payments').select('amount').eq('order_id', order_id).limit(500)
      const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0)
      const newBalance = Math.max(0, Number(order.grand_total || 0) - totalPaid)
      const updates = { advance_paid: totalPaid, balance_due: newBalance }
      // Only auto-complete if the order is already in 'dispatch' — otherwise we would skip
      // required workflow states (production → qc → dispatch → completed) and produce
      // orders that show 'completed' while stock hasn't left the warehouse.
      // Never modify status for cancelled orders.
      if (newBalance <= 0 && order.status === 'dispatch') {
        updates.status = 'completed'
      }
      const { error: orderUpdateErr } = await supabase.from('orders').update(updates).eq('id', order_id)
      if (orderUpdateErr && import.meta.env.DEV) console.error('[payments.record] order update failed', orderUpdateErr)

      const { data: inv } = await supabase.from('invoices').select('id, grand_total').eq('order_id', order_id).maybeSingle()
      if (inv) {
        const invBalance = Math.max(0, Number(inv.grand_total || 0) - totalPaid)
        const invStatus = invBalance <= 0 ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'issued'
        await supabase.from('invoices').update({
          amount_paid: totalPaid,
          balance_due: invBalance,
          status: invStatus,
        }).eq('id', inv.id)
      }

      try {
        const { data: orderRow } = await supabase
          .from('orders')
          .select('order_number, customers(firm_name)')
          .eq('id', order_id)
          .single()
        notifications.emit({
          type: 'payment_received',
          title: `Payment received · ₹${numAmount.toLocaleString('en-IN')}`,
          message: `${orderRow?.customers?.firm_name || 'Customer'} · ${orderRow?.order_number || ''} · balance ₹${newBalance.toLocaleString('en-IN')}`,
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
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select('grand_total, advance_paid, balance_due')
        .eq('id', orderId)
        .single()
      if (orderErr || !order) return { data: null, error: orderErr }

      const { data: pmts, error: paymentsErr } = await supabase
        .from('payments')
        .select('amount')
        .eq('order_id', orderId)
        .limit(500)
      if (paymentsErr) return { data: null, error: paymentsErr }

      const totalPaid = (pmts || []).reduce((sum, p) => sum + (p.amount || 0), 0)
      const balance = (order.grand_total || 0) - totalPaid

      return {
        data: {
          grandTotal: order.grand_total,
          advancePaid: order.advance_paid,
          totalPayments: totalPaid,
          balance,
          balanceDue: order.balance_due,
        },
        error: null,
      }
    } catch (error) {
      return { data: null, error }
    }
  },
}
