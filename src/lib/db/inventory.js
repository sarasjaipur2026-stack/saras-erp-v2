import { supabase } from '../supabase'
import { safe, createTable, fetchAll } from './core'

// ─── STOCK MOVEMENTS ───────────────────────────────────────
const stockMovementsBase = createTable('stock_movements', {
  orderBy: 'created_at',
  orderAsc: false,
  ownerFilter: false,
  select: '*, products(name), materials(name), yarn_types(name), product_types(name), warehouses(name)',
})
export const stockMovements = {
  ...stockMovementsBase,

  getAll: async () => safe(() => fetchAll(() => supabase
      .from('stock_movements')
      .select('id, kind, quantity, unit, source_type, source_id, notes, created_at, product_id, material_id, yarn_type_id, product_type_id, warehouse_id, products(name), materials(name), yarn_types(name), product_types(name), warehouses(name)')
      .order('created_at', { ascending: false })
  )),

  listForEntity: async (kind, id) => safe(() =>
    supabase.from('stock_movements')
      .select('*, products(name), materials(name), warehouses(name)')
      .eq(kind === 'product' ? 'product_id' : 'material_id', id)
      .order('created_at', { ascending: false })
      .limit(500)
  ),

  computeBalances: async () => {
    return safe(() => supabase.rpc('stock_balances'))
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

  getAll: async () => safe(() => fetchAll(() => supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, expected_date, status, subtotal, grand_total, supplier_id, created_at, suppliers(name, firm)')
      .order('po_date', { ascending: false })
  )),

  // Accepts pre-computed tax amounts (cgst_amount, sgst_amount, igst_amount) from the UI,
  // which are calculated per-item using HSN-based GST rates. Falls back to gstRate param
  // if pre-computed amounts are not provided.
  createWithItems: async ({ supplier_id, po_date, expected_date, notes, items, gstRate = 12, cgst_amount, sgst_amount, igst_amount, request_id }) => {
    try {
      const subtotal = (items || []).reduce(
        (s, it) => s + Number(it.quantity || 0) * Number(it.rate_per_unit || 0),
        0,
      )
      // Use pre-computed HSN-based tax if provided, otherwise fall back to flat gstRate
      const cgst = cgst_amount != null ? +Number(cgst_amount).toFixed(2) : +(subtotal * (gstRate / 2) / 100).toFixed(2)
      const sgst = sgst_amount != null ? +Number(sgst_amount).toFixed(2) : +(subtotal * (gstRate / 2) / 100).toFixed(2)
      const igst = igst_amount != null ? +Number(igst_amount).toFixed(2) : 0
      const grand = +(subtotal + cgst + sgst + igst).toFixed(2)

      return await safe(() => supabase.rpc('create_purchase_order_transactional', {
        p_payload: {
          supplier_id,
          po_date: po_date || new Date().toISOString().slice(0, 10),
          expected_date: expected_date || null,
          subtotal,
          cgst_amount: cgst,
          sgst_amount: sgst,
          igst_amount: igst,
          grand_total: grand,
          notes: notes || null,
          items: (items || []).filter(it => it.yarn_type_id && Number(it.quantity) > 0).map(it => ({
            yarn_type_id: it.yarn_type_id,
            description: it.description || null,
            quantity: Number(it.quantity) || 0,
            unit: it.unit || 'kg',
            rate_per_unit: Number(it.rate_per_unit) || 0,
            amount: +(Number(it.quantity) * Number(it.rate_per_unit)).toFixed(2),
          })),
        },
        p_request_id: request_id || crypto.randomUUID(),
      }))
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

  getAll: async () => safe(() => fetchAll(() => supabase
      .from('goods_receipts')
      .select('id, grn_number, received_date, status, supplier_id, po_id, created_at, suppliers(name, firm), purchase_orders(po_number)')
      .order('received_date', { ascending: false })
  )),

  listByPo: async (poId) => safe(() =>
    supabase.from('goods_receipts').select('*').eq('po_id', poId).order('received_date', { ascending: false }).limit(100)
  ),

  createFromPo: async ({ po_id, received_date, vehicle_number, warehouse_id, notes, items, request_id }) => {
    try {
      return await safe(() => supabase.rpc('create_goods_receipt_transactional', {
        p_po_id: po_id,
        p_received_date: received_date || new Date().toISOString().slice(0, 10),
        p_vehicle_number: vehicle_number || null,
        p_warehouse_id: warehouse_id || null,
        p_notes: notes || null,
        p_items: items || [],
        p_request_id: request_id || crypto.randomUUID(),
      }))
    } catch (error) {
      return { data: null, error }
    }
  },
}
