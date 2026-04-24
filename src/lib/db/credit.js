import { supabase } from '../supabase'

/**
 * Credit-limit gate. Call before approving/booking an order.
 *
 * Returns { allowed, reason, details } — caller decides to block, warn, or override.
 * Only enforces when customer has credit_limit > 0; zero/null = no limit configured.
 *
 * `newOrderTotal` is the grand_total of the order being approved (optional for pre-validation).
 * Pass 0 when re-checking an existing order.
 */
export async function checkCustomerCredit(customerId, newOrderTotal = 0) {
  if (!customerId) return { allowed: true, reason: null, details: null }

  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, firm_name, credit_limit, overdue_days_allowed, advance_required_pct, credit_hold, credit_hold_reason')
    .eq('id', customerId)
    .single()
  if (custErr || !customer) return { allowed: true, reason: null, details: null }

  const creditLimit = Number(customer.credit_limit || 0)
  const overdueDaysAllowed = Number(customer.overdue_days_allowed || 0)
  const advanceRequiredPct = Number(customer.advance_required_pct || 0)
  const onHold = !!customer.credit_hold

  // Manual credit hold always wins — short-circuit before math
  if (onHold) {
    return {
      allowed: false,
      reason: `Customer is on credit hold${customer.credit_hold_reason ? `: ${customer.credit_hold_reason}` : ''}. Manager must release the hold or approve via override.`,
      holdType: 'manual',
      details: {
        customerName: customer.firm_name,
        creditLimit,
        creditHold: true,
        creditHoldReason: customer.credit_hold_reason || null,
      },
    }
  }

  // If no limit configured, allow
  if (creditLimit <= 0 && overdueDaysAllowed <= 0 && advanceRequiredPct <= 0) {
    return { allowed: true, reason: null, details: { creditLimit: 0 } }
  }

  // Sum outstanding balance_due across active orders
  const { data: openOrders } = await supabase
    .from('orders')
    .select('id, balance_due, grand_total, status, created_at, payment_due_date')
    .eq('customer_id', customerId)
    .not('status', 'in', '(completed,cancelled)')
    .limit(500)

  const outstanding = (openOrders || []).reduce(
    (sum, o) => sum + Number(o.balance_due || 0),
    0,
  )
  const projected = outstanding + Number(newOrderTotal || 0)

  const now = Date.now()
  const overdueOrders = (openOrders || []).filter((o) => {
    if (!o.payment_due_date) return false
    const due = new Date(o.payment_due_date).getTime()
    const daysOverdue = Math.floor((now - due) / (1000 * 60 * 60 * 24))
    return daysOverdue > overdueDaysAllowed && Number(o.balance_due || 0) > 0
  })

  const details = {
    customerName: customer.firm_name,
    creditLimit,
    currentOutstanding: outstanding,
    projectedOutstanding: projected,
    overdueCount: overdueOrders.length,
    advanceRequiredPct,
  }

  if (creditLimit > 0 && projected > creditLimit) {
    return {
      allowed: false,
      holdType: 'limit',
      reason: `Credit limit ₹${creditLimit.toLocaleString('en-IN')} would be exceeded. Outstanding ₹${outstanding.toLocaleString('en-IN')} + new order ₹${Number(newOrderTotal || 0).toLocaleString('en-IN')} = ₹${projected.toLocaleString('en-IN')}`,
      details,
    }
  }

  if (overdueDaysAllowed > 0 && overdueOrders.length > 0) {
    return {
      allowed: false,
      holdType: 'overdue',
      reason: `${overdueOrders.length} order(s) are overdue beyond ${overdueDaysAllowed} days. Collect pending payments first.`,
      details,
    }
  }

  return { allowed: true, reason: null, details }
}

/**
 * Set / clear manual credit hold.
 * Manager-only — enforced by RLS (can_manage on customers write).
 */
export async function setCustomerCreditHold(customerId, { onHold, reason }) {
  if (!customerId) return { error: new Error('customer id required') }
  const { data: sess } = await supabase.auth.getSession()
  const userId = sess?.session?.user?.id || null
  const payload = onHold
    ? { credit_hold: true, credit_hold_reason: reason || null, credit_hold_at: new Date().toISOString(), credit_hold_by: userId }
    : { credit_hold: false, credit_hold_reason: null, credit_hold_at: null, credit_hold_by: null }
  const { data, error } = await supabase
    .from('customers')
    .update(payload)
    .eq('id', customerId)
    .select('id, firm_name, credit_hold, credit_hold_reason')
    .single()
  return { data, error }
}

/**
 * Record a credit-block override. Caller should call this AFTER the order
 * is saved so order_id is available; pass null if overriding at approval.
 */
export async function logCreditOverride({ customerId, orderId, reason, snapshot }) {
  if (!customerId || !reason) return { error: new Error('customer_id + reason required') }
  const { data: sess } = await supabase.auth.getSession()
  const userId = sess?.session?.user?.id || null
  const { data, error } = await supabase
    .from('credit_override_log')
    .insert([{
      customer_id: customerId,
      order_id: orderId || null,
      override_by: userId,
      override_reason: reason,
      credit_check_snapshot: snapshot || null,
    }])
    .select()
    .single()
  return { data, error }
}
