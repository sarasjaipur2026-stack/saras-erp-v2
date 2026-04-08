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
      return q.order(orderBy, { ascending: orderAsc })
    }),

    getAll: async () => safe(() =>
      supabase.from(table).select(select).order(orderBy, { ascending: orderAsc })
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
  select: '*, products(name), materials(name), warehouses(name)',
})
export const stockMovements = {
  ...stockMovementsBase,
  listForEntity: async (kind, id) => safe(() =>
    supabase.from('stock_movements')
      .select('*, products(name), materials(name), warehouses(name)')
      .eq(kind === 'product' ? 'product_id' : 'material_id', id)
      .order('created_at', { ascending: false })
  ),
  computeBalances: async () => {
    // Aggregate all stock movements into running balances per product/material/warehouse
    const { data, error } = await supabase.from('stock_movements').select('*, products(name), materials(name), warehouses(name)')
    if (error) return { data: null, error }
    const map = new Map()
    for (const m of data || []) {
      const key = `${m.product_id || ''}|${m.material_id || ''}|${m.warehouse_id || ''}`
      const cur = map.get(key) || {
        key,
        product_id: m.product_id, material_id: m.material_id, warehouse_id: m.warehouse_id,
        product_name: m.products?.name, material_name: m.materials?.name, warehouse_name: m.warehouses?.name,
        unit: m.unit, quantity: 0, last_move: m.created_at,
      }
      const sign = m.kind === 'out' ? -1 : 1
      cur.quantity += sign * Number(m.quantity || 0)
      if (m.created_at > (cur.last_move || '')) cur.last_move = m.created_at
      map.set(key, cur)
    }
    return { data: Array.from(map.values()), error: null }
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
    select: '*, customers(*), order_types(*), brokers(*), payment_terms(*), order_line_items(*)',
    ownerFilter: false,
  }),

  // Override get with deep joins
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

  create: async (order) => {
    try {
      // Call Supabase function to generate order number
      const { data: result, error: fnErr } = await supabase.rpc('generate_order_number', {
        p_order_type_id: order.order_type_id,
      })

      if (fnErr) {
        return { data: null, error: fnErr }
      }

      const order_number = result

      return await safe(() =>
        supabase.from('orders').insert([{ ...order, order_number }]).select().single()
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
  ),

  listByLineItem: async (lineItemId) => safe(() =>
    supabase
      .from('deliveries')
      .select('*')
      .eq('line_item_id', lineItemId)
      .order('created_at', { ascending: true })
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
  listByOrder: async (orderId) => safe(() =>
    supabase.from('production_plans').select('*, machines(name), materials(name)').eq('order_id', orderId).order('created_at', { ascending: false })
  ),
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
      const { data: allPayments } = await supabase.from('payments').select('amount').eq('order_id', order_id)
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

// ─── DASHBOARD STATS ───────────────────────────────────────
export const stats = {
  getDashboard: async () => {
    try {
      const [ordersRes, enquiriesRes, customersRes, paymentsRes] = await Promise.all([
        supabase.from('orders').select('id, status, grand_total, balance_due', { count: 'exact' }),
        supabase.from('enquiries').select('id, status', { count: 'exact' }).eq('status', 'new'),
        supabase.from('customers').select('id', { count: 'exact' }),
        supabase.from('payments').select('amount'),
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
