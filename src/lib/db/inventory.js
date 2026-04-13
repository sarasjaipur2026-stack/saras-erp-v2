import { supabase } from '../supabase'
import { safe, createTable } from './core'

// ─── STOCK MOVEMENTS ───────────────────────────────────────
const stockMovementsBase = createTable('stock_movements', {
  orderBy: 'created_at',
  orderAsc: false,
  ownerFilter: false,
  select: '*, products(name), materials(name), yarn_types(name), product_types(name), warehouses(name)',
})
export const stockMovements = {
  ...stockMovementsBase,

  getAll: async () => safe(() =>
    supabase
      .from('stock_movements')
      .select('id, kind, quantity, unit, source_type, source_id, notes, created_at, product_id, material_id, yarn_type_id, product_type_id, warehouse_id, products(name), materials(name), yarn_types(name), product_types(name), warehouses(name)')
      .order('created_at', { ascending: false })
      .limit(500)
  ),

  listForEntity: async (kind, id) => safe(() =>
    supabase.from('stock_movements')
      .select('*, products(name), materials(name), warehouses(name)')
      .eq(kind === 'product' ? 'product_id' : 'material_id', id)
      .order('created_at', { ascending: false })
      .limit(500)
  ),

  computeBalances: async () => {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('id, kind, quantity, unit, product_id, material_id, yarn_type_id, product_type_id, warehouse_id, created_at, products(name), materials(name), yarn_types(name), product_types(name), warehouses(name)')
      .order('created_at', { ascending: true })
      .limit(5000)
    if (error) return { data: null, error }
    const map = new Map()
    for (const m of data || []) {
      const key = [
        m.product_id || '',
        m.material_id || '',
        m.yarn_type_id || '',
        m.product_type_id || '',
        m.warehouse_id || '',
      ].join('|')
      const cur = map.get(key) || {
        key,
        product_id: m.product_id,
        material_id: m.material_id,
        yarn_type_id: m.yarn_type_id,
        product_type_id: m.product_type_id,
        warehouse_id: m.warehouse_id,
        product_name:
          m.products?.name ||
          m.product_types?.name ||
          m.materials?.name ||
          m.yarn_types?.name,
        material_name: m.materials?.name || m.yarn_types?.name,
        warehouse_name: m.warehouses?.name,
        is_finished_good: !!(m.product_id || m.product_type_id),
        unit: m.unit,
        quantity: 0,
        last_move: m.created_at,
      }
      const sign = m.kind === 'out' ? -1 : 1
      cur.quantity += sign * Number(m.quantity || 0)
      if (m.created_at > (cur.last_move || '')) cur.last_move = m.created_at
      map.set(key, cur)
    }
    return { data: Array.from(map.values()), error: null }
  },
}

// ─── PURCHASE ORDERS ───────────────────────────────────────
const purchaseOrdersBase = createTable('purchase_orders', {
  orderBy: 'po_date',
  orderAsc: false,
  ownerFilter: false,
  select: '*, suppliers(name, firm, gstin), purchase_order_items(*, yarn_types(name))',
})
export const purchaseOrders = {
  ...purchaseOrdersBase,

  getAll: async () => safe(() =>
    supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, expected_date, status, subtotal, grand_total, supplier_id, created_at, suppliers(name, firm)')
      .order('po_date', { ascending: false })
      .limit(1000)
  ),

  // gstRate: total GST percentage (default 12). Callers should pass the rate
  // from app_settings when available to stay consistent with SettingsPage config.
  createWithItems: async ({ supplier_id, po_date, expected_date, notes, items, gstRate = 12 }) => {
    try {
      const { data: poNum, error: numErr } = await supabase.rpc('next_po_number')
      if (numErr) return { data: null, error: numErr }

      const subtotal = (items || []).reduce(
        (s, it) => s + Number(it.quantity || 0) * Number(it.rate_per_unit || 0),
        0,
      )
      const cgst = +(subtotal * (gstRate / 2) / 100).toFixed(2)
      const sgst = +(subtotal * (gstRate / 2) / 100).toFixed(2)
      const grand = +(subtotal + cgst + sgst).toFixed(2)

      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .insert([{
          po_number: poNum,
          supplier_id,
          po_date: po_date || new Date().toISOString().slice(0, 10),
          expected_date: expected_date || null,
          status: 'issued',
          subtotal,
          cgst_amount: cgst,
          sgst_amount: sgst,
          grand_total: grand,
          notes: notes || null,
        }])
        .select()
        .single()
      if (poErr) return { data: null, error: poErr }

      if (items?.length) {
        const rows = items
          .filter(it => it.yarn_type_id && Number(it.quantity) > 0)
          .map(it => ({
            po_id: po.id,
            yarn_type_id: it.yarn_type_id,
            description: it.description || null,
            quantity: Number(it.quantity) || 0,
            unit: it.unit || 'kg',
            rate_per_unit: Number(it.rate_per_unit) || 0,
            amount: +(Number(it.quantity) * Number(it.rate_per_unit)).toFixed(2),
          }))
        if (rows.length) {
          const { error: itemErr } = await supabase.from('purchase_order_items').insert(rows)
          if (itemErr) return { data: po, error: itemErr }
        }
      }
      return { data: po, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },
}

// ─── GOODS RECEIPTS (GRN) ──────────────────────────────────
const goodsReceiptsBase = createTable('goods_receipts', {
  orderBy: 'received_date',
  orderAsc: false,
  ownerFilter: false,
  select: '*, suppliers(name, firm), purchase_orders(po_number), goods_receipt_items(*, yarn_types(name))',
})
export const goodsReceipts = {
  ...goodsReceiptsBase,

  getAll: async () => safe(() =>
    supabase
      .from('goods_receipts')
      .select('id, grn_number, received_date, status, supplier_id, po_id, created_at, suppliers(name, firm), purchase_orders(po_number)')
      .order('received_date', { ascending: false })
      .limit(1000)
  ),

  listByPo: async (poId) => safe(() =>
    supabase.from('goods_receipts').select('*').eq('po_id', poId).order('received_date', { ascending: false }).limit(100)
  ),

  createFromPo: async ({ po_id, received_date, vehicle_number, warehouse_id, notes, items }) => {
    try {
      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .select('id, supplier_id, status, purchase_order_items(*)')
        .eq('id', po_id)
        .single()
      if (poErr || !po) return { data: null, error: poErr }

      const { data: grnNum, error: numErr } = await supabase.rpc('next_grn_number')
      if (numErr) return { data: null, error: numErr }

      const today = received_date || new Date().toISOString().slice(0, 10)
      const { data: grn, error: grnErr } = await supabase
        .from('goods_receipts')
        .insert([{
          grn_number: grnNum,
          po_id,
          supplier_id: po.supplier_id,
          received_date: today,
          vehicle_number: vehicle_number || null,
          warehouse_id: warehouse_id || null,
          notes: notes || null,
        }])
        .select()
        .single()
      if (grnErr) return { data: null, error: grnErr }

      const effectiveItems = (items && items.length)
        ? items
        : (po.purchase_order_items || []).map(it => ({
            po_item_id: it.id,
            yarn_type_id: it.yarn_type_id,
            quantity_received: Number(it.quantity) - Number(it.quantity_received || 0),
            unit: it.unit,
          }))

      const grnItemRows = effectiveItems
        .filter(it => Number(it.quantity_received) > 0)
        .map(it => ({
          grn_id: grn.id,
          po_item_id: it.po_item_id || null,
          yarn_type_id: it.yarn_type_id,
          quantity_received: Number(it.quantity_received) || 0,
          unit: it.unit || 'kg',
          qc_status: 'pending',
        }))

      if (grnItemRows.length) {
        const { error: itemErr } = await supabase.from('goods_receipt_items').insert(grnItemRows)
        if (itemErr) return { data: grn, error: itemErr }

        const poItemIds = grnItemRows.filter(it => it.po_item_id).map(it => it.po_item_id)
        if (poItemIds.length) {
          const { data: poItems } = await supabase
            .from('purchase_order_items')
            .select('id, quantity, quantity_received')
            .in('id', poItemIds)
          if (poItems) {
            const receivedMap = new Map(grnItemRows.map(it => [it.po_item_id, it.quantity_received]))
            await Promise.all(poItems.map(prev =>
              supabase
                .from('purchase_order_items')
                .update({ quantity_received: Number(prev.quantity_received || 0) + Number(receivedMap.get(prev.id) || 0) })
                .eq('id', prev.id)
            ))
          }
        }

        const stockRows = grnItemRows.map(it => ({
          kind: 'in',
          yarn_type_id: it.yarn_type_id,
          warehouse_id: warehouse_id || null,
          quantity: it.quantity_received,
          unit: it.unit,
          source_type: 'grn',
          source_id: grn.id,
          notes: `Received via ${grnNum}`,
        }))
        await supabase.from('stock_movements').insert(stockRows)
      }

      const { data: refreshedItems } = await supabase
        .from('purchase_order_items')
        .select('quantity, quantity_received')
        .eq('po_id', po_id)
      const allReceived = (refreshedItems || []).every(
        it => Number(it.quantity_received || 0) >= Number(it.quantity || 0),
      )
      const anyReceived = (refreshedItems || []).some(
        it => Number(it.quantity_received || 0) > 0,
      )
      await supabase
        .from('purchase_orders')
        .update({ status: allReceived ? 'received' : anyReceived ? 'partially_received' : 'issued' })
        .eq('id', po_id)

      return { data: { grn_number: grnNum, grn }, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },
}
