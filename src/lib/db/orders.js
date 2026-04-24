import { supabase } from '../supabase'
import { safe, createTable } from './core'
import { lineItems, orderCharges } from './masters'
import { notifications } from './notifications'

// ─── ORDERS (custom select with joins) ─────────────────────

// Allowlist for checkLinked to prevent arbitrary-table probing via param injection
const LINKED_TABLES = new Set([
  'order_line_items',
  'order_charges',
  'deliveries',
  'payments',
  'invoices',
  'production_plans',
])

// Columns we intentionally DROP before re-inserting child rows (duplicate/convert)
const LINE_DROP_COLS = new Set([
  'id', 'order_id', 'created_at', 'updated_at', 'delivered_qty',
  'products', 'materials', 'machines', 'colors', 'calculator_profiles',
])
const CHARGE_DROP_COLS = new Set([
  'id', 'order_id', 'created_at', 'updated_at', 'charge_types',
])

const stripKeys = (row, dropSet) => {
  const out = {}
  for (const k of Object.keys(row || {})) {
    if (!dropSet.has(k)) out[k] = row[k]
  }
  return out
}

export const orders = {
  ...createTable('orders', {
    select: '*, customers(firm_name, contact_name, city)',
    ownerFilter: false,
  }),

  // userId accepted for call-site parity with factory list(); RLS enforces access.
  list: async (...args) => {
    void args
    return safe(() =>
      supabase
        .from('orders')
        .select('id, order_number, status, priority, grand_total, balance_due, advance_paid, delivery_date_1, created_at, nature, customers(firm_name, contact_name)')
        .order('created_at', { ascending: false })
        .limit(1000)
    )
  },

  // Server-side paged list with filter push-down.
  // Used by OrdersPage so the client never holds more than `pageSize` rows.
  // Returns { data, count, error }.
  //
  // Count mode:
  // - Default: 'estimated' (reads pg_stat_tuple, sub-ms regardless of size).
  // - When filters are applied: 'exact' (user is narrowing and expects an
  //   accurate pagination count).
  // Callers can force exact via `exactCount: true`.
  listPaged: async ({
    page = 0,
    pageSize = 50,
    status,         // explicit status filter: 'draft' | 'booking' | ... | 'all'
    customerTerm,   // ilike on customers.firm_name / contact_name
    dateFrom,       // ISO timestamp lower bound on created_at
    dateTo,         // ISO timestamp upper bound on created_at
    pending = false, // virtual: excludes draft/completed/cancelled
    urgent = false,  // virtual: balance_due > 0 AND not completed/cancelled
    exactCount = false,
  } = {}) => {
    try {
      const anyFilterActive = Boolean(
        (status && status !== 'all') || pending || urgent || dateFrom || dateTo ||
        (customerTerm && customerTerm.trim())
      )
      const countMode = exactCount || anyFilterActive ? 'exact' : 'estimated'
      let q = supabase
        .from('orders')
        .select(
          'id, order_number, status, priority, grand_total, balance_due, advance_paid, delivery_date_1, created_at, nature, customers(firm_name, contact_name)',
          { count: countMode },
        )
        .order('created_at', { ascending: false })

      if (status && status !== 'all') q = q.eq('status', status)
      if (pending) q = q.not('status', 'in', '(draft,completed,cancelled)')
      if (urgent) {
        q = q.gt('balance_due', 0).not('status', 'in', '(completed,cancelled)')
      }
      if (dateFrom) q = q.gte('created_at', dateFrom)
      if (dateTo) q = q.lte('created_at', dateTo)
      if (customerTerm && customerTerm.trim()) {
        // Escape `%` / `,` that would break PostgREST .or() parsing.
        const safe = customerTerm.replace(/[%,()]/g, ' ').trim()
        if (safe) {
          q = q.or(
            `firm_name.ilike.%${safe}%,contact_name.ilike.%${safe}%`,
            { foreignTable: 'customers' },
          )
        }
      }

      const lo = Math.max(0, page) * pageSize
      const hi = lo + pageSize - 1
      q = q.range(lo, hi)

      const { data, error, count } = await q
      if (error) return { data: null, count: 0, error }
      return { data: data || [], count: count || 0, error: null }
    } catch (error) {
      return { data: null, count: 0, error }
    }
  },

  // Lightweight aggregate for StatCards so the client doesn't need the full list.
  // Falls back gracefully if the RPC isn't deployed yet.
  summary: async () => {
    try {
      const { data, error } = await supabase.rpc('orders_summary')
      if (error) return { data: null, error }
      const row = Array.isArray(data) ? data[0] : data
      return {
        data: {
          totalOrders: Number(row?.total_orders ?? 0),
          activeOrders: Number(row?.active_orders ?? 0),
          totalRevenue: Number(row?.total_revenue ?? 0),
          outstandingBalance: Number(row?.outstanding_balance ?? 0),
          overdue: Number(row?.overdue_count ?? 0),
        },
        error: null,
      }
    } catch (error) {
      return { data: null, error }
    }
  },

  // Per-status pipeline counts — server-side GROUP BY via orders_status_counts RPC.
  // Replaces the old client-side 10k-row fetch that degraded Orders page load
  // time as volume grew.
  statusCounts: async () => {
    try {
      const { data, error } = await supabase.rpc('orders_status_counts')
      if (error) return { data: null, error }
      const counts = {}
      for (const row of data || []) counts[row.status] = Number(row.count || 0)
      return { data: counts, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

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
      let prefix = 'ORD'
      if (order.order_type_id) {
        const { data: ot } = await supabase
          .from('order_types')
          .select('prefix')
          .eq('id', order.order_type_id)
          .single()
        if (ot?.prefix) prefix = ot.prefix
      }

      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) return { data: null, error: new Error('Not authenticated') }

      const { data: result, error: fnErr } = await supabase.rpc('generate_order_number', {
        p_user_id: userId,
        p_prefix: prefix,
      })
      if (fnErr) return { data: null, error: fnErr }

      return await safe(() =>
        supabase.from('orders').insert([{ ...order, order_number: result, user_id: userId }]).select().single()
      )
    } catch (error) {
      return { data: null, error }
    }
  },

  // Phase 1 — atomic create. Header + line items + charges in one transaction.
  // If any insert fails the whole thing rolls back — no orphan headers.
  // Caller passes order fields (minus order_number / user_id — RPC derives both),
  // plus plain arrays of lineItems and charges (order_id auto-filled server side).
  createAtomic: async (order, lineItemsArr = [], chargesArr = []) => {
    try {
      let prefix = 'ORD'
      if (order.order_type_id) {
        const { data: ot } = await supabase
          .from('order_types')
          .select('prefix')
          .eq('id', order.order_type_id)
          .single()
        if (ot?.prefix) prefix = ot.prefix
      }
      const { data, error } = await supabase.rpc('create_order_atomic', {
        p_order: order,
        p_prefix: prefix,
        p_line_items: lineItemsArr,
        p_charges: chargesArr,
      })
      if (error) return { data: null, error }
      return { data, error: null }
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
        order_charges: oc,
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

      const preview = {
        originalOrderNumber: _on,
        lineItemCount: order_line_items?.length || 0,
        chargeCount: oc?.length || 0,
        status: 'Will be created as draft',
      }

      // Always create duplicate as draft — caller shouldn't inherit approved/production state
      const { data: newOrder, error: createErr } = await orders.create({
        ...orderData,
        status: 'draft',
      })
      if (createErr || !newOrder) return { data: null, error: createErr, preview }

      if (order_line_items?.length) {
        const items = order_line_items.map((li) => ({
          ...stripKeys(li, LINE_DROP_COLS),
          order_id: newOrder.id,
        }))
        const { error: lineErr } = await lineItems.createMany(items)
        if (lineErr) {
          // Revert order to avoid orphan header
          await supabase.from('orders').delete().eq('id', newOrder.id)
          return { data: null, error: lineErr, preview }
        }
      }

      if (oc?.length) {
        const charges = oc.map((ch) => ({
          ...stripKeys(ch, CHARGE_DROP_COLS),
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

  checkLinked: async (orderId, table) => {
    if (!LINKED_TABLES.has(table)) {
      return { data: [], error: new Error(`Unsupported linked table: ${table}`) }
    }
    return safe(() =>
      supabase.from(table).select('id').eq('order_id', orderId).limit(10)
    )
  },

  convertSampleToFull: async (id) => {
    try {
      const { data: sampleOrder, error: getErr } = await orders.get(id)
      if (getErr || !sampleOrder) return { data: null, error: getErr }

      const { data: fullOrder, error: createErr } = await orders.create({
        customer_id: sampleOrder.customer_id,
        order_type_id: sampleOrder.order_type_id,
        broker_id: sampleOrder.broker_id,
        payment_terms_id: sampleOrder.payment_terms_id,
        parent_sample_id: id,
        gst_type: sampleOrder.gst_type,
        delivery_date_1: sampleOrder.delivery_date_1,
        notes: sampleOrder.notes,
        status: 'draft',
      })
      if (createErr || !fullOrder) return { data: null, error: createErr }

      // Deep-copy line items
      if (sampleOrder.order_line_items?.length) {
        const items = sampleOrder.order_line_items.map((li) => ({
          ...stripKeys(li, LINE_DROP_COLS),
          order_id: fullOrder.id,
        }))
        const { error: lineErr } = await lineItems.createMany(items)
        if (lineErr) {
          await supabase.from('orders').delete().eq('id', fullOrder.id)
          return { data: null, error: lineErr }
        }
      }

      // Deep-copy charges
      if (sampleOrder.order_charges?.length) {
        const charges = sampleOrder.order_charges.map((ch) => ({
          ...stripKeys(ch, CHARGE_DROP_COLS),
          order_id: fullOrder.id,
        }))
        const { error: chargeErr } = await orderCharges.createMany(charges)
        if (chargeErr) return { data: fullOrder, error: chargeErr }
      }

      return { data: fullOrder, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },
}

// ─── ENQUIRIES ─────────────────────────────────────────────
export const enquiries = {
  ...createTable('enquiries', { select: '*, customers(*)', ownerFilter: false }),

  list: async (...args) => {
    void args
    return safe(() =>
      supabase
        .from('enquiries')
        .select('id, enquiry_number, status, source, priority, expected_value, followup_date, created_at, customers(firm_name, contact_name)')
        .order('created_at', { ascending: false })
        .limit(1000)
    )
  },

  // Generate enquiry number with retry on unique-conflict (race window)
  create: async (data) => {
    try {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) return { data: null, error: new Error('Not authenticated') }

      const now = new Date()
      const month = now.getMonth() + 1
      const yearStart = month >= 4 ? now.getFullYear() : now.getFullYear() - 1
      const yearEnd = yearStart + 1
      const fyPrefix = `${yearStart % 100}-${yearEnd % 100}`
      const pattern = `ENQ/${fyPrefix}/%`

      const MAX_ATTEMPTS = 5
      let lastError = null

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const { data: maxRow } = await supabase
          .from('enquiries')
          .select('enquiry_number')
          .eq('user_id', userId)
          .like('enquiry_number', pattern)
          .order('enquiry_number', { ascending: false })
          .limit(1)
          .maybeSingle()

        const lastSeq = maxRow?.enquiry_number
          ? parseInt(String(maxRow.enquiry_number).split('/')[2], 10) || 0
          : 0
        const enquiry_number = `ENQ/${fyPrefix}/${String(lastSeq + 1 + attempt).padStart(4, '0')}`

        const { data: inserted, error } = await supabase
          .from('enquiries')
          .insert([{ ...data, enquiry_number, user_id: userId }])
          .select('*, customers(*)')
          .single()

        if (!error) return { data: inserted, error: null }
        lastError = error
        // Retry only on unique-violation
        if (error.code !== '23505') break
      }
      return { data: null, error: lastError }
    } catch (error) {
      return { data: null, error }
    }
  },

  get: async (id) => safe(() =>
    supabase
      .from('enquiries')
      .select('*, customers(*), enquiry_line_items(*, products(id, name, hsn_code, gst_rate))')
      .eq('id', id)
      .single()
  ),

  convertToOrder: async (enquiryId) => {
    try {
      const { data: enquiry, error: getErr } = await enquiries.get(enquiryId)
      if (getErr || !enquiry) return { data: null, error: getErr }

      if (enquiry.status === 'converted' && enquiry.converted_order_id) {
        return { data: { id: enquiry.converted_order_id, already_converted: true }, error: null }
      }

      // Derive gst_type from customer state_code if customer known
      let gst_type
      if (enquiry.customer_id) {
        const { data: cust } = await supabase
          .from('customers')
          .select('state_code')
          .eq('id', enquiry.customer_id)
          .single()
        if (cust?.state_code) {
          gst_type = cust.state_code === '08' ? 'intra_state' : 'inter_state'
        }
      }

      // Map enquiry line items → order line items.
      // Unit fallback: explicit 'kg' / 'm' map to weight_kg / meters.
      // Anything else (pcs, dz, blank) falls back to total_qty and leaves the
      // typed columns null — the pricing engine uses `meters || weight_kg || total_qty`
      // so no downstream breakage, but the DB keeps the original unit intent.
      const elis = enquiry.enquiry_line_items || []
      const mapped = elis.map((eli, idx) => {
        const qty = Number(eli.quantity) || 0
        const unit = (eli.unit || '').trim().toLowerCase()
        const rate = Number(eli.our_quoted_rate ?? eli.target_rate) || 0
        const isKg = ['kg', 'kgs', 'kilogram', 'kilograms'].includes(unit)
        const isMeter = ['m', 'meter', 'meters', 'mtr', 'mt'].includes(unit)
        const gstRate = Number(eli.products?.gst_rate)
        return {
          sort_order: idx + 1,
          line_type: 'production',
          product_id: eli.product_id || null,
          meters: isMeter ? qty : null,
          weight_kg: isKg ? qty : null,
          total_qty: qty,
          rate_per_unit: rate,
          amount: qty * rate,
          gst_rate: Number.isFinite(gstRate) ? gstRate : 18,
          hsn_code: eli.products?.hsn_code || null,
          instructions: eli.notes || null,
          net_amount: qty * rate,
        }
      })

      // Use atomic RPC so header + lines commit together (or not at all).
      const { data: order, error: createErr } = await orders.createAtomic({
        customer_id: enquiry.customer_id,
        order_type_id: enquiry.order_type_id,
        broker_id: enquiry.broker_id,
        payment_terms_id: enquiry.payment_terms_id,
        status: 'draft',
        converted_enquiry_id: enquiryId,
        gst_type,
        notes: enquiry.notes || enquiry.requirements || null,
      }, mapped, [])
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
