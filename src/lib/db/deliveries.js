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

  recordLine: async ({ order_id, line_item_id, delivery_date, quantity, delivery_note, challan_number, vehicle_number, request_id }) =>
    safe(() => supabase.rpc('record_delivery_transactional', {
      p_order_id: order_id,
      p_line_item_id: line_item_id,
      p_delivery_date: delivery_date || new Date().toISOString().slice(0, 10),
      p_quantity: Number(quantity),
      p_delivery_note: delivery_note || null,
      p_challan_number: challan_number || null,
      p_vehicle_number: vehicle_number || null,
      p_request_id: request_id || crypto.randomUUID(),
    })),

  createFromOrder: async ({ order_id, vehicle_number, driver_name, delivery_note, request_id }) => {
    try {
      const operationId = request_id || crypto.randomUUID()
      const { data, error } = await safe(() => supabase.rpc('create_dispatch_transactional', {
        p_order_id: order_id,
        p_vehicle_number: vehicle_number || null,
        p_driver_name: driver_name || null,
        p_delivery_note: delivery_note || null,
        p_request_id: operationId,
      }))
      if (error) return { data: null, error }

      try {
        const { data: orderRow } = await supabase
          .from('orders')
          .select('order_number, customers(firm_name)')
          .eq('id', order_id)
          .single()
        notifications.emit({
          type: 'delivery_added',
          title: `Dispatched · ${data.challan_number}`,
          message: `${orderRow?.customers?.firm_name || 'Customer'} · ${orderRow?.order_number || ''} · ${data.deliveries?.length || 0} line${data.deliveries?.length === 1 ? '' : 's'}${vehicle_number ? ` · vehicle ${vehicle_number}` : ''}`,
          entity_type: 'order',
          entity_id: order_id,
        }).catch(() => {})
      } catch {
        // ignore
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },
}
