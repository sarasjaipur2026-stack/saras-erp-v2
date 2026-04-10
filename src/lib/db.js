import { supabase, withRetry } from './supabase'

// ─── GENERIC CRUD FACTORY ──────────────────────────────────
// Creates list/get/create/update/delete for ANY Supabase table.
// Usage: const customers = createTable('customers', { orderBy: 'created_at' })
//
// This replaces 1000+ lines of repetitive code with ~15 lines per table.

const REQUEST_TIMEOUT_MS = 15000

const safe = async (fn) => {
  let timeoutId
  try {
    const result = await Promise.race([
      withRetry(fn),
      new Promise((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error('Request timed out after 15s — check your connection or Supabase project status')),
          REQUEST_TIMEOUT_MS,
        )
      }),
    ])
    return result
  } catch (error) {
    return { data: null, error }
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function createTable(table, opts = {}) {
  const { orderBy = 'created_at', orderAsc = false, select = '*', ownerFilter = true } = opts

  return {
    list: async (userId) => safe(() => {
      let q = supabase.from(table).select(select)
      if (ownerFilter && userId) q = q.eq('user_id', userId)
      return q.order(orderBy, { ascending: orderAsc }).limit(1000)
    }),

    getAll: async () => safe(() =>
      supabase.from(table).select(select).order(orderBy, { ascending: orderAsc }).limit(1000)
    ),

    get: async (id) => safe(() =>
      supabase.from(table).select(select).eq('id', id).single()
    ),

    create: async (data) => safe(() =>
      supabase.from(table).insert(Array.isArray(data) ? data : [data]).select().single()
    ),

    createMany: async (items) => safe(() =>
      supabase.from(table).insert(items).select()
    ),

    update: async (id, data) => safe(() =>
      supabase.from(table).update(data).eq('id', id).select().single()
    ),

    delete: async (id) => safe(() =>
      supabase.from(table).delete().eq('id', id)
    ),

    // Convenience: query with custom filters
    query: (builder) => safe(() => builder(supabase.from(table))),
  }
}

// ─── TABLE INSTANCES ───────────────────────────────────────
export const customers = createTable('customers', { ownerFilter: false })

export const products = createTable('products', { ownerFilter: false })

export const materials = createTable('materials', { ownerFilter: false })

export const machines = createTable('machines', { orderBy: 'id', orderAsc: true, ownerFilter: false })

export const colors = createTable('colors', { ownerFilter: false })

export const suppliers = createTable('suppliers', { ownerFilter: false })

export const brokers = createTable('brokers', { ownerFilter: false })

export const chargeTypes = createTable('charge_types', { ownerFilter: false })

export const orderTypes = createTable('order_types', { ownerFilter: false })

export const paymentTerms = createTable('payment_terms', { ownerFilter: false })

export const warehouses = createTable('warehouses', { ownerFilter: false })

export const banks = createTable('banks', { ownerFilter: false })

export const staff = createTable('staff', { ownerFilter: false })

export const currencies = createTable('currencies', { ownerFilter: false })

export const calculatorProfiles = createTable('calculator_profiles', { ownerFilter: false })

export const stock = createTable('stock', { ownerFilter: false })

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

// ─── STOCK MOVEMENTS ───────────────────────────────────────
const stockMovementsBase = createTable('stock_movements', {
  orderBy: 'created_at',
  orderAsc: false,
  ownerFilter: false,
  select: '*, products(name), materials(name), yarn_types(name), product_types(name), warehouses(name)',
})
export const stockMovements = {
  ...stockMovementsBase,

  // Lightweight list for StockPage — skip some nested joins
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
    // Aggregate all stock movements into running balances per item × warehouse.
    // Item key includes legacy products/materials AND new yarn_types/product_types
    // so purchases (yarn_type_id) and production (product_id) all roll up.
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

  // Lightweight list for PurchasePage — skip nested items join
  getAll: async () => safe(() =>
    supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, expected_date, status, subtotal, grand_total, supplier_id, created_at, suppliers(name, firm)')
      .order('po_date', { ascending: false })
      .limit(1000)
  ),

  createWithItems: async ({ supplier_id, po_date, expected_date, notes, items }) => {
    try {
      const { data: poNum, error: numErr } = await supabase.rpc('next_po_number')
      if (numErr) return { data: null, error: numErr }

      const subtotal = (items || []).reduce(
        (s, it) => s + Number(it.quantity || 0) * Number(it.rate_per_unit || 0),
        0,
      )
      const gstRate = 12 // default for most yarn HSN codes
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

  // Lightweight list — skip nested items join
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
      // Pull PO + items to validate
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

      // Items: if none provided, default to full PO quantities
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

        // Bump quantity_received on PO items — batch fetch then batch update
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

        // Stock-in movements
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

      // Update PO status — mark received if all items fully received, partial otherwise
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

// ─── NEW MASTER TABLES (Session A) ─────────────────────────
export const hsnCodes = createTable('hsn_codes', { orderBy: 'code', orderAsc: true, ownerFilter: false })
export const units = createTable('units', { orderBy: 'unit_type', orderAsc: true, ownerFilter: false })
export const machineTypes = createTable('machine_types', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const productTypes = createTable('product_types', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const yarnTypes = createTable('yarn_types', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const yarnSupplierRates = createTable('yarn_supplier_rates', { ownerFilter: false })
export const processTypes = createTable('process_types', { orderBy: 'sequence_order', orderAsc: true, ownerFilter: false })
export const operators = createTable('operators', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const packagingTypes = createTable('packaging_types', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const transports = createTable('transports', { orderBy: 'vehicle_number', orderAsc: true, ownerFilter: false })
export const qualityParameters = createTable('quality_parameters', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const chaalTypes = createTable('chaal_types', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const customFieldDefinitions = createTable('custom_field_definitions', { ownerFilter: false })

// ─── ORDERS (custom select with joins) ─────────────────────
export const orders = {
  ...createTable('orders', {
    select: '*, customers(firm_name, contact_name, city)',
    ownerFilter: false,
  }),

  // Lightweight list for OrdersPage — only the columns the table actually renders
  list: async (userId) => safe(() =>
    supabase
      .from('orders')
      .select('id, order_number, status, priority, grand_total, balance_due, advance_paid, delivery_date_1, created_at, nature, customers(firm_name, contact_name)')
      .order('created_at', { ascending: false })
      .limit(1000)
  ),

  // Override get with deep joins (for detail/edit pages)
  get: async (id) => safe(() =>
    supabase
      .from('orders')
      .select(`
        *,
        customers(*),
        order_types(*),
        brokers(*),
        payment_terms(*),
        order_line_items(
          *,
          products(*),
          materials(*),
          machines(*),
          colors(*),
          calculator_profiles(*)
        ),
        order_charges(*, charge_types(*)),
        deliveries(*),
        payments(*)
      `)
      .eq('id', id)
      .single()
  ),

  // Shim for legacy OrdersPage bulk action — thin wrapper around update() + notification emit.
  updateStatus: async (id, status) => {
    const result = await safe(() =>
      supabase.from('orders').update({ status }).eq('id', id).select('*, customers(firm_name)').single()
    )
    if (!result?.error && result?.data) {
      notifications.emit({
        type: status === 'approved' ? 'order_approved' : 'status_changed',
        title: `Order ${result.data.order_number || ''} → ${status}`,
        message: `${result.data.customers?.firm_name || 'Customer'} · status changed to ${status}`,
        entity_type: 'order',
        entity_id: id,
      }).catch(() => {})
    }
    return result
  },

  create: async (order) => {
    try {
      // Resolve prefix from order_type_id (falls back to 'ORD')
      let prefix = 'ORD'
      if (order.order_type_id) {
        const { data: ot } = await supabase
          .from('order_types')
          .select('prefix')
          .eq('id', order.order_type_id)
          .single()
        if (ot?.prefix) prefix = ot.prefix
      }

      // Resolve current user id
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) return { data: null, error: new Error('Not authenticated') }

      // Call Supabase function to generate order number
      const { data: result, error: fnErr } = await supabase.rpc('generate_order_number', {
        p_user_id: userId,
        p_prefix: prefix,
      })

      if (fnErr) {
        return { data: null, error: fnErr }
      }

      const order_number = result

      return await safe(() =>
        supabase.from('orders').insert([{ ...order, order_number, user_id: userId }]).select().single()
      )
    } catch (error) {
      return { data: null, error }
    }
  },

  duplicate: async (id) => {
    try {
      const { data: order, error: getErr } = await orders.get(id)
      if (getErr || !order) return { data: null, error: getErr }

      const {
        order_line_items,
        order_charges,
        deliveries: _d,
        payments: _p,
        customers: _c,
        order_types: _ot,
        brokers: _b,
        payment_terms: _pt,
        id: _id,
        order_number: _on,
        created_at: _ca,
        updated_at: _ua,
        approved_by: _ab,
        approved_at: _aa,
        ...orderData
      } = order

      // Show preview
      const preview = {
        originalOrderNumber: _on,
        lineItemCount: order_line_items?.length || 0,
        chargeCount: order_charges?.length || 0,
        status: 'Will be created as draft',
      }

      const { data: newOrder, error: createErr } = await orders.create(orderData)
      if (createErr || !newOrder) return { data: null, error: createErr, preview }

      // Duplicate line items
      if (order_line_items?.length) {
        const items = order_line_items.map(({
          id: _iid,
          order_id: _oid,
          created_at: _ic,
          products: _p,
          materials: _m,
          machines: _mc,
          colors: _cl,
          calculator_profiles: _cp,
          ...rest
        }) => ({
          ...rest,
          order_id: newOrder.id,
        }))
        const { error: lineErr } = await lineItems.createMany(items)
        if (lineErr) return { data: newOrder, error: lineErr, preview }
      }

      // Duplicate charges
      if (order_charges?.length) {
        const charges = order_charges.map(({
          id: _cid,
          order_id: _oid,
          charge_types: _ct,
          created_at: _cc,
          ...rest
        }) => ({
          ...rest,
          order_id: newOrder.id,
        }))
        const { error: chargeErr } = await orderCharges.createMany(charges)
        if (chargeErr) return { data: newOrder, error: chargeErr, preview }
      }

      return { data: newOrder, error: null, preview }
    } catch (error) {
      return { data: null, error }
    }
  },

  convertSampleToFull: async (id) => {
    try {
      // Get the sample order
      const { data: sampleOrder, error: getErr } = await orders.get(id)
      if (getErr || !sampleOrder) return { data: null, error: getErr }

      // Create new order with link to sample
      const { data: fullOrder, error: createErr } = await orders.create({
        customer_id: sampleOrder.customer_id,
        order_type_id: sampleOrder.order_type_id,
        broker_id: sampleOrder.broker_id,
        payment_terms_id: sampleOrder.payment_terms_id,
        parent_sample_id: id,
        status: 'draft',
      })

      if (createErr || !fullOrder) return { data: null, error: createErr }

      return { data: fullOrder, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },
}

// ─── LINE ITEMS ────────────────────────────────────────────
export const lineItems = createTable('order_line_items', { ownerFilter: false })

// ─── ORDER CHARGES ─────────────────────────────────────────
export const orderCharges = createTable('order_charges', { ownerFilter: false })

// ─── ORDER TEMPLATES ───────────────────────────────────────
export const orderTemplates = createTable('order_templates', { ownerFilter: false })

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
      // Fetch order + line items
      const { data: order, error: oErr } = await supabase
        .from('orders')
        .select('id, status, order_line_items(id, quantity, unit, product_id)')
        .eq('id', order_id)
        .single()
      if (oErr || !order) return { data: null, error: oErr }

      // Generate challan number
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

      // Record stock-out movements for each line item
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

      // Move order to dispatch status
      await supabase.from('orders').update({ status: 'dispatch' }).eq('id', order_id)

      // Notification side-effect
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

// ─── JOBWORK ───────────────────────────────────────────────
const jobworkBase = createTable('jobwork_tracking', { ownerFilter: false })
export const jobwork = {
  ...jobworkBase,

  listByLineItem: async (lineItemId) => safe(() =>
    supabase
      .from('jobwork_tracking')
      .select('*')
      .eq('line_item_id', lineItemId)
      .order('created_at', { ascending: false })
      .limit(100)
  ),
}

// ─── PRODUCTION PLANS ──────────────────────────────────────
const productionPlansBase = createTable('production_plans', {
  orderBy: 'created_at',
  orderAsc: false,
  ownerFilter: false,
  select: '*, orders(id, order_number, status, customers(firm_name)), machines(id, name, code), materials(id, name)',
})
export const productionPlans = {
  ...productionPlansBase,
  // Lightweight list for ProductionPage
  getAll: async () => safe(() =>
    supabase
      .from('production_plans')
      .select('id, status, planned_qty, completed_qty, start_date, end_date, machine_id, material_id, order_id, created_at, orders(id, order_number, customers(firm_name)), machines(id, name, code), materials(id, name)')
      .order('created_at', { ascending: false })
      .limit(1000)
  ),
  listByOrder: async (orderId) => safe(() =>
    supabase.from('production_plans').select('*, machines(name), materials(name)').eq('order_id', orderId).order('created_at', { ascending: false }).limit(100)
  ),
  // Override update to emit a stock-in movement whenever a plan is marked completed
  // (or completed_qty is bumped on an already-completed plan).
  update: async (id, patch) => {
    const result = await productionPlansBase.update(id, patch)
    if (result?.error || !result?.data) return result
    const plan = result.data
    const isCompleting = patch.status === 'completed'
    if (isCompleting && (plan.completed_qty || 0) > 0 && plan.product_id) {
      try {
        // Skip if a stock-in for this plan already exists (idempotent).
        const { data: existing } = await supabase
          .from('stock_movements')
          .select('id')
          .eq('source_type', 'production')
          .eq('source_id', plan.id)
          .limit(1)
        if (!existing || existing.length === 0) {
          await supabase.from('stock_movements').insert([{
            kind: 'in',
            product_id: plan.product_id,
            quantity: plan.completed_qty,
            unit: 'pcs',
            source_type: 'production',
            source_id: plan.id,
            notes: `Production complete (plan ${plan.id.slice(0, 8)})`,
          }])
        }
      } catch (e) {
        // Do not block the UI if stock-in write fails — surface in console.
        // eslint-disable-next-line no-console
        if (import.meta.env.DEV) console.error('[productionPlans.update] stock-in hook failed', e)
      }
    }
    return result
  },
  createFromOrder: async (orderId) => {
    try {
      const { data: order, error: ordErr } = await supabase
        .from('orders')
        .select('id, order_number, status, order_line_items(id, product_id, quantity, material_id, machine_id)')
        .eq('id', orderId)
        .single()
      if (ordErr || !order) return { data: null, error: ordErr }
      const items = order.order_line_items || []
      if (!items.length) return { data: null, error: new Error('Order has no line items') }
      const plans = items.map(li => ({
        order_id: order.id,
        line_item_id: li.id,
        machine_id: li.machine_id || null,
        material_id: li.material_id || null,
        planned_qty: li.quantity || 0,
        status: 'planned',
      }))
      const { data, error } = await supabase.from('production_plans').insert(plans).select()
      if (!error) {
        await supabase.from('orders').update({ status: 'production' }).eq('id', orderId)
      }
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },
}

// ─── ENQUIRIES ─────────────────────────────────────────────
export const enquiries = {
  ...createTable('enquiries', { select: '*, customers(*)', ownerFilter: false }),

  // Lightweight list for EnquiriesPage
  list: async (userId) => safe(() =>
    supabase
      .from('enquiries')
      .select('id, enquiry_number, status, source, priority, expected_value, followup_date, created_at, customers(firm_name, contact_name)')
      .order('created_at', { ascending: false })
      .limit(1000)
  ),

  create: async (data) => {
    try {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) return { data: null, error: new Error('Not authenticated') }

      // Generate enquiry number from enquiries table (not orders)
      const now = new Date()
      const month = now.getMonth() + 1
      const yearStart = month >= 4 ? now.getFullYear() : now.getFullYear() - 1
      const yearEnd = yearStart + 1
      const fyPrefix = `${yearStart % 100}-${yearEnd % 100}`
      const pattern = `ENQ/${fyPrefix}/%`

      const { data: maxRow } = await supabase
        .from('enquiries')
        .select('enquiry_number')
        .eq('user_id', userId)
        .like('enquiry_number', pattern)
        .order('enquiry_number', { ascending: false })
        .limit(1)
        .single()

      const lastSeq = maxRow?.enquiry_number
        ? parseInt(maxRow.enquiry_number.split('/')[2], 10) || 0
        : 0
      const enquiry_number = `ENQ/${fyPrefix}/${String(lastSeq + 1).padStart(4, '0')}`

      return await safe(() =>
        supabase.from('enquiries').insert([{ ...data, enquiry_number, user_id: userId }]).select('*, customers(*)').single()
      )
    } catch (error) {
      return { data: null, error }
    }
  },

  get: async (id) => safe(() =>
    supabase.from('enquiries').select('*, customers(*)').eq('id', id).single()
  ),

  convertToOrder: async (enquiryId) => {
    try {
      const { data: enquiry, error: getErr } = await enquiries.get(enquiryId)
      if (getErr || !enquiry) return { data: null, error: getErr }

      const { data: order, error: createErr } = await orders.create({
        customer_id: enquiry.customer_id,
        order_type_id: enquiry.order_type_id,
        broker_id: enquiry.broker_id,
        payment_terms_id: enquiry.payment_terms_id,
        status: 'draft',
        converted_enquiry_id: enquiryId,
      })
      if (createErr || !order) return { data: null, error: createErr }

      const { error: updateErr } = await safe(() =>
        supabase
          .from('enquiries')
          .update({ status: 'converted', converted_order_id: order.id })
          .eq('id', enquiryId)
          .select()
          .single()
      )
      return { data: order, error: updateErr }
    } catch (error) {
      return { data: null, error }
    }
  },
}

// ─── ACTIVITY LOG ──────────────────────────────────────────
export const activityLog = {
  ...createTable('activity_log', { orderBy: 'created_at', orderAsc: false, ownerFilter: false }),

  listByEntity: async (entityType, entityId) => safe(() =>
    supabase
      .from('activity_log')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(100)
  ),

  addComment: async (staffId, entityType, entityId, comment) => safe(() =>
    supabase
      .from('activity_log')
      .insert([{
        staff_id: staffId,
        entity_type: entityType,
        entity_id: entityId,
        action: 'comment',
        comment,
        created_at: new Date().toISOString(),
      }])
      .select()
      .single()
  ),
}

// ─── NOTIFICATIONS ────────────────────────────────────────
export const notifications = {
  ...createTable('notifications', { orderBy: 'created_at', orderAsc: false, ownerFilter: false }),

  getUnread: async (staffId) => safe(() =>
    supabase
      .from('notifications')
      .select('*')
      .eq('staff_id', staffId)
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(50)
  ),

  // Fetch every notification for the current user (latest first), capped at 200.
  // staffId is the Supabase auth user id; we accept legacy notifications where
  // staff_id is null as well so nothing is silently hidden.
  listForUser: async (staffId) => safe(() =>
    supabase
      .from('notifications')
      .select('*')
      .or(`staff_id.eq.${staffId},staff_id.is.null`)
      .order('created_at', { ascending: false })
      .limit(200)
  ),

  markAsRead: async (id) => safe(() =>
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
  ),

  markAllAsRead: async (staffId) => safe(() =>
    supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('staff_id', staffId)
      .is('read_at', null)
  ),

  // Emit a notification: writes a DB row AND fires a WhatsApp webhook if
  // configured. Never throws — failure falls through silently with a console
  // log so the calling business flow (e.g. payments.record) isn't blocked.
  // Shape: { type, title, message, entity_type?, entity_id?, staff_id? }
  emit: async (n) => {
    try {
      // notifications.user_id is NOT NULL — resolve the current session user
      // so business-flow hooks (orders.updateStatus, payments.record,
      // deliveries.createFromOrder) do not silently 400 on insert.
      let userId = n.user_id || null
      if (!userId) {
        const { data: sess } = await supabase.auth.getSession()
        userId = sess?.session?.user?.id || null
      }
      if (!userId) {
        // eslint-disable-next-line no-console
        if (import.meta.env.DEV) console.warn('[notifications.emit] skipped — no authenticated user')
        return { data: null, error: new Error('no authenticated user') }
      }
      const row = {
        user_id: userId,
        type: n.type || 'general',
        title: n.title || 'Notification',
        message: n.message || '',
        entity_type: n.entity_type || null,
        entity_id: n.entity_id || null,
        staff_id: n.staff_id || null,
      }
      const { data, error } = await supabase.from('notifications').insert([row]).select().single()
      if (error) {
        if (import.meta.env.DEV) console.error('[notifications.emit] insert failed', error)
      }
      // Fire WhatsApp webhook in the background — do not await the result.
      fireWebhook(row).catch(err => {
        if (import.meta.env.DEV) console.error('[notifications.emit] webhook failed', err)
      })
      return { data, error }
    } catch (err) {
      if (import.meta.env.DEV) console.error('[notifications.emit] unexpected', err)
      return { data: null, error: err }
    }
  },
}

// Internal — non-exported so call sites don't confuse it with emit().
async function fireWebhook(notification) {
  try {
    const { data: rows, error } = await supabase
      .from('app_settings')
      .select('key, value')
      .in('key', ['notifications.whatsapp_webhook_url', 'notifications.whatsapp_enabled'])
    if (error) return
    const cfg = {}
    for (const r of rows || []) cfg[r.key] = r.value || {}
    const enabled = cfg['notifications.whatsapp_enabled']?.enabled === true
    const url = cfg['notifications.whatsapp_webhook_url']?.url
    if (!enabled || !url) return
    // Fire-and-forget POST. Many WhatsApp bridges (Baileys, Gupshup, Meta Cloud
    // API, n8n, Zapier) accept a plain JSON envelope — keep the shape generic.
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      mode: 'no-cors', // webhook targets rarely CORS-enable; we don't need to read the response
      body: JSON.stringify({
        type: notification.type,
        title: notification.title,
        message: notification.message,
        entity_type: notification.entity_type,
        entity_id: notification.entity_id,
        text: `*${notification.title}*\n${notification.message}`,
        sent_at: new Date().toISOString(),
      }),
    })
  } catch {
    // Silent — webhook failures should never break business flows.
  }
}

// ─── APP SETTINGS ──────────────────────────────────────────
// Tiny key/value store for app-wide config (webhook URLs, feature flags, etc.)
export const appSettings = {
  getAll: async () => safe(() => supabase.from('app_settings').select('*').order('key')),

  get: async (key) => safe(() =>
    supabase.from('app_settings').select('*').eq('key', key).maybeSingle()
  ),

  // Upsert a single setting. value is stored as jsonb so callers must pass an object.
  set: async (key, value, description) => safe(() =>
    supabase.from('app_settings').upsert({
      key,
      value,
      description: description || undefined,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' }).select().single()
  ),
}

// ─── ATTACHMENTS ──────────────────────────────────────────
export const attachments = {
  ...createTable('attachments', { orderBy: 'created_at', orderAsc: false, ownerFilter: false }),

  listByEntity: async (entityType, entityId) => safe(() =>
    supabase
      .from('attachments')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(100)
  ),

  upload: async (entityType, entityId, file, uploadedBy) => {
    try {
      const bucket = 'order-attachments'
      const fileName = `${entityType}/${entityId}/${Date.now()}_${file.name}`

      const { error: uploadErr } = await supabase.storage
        .from(bucket)
        .upload(fileName, file)

      if (uploadErr) return { data: null, error: uploadErr }

      // Create attachment record
      const { data: attachment, error: recordErr } = await safe(() =>
        supabase
          .from('attachments')
          .insert([{
            entity_type: entityType,
            entity_id: entityId,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            storage_path: fileName,
            uploaded_by: uploadedBy,
          }])
          .select()
          .single()
      )

      return { data: attachment, error: recordErr }
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
      const { data: order, error: oErr } = await supabase
        .from('orders')
        .select('grand_total, advance_paid, balance_due')
        .eq('id', order_id)
        .single()
      if (oErr) return { data: null, error: oErr }

      const { data: inserted, error: pErr } = await supabase.from('payments').insert([{
        order_id, amount, payment_mode, payment_date, reference_number, bank_id, notes,
      }]).select().single()
      if (pErr) return { data: null, error: pErr }

      // Recompute balances
      const { data: allPayments } = await supabase.from('payments').select('amount').eq('order_id', order_id).limit(500)
      const totalPaid = (allPayments || []).reduce((s, p) => s + Number(p.amount || 0), 0)
      const newBalance = Number(order.grand_total || 0) - totalPaid
      const newStatus = newBalance <= 0 ? 'completed' : undefined
      const updates = { advance_paid: totalPaid, balance_due: newBalance }
      if (newStatus) updates.status = newStatus
      await supabase.from('orders').update(updates).eq('id', order_id)

      // Also update invoice if one exists for this order
      const { data: inv } = await supabase.from('invoices').select('id, grand_total').eq('order_id', order_id).maybeSingle()
      if (inv) {
        const invBalance = Number(inv.grand_total || 0) - totalPaid
        const invStatus = invBalance <= 0 ? 'paid' : totalPaid > 0 ? 'partially_paid' : 'issued'
        await supabase.from('invoices').update({
          amount_paid: totalPaid,
          balance_due: invBalance,
          status: invStatus,
        }).eq('id', inv.id)
      }

      // Notification side-effect — fire-and-forget
      try {
        const { data: orderRow } = await supabase
          .from('orders')
          .select('order_number, customers(firm_name)')
          .eq('id', order_id)
          .single()
        notifications.emit({
          type: 'payment_received',
          title: `Payment received · ₹${Number(amount).toLocaleString('en-IN')}`,
          message: `${orderRow?.customers?.firm_name || 'Customer'} · ${orderRow?.order_number || ''} · balance ₹${newBalance.toLocaleString('en-IN')}`,
          entity_type: 'order',
          entity_id: order_id,
        }).catch(() => {})
      } catch {
        // ignore — notifications are never load-bearing for payments
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

      const { data: payments, error: paymentsErr } = await supabase
        .from('payments')
        .select('amount')
        .eq('order_id', orderId)
        .limit(500)

      if (paymentsErr) return { data: null, error: paymentsErr }

      const totalPaid = (payments || []).reduce((sum, p) => sum + (p.amount || 0), 0)
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

// ─── IMPORT LOG ────────────────────────────────────────────
export const importLog = createTable('import_log', { orderBy: 'created_at', orderAsc: false, ownerFilter: false })

// ─── SHEETS SYNC ───────────────────────────────────────────
export const sheetsSync = createTable('sheets_sync', { orderBy: 'last_sync_at', orderAsc: false, ownerFilter: false })

// ─── JOBWORK JOBS ──────────────────────────────────────────
const jobworkJobsBase = createTable('jobwork_jobs', {
  orderBy: 'start_date',
  orderAsc: false,
  ownerFilter: false,
  select: '*, customers(firm_name, phone), suppliers(name, firm), jobwork_items(*, yarn_types(name), product_types(name))',
})
export const jobworkJobs = {
  ...jobworkJobsBase,

  // Lightweight list for JobworkPage — skip nested items join
  getAll: async () => safe(() =>
    supabase
      .from('jobwork_jobs')
      .select('id, job_number, direction, status, start_date, due_date, rate_per_unit, rate_unit, customer_id, supplier_id, order_id, created_at, customers(firm_name), suppliers(name, firm)')
      .order('start_date', { ascending: false })
      .limit(1000)
  ),

  createWithItems: async ({ direction, customer_id, supplier_id, order_id, start_date, due_date, rate_per_unit, rate_unit, notes, items }) => {
    try {
      const { data: jobNum, error: numErr } = await supabase.rpc('next_jobwork_number')
      if (numErr) return { data: null, error: numErr }
      if (direction === 'inward' && !customer_id) return { data: null, error: new Error('Inward jobwork needs a customer') }
      if (direction === 'outward' && !supplier_id) return { data: null, error: new Error('Outward jobwork needs a jobworker (supplier)') }

      const { data: job, error: jobErr } = await supabase
        .from('jobwork_jobs')
        .insert([{
          job_number: jobNum,
          direction,
          status: 'pending',
          customer_id: direction === 'inward' ? customer_id : null,
          supplier_id: direction === 'outward' ? supplier_id : null,
          order_id: order_id || null,
          start_date: start_date || new Date().toISOString().slice(0, 10),
          due_date: due_date || null,
          rate_per_unit: rate_per_unit || null,
          rate_unit: rate_unit || 'kg',
          notes: notes || null,
        }])
        .select()
        .single()
      if (jobErr) return { data: null, error: jobErr }

      if (items?.length) {
        const rows = items
          .filter(it => Number(it.quantity) > 0 && (it.yarn_type_id || it.product_type_id))
          .map(it => ({
            job_id: job.id,
            kind: it.kind,
            yarn_type_id: it.yarn_type_id || null,
            product_type_id: it.product_type_id || null,
            quantity: Number(it.quantity),
            unit: it.unit || 'kg',
            event_date: it.event_date || start_date || new Date().toISOString().slice(0, 10),
            notes: it.notes || null,
          }))
        if (rows.length) {
          const { data: insertedItems, error: itemErr } = await supabase
            .from('jobwork_items')
            .insert(rows)
            .select()
          if (itemErr) return { data: job, error: itemErr }
          // Mark job as in_progress once initial materials have been received/sent
          await supabase.from('jobwork_jobs').update({ status: 'in_progress' }).eq('id', job.id)

          // Stock ledger side-effect for each initial movement
          try {
            const stockRows = (insertedItems || []).map(it => ({
              kind: (it.kind === 'material_received' || it.kind === 'finished_received') ? 'in' : 'out',
              yarn_type_id: it.yarn_type_id,
              product_type_id: it.product_type_id,
              quantity: it.quantity,
              unit: it.unit,
              source_type: 'jobwork',
              source_id: it.id,
              notes: `Jobwork ${it.kind.replace('_', ' ')} (${jobNum})`,
            }))
            if (stockRows.length) {
              await supabase.from('stock_movements').insert(stockRows)
            }
          } catch (sErr) {
            // eslint-disable-next-line no-console
            if (import.meta.env.DEV) console.error('[jobworkJobs.createWithItems] stock hook failed', sErr)
          }
        }
      }
      return { data: { ...job, job_number: jobNum }, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Record a material/finished-goods movement against an existing job (e.g. return of finished goods).
  // Emits a corresponding stock_movements row so /stock reflects jobwork reality:
  //   Inward  (customer → us → customer): material_received = in,  finished_returned = out
  //   Outward (us → jobworker → us):      material_sent     = out, finished_received = in
  addItem: async ({ job_id, kind, yarn_type_id, product_type_id, quantity, unit, event_date, notes }) => {
    try {
      const { data, error } = await supabase.from('jobwork_items').insert([{
        job_id,
        kind,
        yarn_type_id: yarn_type_id || null,
        product_type_id: product_type_id || null,
        quantity: Number(quantity),
        unit: unit || 'kg',
        event_date: event_date || new Date().toISOString().slice(0, 10),
        notes: notes || null,
      }]).select().single()
      if (error) return { data, error }

      // Stock ledger side-effect — map jobwork kind to stock movement direction.
      // `in` means material physically arrives at our premises; `out` means it leaves.
      const stockKind = (kind === 'material_received' || kind === 'finished_received') ? 'in' : 'out'
      try {
        await supabase.from('stock_movements').insert([{
          kind: stockKind,
          yarn_type_id: yarn_type_id || null,
          product_type_id: product_type_id || null,
          quantity: Number(quantity),
          unit: unit || 'kg',
          source_type: 'jobwork',
          source_id: data?.id || null,
          notes: `Jobwork ${kind.replace('_', ' ')} (item ${data?.id?.slice(0, 8) || ''})`,
        }])
      } catch (sErr) {
        // eslint-disable-next-line no-console
        if (import.meta.env.DEV) console.error('[jobworkJobs.addItem] stock hook failed', sErr)
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

  markCompleted: async (id) => {
    return await jobworkJobsBase.update(id, {
      status: 'completed',
      completed_date: new Date().toISOString().slice(0, 10),
    })
  },
}

// ─── QUALITY INSPECTIONS ───────────────────────────────────
const qualityInspectionsBase = createTable('quality_inspections', {
  orderBy: 'inspected_at',
  orderAsc: false,
  ownerFilter: false,
  select: '*, quality_inspection_results(*, quality_parameters(name, unit, min_value, max_value))',
})
export const qualityInspections = {
  ...qualityInspectionsBase,

  // Lightweight list for QualityPage — skip nested results join
  getAll: async () => safe(() =>
    supabase
      .from('quality_inspections')
      .select('id, qi_number, source_type, source_id, inspector, sample_size, overall_status, inspected_at, created_at')
      .order('inspected_at', { ascending: false })
      .limit(1000)
  ),

  createInspection: async ({ source_type, source_id, inspector, sample_size, notes }) => {
    try {
      const { data: qiNum, error: numErr } = await supabase.rpc('next_qi_number')
      if (numErr) return { data: null, error: numErr }
      const { data, error } = await supabase.from('quality_inspections').insert([{
        qi_number: qiNum,
        source_type: source_type || 'manual',
        source_id: source_id || null,
        inspector: inspector || null,
        sample_size: sample_size || null,
        overall_status: 'pending',
        notes: notes || null,
      }]).select().single()
      return { data, error }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Submit per-parameter results. `results` is an array of
  //   { parameter_id, parameter_name, measured_value, text_value, pass, notes }
  submitResults: async ({ inspection_id, results, overall_status }) => {
    try {
      // Delete existing results first (idempotent re-entry)
      await supabase.from('quality_inspection_results').delete().eq('inspection_id', inspection_id)
      if (results?.length) {
        const rows = results.map(r => ({
          inspection_id,
          parameter_id: r.parameter_id || null,
          parameter_name: r.parameter_name || null,
          measured_value: r.measured_value != null && r.measured_value !== '' ? Number(r.measured_value) : null,
          text_value: r.text_value || null,
          pass: r.pass ?? null,
          notes: r.notes || null,
        }))
        const { error: insErr } = await supabase.from('quality_inspection_results').insert(rows)
        if (insErr) return { data: null, error: insErr }
      }

      // Auto-compute overall status if not explicitly provided
      let finalStatus = overall_status
      if (!finalStatus) {
        const anyFail = (results || []).some(r => r.pass === false)
        const allPass = (results || []).length > 0 && (results || []).every(r => r.pass === true)
        finalStatus = anyFail ? 'failed' : allPass ? 'passed' : 'pending'
      }

      const { data, error } = await supabase
        .from('quality_inspections')
        .update({ overall_status: finalStatus, inspected_at: new Date().toISOString() })
        .eq('id', inspection_id)
        .select()
        .single()
      if (error) return { data: null, error }

      // Gating side-effect — if this inspection is linked to a GRN, propagate
      // the pass/fail decision onto every line of that GRN so the purchase
      // flow can react (e.g. hold the bill, trigger rework).
      try {
        if (data?.source_type === 'grn' && data?.source_id && finalStatus !== 'pending') {
          const qcMap = { passed: 'passed', failed: 'failed', rework: 'rework' }
          const grnQc = qcMap[finalStatus] || 'pending'
          await supabase
            .from('goods_receipt_items')
            .update({ qc_status: grnQc })
            .eq('grn_id', data.source_id)
        }
      } catch (gErr) {
        // eslint-disable-next-line no-console
        if (import.meta.env.DEV) console.error('[qualityInspections.submitResults] GRN gating failed', gErr)
      }

      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },
}

// ─── REPORTS ───────────────────────────────────────────────
// All report queries take an optional { from, to } date range (ISO date strings).
// They return the same { data, error } envelope as the rest of the db layer.
export const reports = {
  // Sales register: every order in the date range with customer + GST split.
  salesRegister: async ({ from, to } = {}) => safe(() => {
    let q = supabase
      .from('orders')
      .select('id, order_number, created_at, status, customer_id, customers(firm_name, gstin), subtotal, taxable_amount, cgst_amount, sgst_amount, igst_amount, grand_total, advance_paid, balance_due')
      .order('created_at', { ascending: false })
    if (from) q = q.gte('created_at', from)
    if (to) q = q.lte('created_at', to)
    return q.limit(5000)
  }),

  // GST summary: aggregate CGST/SGST/IGST/total tax across orders in range.
  gstSummary: async ({ from, to } = {}) => {
    const { data, error } = await reports.salesRegister({ from, to })
    if (error) return { data: null, error }
    const rows = data || []
    const summary = {
      order_count: rows.length,
      total_taxable: rows.reduce((s, o) => s + Number(o.taxable_amount || o.subtotal || 0), 0),
      total_cgst: rows.reduce((s, o) => s + Number(o.cgst_amount || 0), 0),
      total_sgst: rows.reduce((s, o) => s + Number(o.sgst_amount || 0), 0),
      total_igst: rows.reduce((s, o) => s + Number(o.igst_amount || 0), 0),
      total_grand: rows.reduce((s, o) => s + Number(o.grand_total || 0), 0),
    }
    summary.total_tax = summary.total_cgst + summary.total_sgst + summary.total_igst
    // Monthly buckets
    const monthly = new Map()
    for (const o of rows) {
      const key = (o.created_at || '').slice(0, 7) // YYYY-MM
      const cur = monthly.get(key) || { month: key, count: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, grand: 0 }
      cur.count += 1
      cur.taxable += Number(o.taxable_amount || o.subtotal || 0)
      cur.cgst += Number(o.cgst_amount || 0)
      cur.sgst += Number(o.sgst_amount || 0)
      cur.igst += Number(o.igst_amount || 0)
      cur.grand += Number(o.grand_total || 0)
      monthly.set(key, cur)
    }
    return {
      data: { summary, monthly: Array.from(monthly.values()).sort((a, b) => b.month.localeCompare(a.month)) },
      error: null,
    }
  },

  // Customer outstanding: per-customer aggregation of grand_total / paid / balance_due.
  customerOutstanding: async () => {
    const { data, error } = await safe(() =>
      supabase
        .from('orders')
        .select('customer_id, customers(firm_name, phone), grand_total, advance_paid, balance_due, created_at, status')
        .limit(5000)
    )
    if (error) return { data: null, error }
    const rows = data || []
    const map = new Map()
    for (const o of rows) {
      if (!o.customer_id) continue
      const cur = map.get(o.customer_id) || {
        customer_id: o.customer_id,
        firm_name: o.customers?.firm_name || '—',
        phone: o.customers?.phone || '',
        order_count: 0,
        total_billed: 0,
        total_paid: 0,
        total_outstanding: 0,
        oldest_open: null,
      }
      cur.order_count += 1
      cur.total_billed += Number(o.grand_total || 0)
      cur.total_paid += Number(o.advance_paid || 0)
      cur.total_outstanding += Number(o.balance_due || 0)
      if (Number(o.balance_due || 0) > 0) {
        if (!cur.oldest_open || o.created_at < cur.oldest_open) cur.oldest_open = o.created_at
      }
      map.set(o.customer_id, cur)
    }
    const out = Array.from(map.values())
      .filter(r => r.total_billed > 0)
      .sort((a, b) => b.total_outstanding - a.total_outstanding)
    return { data: out, error: null }
  },

  // Stock register: snapshot of current balances with item type, warehouse, qty.
  // Reuses the existing stockMovements.computeBalances aggregation.
  stockRegister: async () => {
    const { data, error } = await stockMovements.computeBalances()
    if (error) return { data: null, error }
    const filtered = (data || []).filter(b => Math.abs(b.quantity) > 0.001)
    return { data: filtered, error: null }
  },

  // Purchase register: every PO in the date range.
  purchaseRegister: async ({ from, to } = {}) => safe(() => {
    let q = supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, status, suppliers(name, firm), subtotal, cgst_amount, sgst_amount, igst_amount, grand_total')
      .order('po_date', { ascending: false })
    if (from) q = q.gte('po_date', from)
    if (to) q = q.lte('po_date', to)
    return q.limit(5000)
  }),
}

// ─── DASHBOARD STATS ───────────────────────────────────────
export const stats = {
  getDashboard: async () => {
    try {
      const [ordersRes, enquiriesRes, customersRes, paymentsRes] = await Promise.all([
        supabase.from('orders').select('id, status, grand_total, balance_due', { count: 'exact' }).limit(5000),
        supabase.from('enquiries').select('id, status', { count: 'exact' }).eq('status', 'new').limit(1000),
        supabase.from('customers').select('id', { count: 'exact' }).limit(1),
        supabase.from('payments').select('amount').limit(5000),
      ])

      const orderData = ordersRes.data || []
      const paymentsData = paymentsRes.data || []

      // Calculate counts by status
      const statusCounts = {
        draft: orderData.filter(o => o.status === 'draft').length,
        booking: orderData.filter(o => o.status === 'booking').length,
        approved: orderData.filter(o => o.status === 'approved').length,
        production: orderData.filter(o => o.status === 'production').length,
        qc: orderData.filter(o => o.status === 'qc').length,
        dispatch: orderData.filter(o => o.status === 'dispatch').length,
        completed: orderData.filter(o => o.status === 'completed').length,
        cancelled: orderData.filter(o => o.status === 'cancelled').length,
      }

      // Calculate financial totals
      const totalRevenue = orderData.reduce((sum, o) => sum + (o.grand_total || 0), 0)
      const outstandingBalance = orderData.reduce((sum, o) => sum + (o.balance_due || 0), 0)
      const totalPayments = paymentsData.reduce((sum, p) => sum + (p.amount || 0), 0)

      // Count overdue orders (approximate: assume any not completed/cancelled is overdue if balance > 0)
      const overdueCount = orderData.filter(
        o => o.balance_due > 0 && !['completed', 'cancelled'].includes(o.status)
      ).length

      return {
        totalOrders: ordersRes.count || orderData.length,
        newEnquiries: enquiriesRes.count || (enquiriesRes.data || []).length,
        totalCustomers: customersRes.count || (customersRes.data || []).length,
        statusCounts,
        financialTotals: {
          totalRevenue,
          outstandingBalance,
          totalPayments,
        },
        overdueCount,
      }
    } catch (error) {
      return {
        totalOrders: 0,
        newEnquiries: 0,
        totalCustomers: 0,
        statusCounts: {},
        financialTotals: { totalRevenue: 0, outstandingBalance: 0, totalPayments: 0 },
        overdueCount: 0,
        error,
      }
    }
  },
}
