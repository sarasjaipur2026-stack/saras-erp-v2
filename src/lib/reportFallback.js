export const isMissingRpcError = (error) => error?.code === 'PGRST202'

export const aggregateCustomerOutstanding = (orders = []) => {
  const customers = new Map()

  for (const order of orders) {
    if (!order?.customer_id) continue
    const current = customers.get(order.customer_id) || {
      customer_id: order.customer_id,
      firm_name: order.customers?.firm_name || 'Unknown customer',
      phone: order.customers?.phone || null,
      order_count: 0,
      total_billed: 0,
      total_paid: 0,
      total_outstanding: 0,
      oldest_open: null,
    }

    current.order_count += 1
    current.total_billed += Number(order.grand_total || 0)
    current.total_paid += Number(order.advance_paid || 0)
    current.total_outstanding += Number(order.balance_due || 0)

    if (Number(order.balance_due || 0) > 0 && order.created_at) {
      if (!current.oldest_open || order.created_at < current.oldest_open) {
        current.oldest_open = order.created_at
      }
    }
    customers.set(order.customer_id, current)
  }

  return Array.from(customers.values())
    .filter(row => row.total_billed > 0)
    .sort((a, b) => b.total_outstanding - a.total_outstanding)
}
