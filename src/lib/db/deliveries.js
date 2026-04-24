import { supabase } from '../supabase'
import { safe, createTable } from './core'
import { notifications } from './notifications'

// ─── DELIVERIES ────────────────────────────────────────────
const deliveriesBase = createTable('deliveries', {
  ownerFilter: false,
  select: '*, orders(order_number, customer_id, customers(firm_name))',
})
export const deliveries = {
  ...deliveriesBase,

  listByOrder: async (orderId) => safe(() =>
    supabase
      .from('deliveries')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true })
      .limit(200)
  ),

  listByLineItem: async (lineItemId) => safe(() =>
    supabase
      .from('deliveries')
      .select('*')
      .eq('line_item_id', lineItemId)
      .order('created_at', { ascending: true })
      .limit(200)
  ),

  // Atomic dispatch. Delegates to create_delivery_atomic RPC so the delivery +
  // stock movements + per-line delivered_qty + order status are committed or
  // rolled back as one transaction. Auto-flips order status to
  // 'partially_dispatched' when some lines still have pending qty, or
  // 'dispatch' when every line is fully delivered.
  //
  // Pass `line_items: [{line_item_id, qty}]` to ship a specific partial.
  // Omit to ship the full pending qty on every line.
  createFromOrder: async ({ order_id, vehicle_number, driver_name, delivery_note, line_items }) => {
    try {
      const { data, error } = await supabase.rpc('create_delivery_atomic', {
        p_order_id: order_id,
        p_vehicle_number: vehicle_number || null,
        p_driver_name: driver_name || null,
        p_delivery_note: delivery_note || null,
        p_line_items: line_items && line_items.length ? line_items : null,
      })
      if (error) return { data: null, error }

      // Fire-and-forget notification (explicitly outside the atomic unit)
      try {
        const { data: orderRow } = await supabase
          .from('orders')
          .select('order_number, customers(firm_name)')
          .eq('id', order_id)
          .single()
        const deliveryCount = Array.isArray(data?.delivery_ids) ? data.delivery_ids.length : 0
        notifications.emit({
          type: 'delivery_added',
          title: `Dispatched · ${data?.challan_number || ''}`,
          message: `${orderRow?.customers?.firm_name || 'Customer'} · ${orderRow?.order_number || ''} · ${deliveryCount} line${deliveryCount === 1 ? '' : 's'}${vehicle_number ? ` · vehicle ${vehicle_number}` : ''}${data?.order_status === 'partially_dispatched' ? ' (partial)' : ''}`,
          entity_type: 'order',
          entity_id: order_id,
        }).catch(() => {})
      } catch {
        // notification failures are non-fatal
      }

      return {
        data: {
          challan_number: data?.challan_number,
          delivery_ids: data?.delivery_ids || [],
          order_status: data?.order_status,
        },
        error: null,
      }
    } catch (error) {
      return { data: null, error }
    }
  },
}
