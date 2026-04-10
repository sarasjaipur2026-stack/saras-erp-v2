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

  createFromOrder: async ({ order_id, vehicle_number, driver_name, delivery_note }) => {
    try {
      const { data: order, error: oErr } = await supabase
        .from('orders')
        .select('id, status, order_line_items(id, quantity, unit, product_id)')
        .eq('id', order_id)
        .single()
      if (oErr || !order) return { data: null, error: oErr }

      const { data: challanNum, error: chErr } = await supabase.rpc('next_challan_number')
      if (chErr) return { data: null, error: chErr }

      const today = new Date().toISOString().slice(0, 10)
      const rows = (order.order_line_items || []).map(li => ({
        order_id: order.id,
        line_item_id: li.id,
        delivery_date: today,
        quantity_delivered: li.quantity || 0,
        unit: li.unit || 'pcs',
        challan_number: challanNum,
        vehicle_number,
        driver_name,
        delivery_note,
      }))

      const { data: inserted, error: insErr } = await supabase.from('deliveries').insert(rows).select()
      if (insErr) return { data: null, error: insErr }

      const movements = (order.order_line_items || [])
        .filter(li => li.product_id)
        .map(li => ({
          kind: 'out',
          product_id: li.product_id,
          quantity: li.quantity || 0,
          unit: li.unit || 'pcs',
          source_type: 'delivery',
          source_id: inserted?.[0]?.id,
          notes: `Dispatched via ${challanNum}`,
        }))
      if (movements.length) {
        await supabase.from('stock_movements').insert(movements)
      }

      await supabase.from('orders').update({ status: 'dispatch' }).eq('id', order_id)

      try {
        const { data: orderRow } = await supabase
          .from('orders')
          .select('order_number, customers(firm_name)')
          .eq('id', order_id)
          .single()
        notifications.emit({
          type: 'delivery_added',
          title: `Dispatched · ${challanNum}`,
          message: `${orderRow?.customers?.firm_name || 'Customer'} · ${orderRow?.order_number || ''} · ${rows.length} line${rows.length === 1 ? '' : 's'}${vehicle_number ? ` · vehicle ${vehicle_number}` : ''}`,
          entity_type: 'order',
          entity_id: order_id,
        }).catch(() => {})
      } catch {
        // ignore
      }

      return { data: { challan_number: challanNum, deliveries: inserted }, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },
}
