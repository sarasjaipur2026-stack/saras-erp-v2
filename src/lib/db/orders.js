import { supabase } from '../supabase'
import { safe, createTable } from './core'
import { lineItems, orderCharges } from './masters'
import { notifications } from './notifications'

const ALLOWED_TRANSITIONS = {
  draft: ['booking', 'cancelled'],
  booking: ['approved', 'cancelled'],
  approved: ['production', 'cancelled'],
  production: ['qc', 'cancelled'],
  qc: ['dispatch', 'cancelled'],
  dispatch: ['completed'],
  completed: [],
  cancelled: [],
}

// ─── ORDERS (custom select with joins) ─────────────────────
export const orders = {
  ...createTable('orders', {
    select: '*, customers(firm_name, contact_name, city)',
    ownerFilter: false,
  }),

  // userId accepted for call-site consistency but not used in the query —
  // row-level security (RLS) on the orders table handles per-user filtering.
  // Paginated with `.range()` to bypass PostgREST's server-side 1000-row cap.
  // eslint-disable-next-line no-unused-vars
  list: async (_userId) => {
    const PAGE = 1000
    const HARD_CAP = 20000
    const all = []
    for (let from = 0; from < HARD_CAP; from += PAGE) {
      const { data, error } = await safe(() =>
        supabase
          .from('orders')
          .select('id, order_number, status, priority, grand_total, balance_due, advance_paid, delivery_date_1, created_at, nature, customers(firm_name, contact_name)')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1)
      )
      if (error) return { data: null, error }
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < PAGE) break
    }
    return { data: all, error: null }
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

  // Pull the most recent order for a customer so OrderForm can pre-fill
  // sensible defaults when the user picks a repeat customer. Returns only
  // the fields we want to carry over (order_type, payment_terms, broker,
  // currency, priority, nature) — never amounts, dates, or line items.
  getLastForCustomer: async (customerId) => safe(() =>
    supabase
      .from('orders')
      .select('order_type_id, payment_terms_id, broker_id, currency_id, priority, nature')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
  ),

  updateStatus: async (id, status) => {
    // Fetch current order to validate transition
    const { data: current, error: fetchErr } = await safe(() =>
      supabase.from('orders').select('status').eq('id', id).single()
    )
    if (fetchErr || !current) {
      return { data: null, error: fetchErr || { message: 'Order not found' } }
    }

    const currentStatus = current.status
    const allowed = ALLOWED_TRANSITIONS[currentStatus] || []
    if (!allowed.includes(status)) {
      return {
        data: null,
        error: { message: `Invalid status transition: ${currentStatus} → ${status}` },
      }
    }

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

      const { data: newOrder, error: createErr } = await orders.create(orderData)
      if (createErr || !newOrder) return { data: null, error: createErr, preview }

      if (order_line_items?.length) {
        /* eslint-disable no-unused-vars */
        const items = order_line_items.map(({
          id: _iid, order_id: _oid2, created_at: _ic,
          products: _pr, materials: _m, machines: _mc,
          colors: _cl, calculator_profiles: _cp, ...rest
        /* eslint-enable no-unused-vars */
        }) => ({ ...rest, order_id: newOrder.id }))
        const { error: lineErr } = await lineItems.createMany(items)
        if (lineErr) return { data: newOrder, error: lineErr, preview }
      }

      if (oc?.length) {
        /* eslint-disable no-unused-vars */
        const charges = oc.map(({
          id: _cid, order_id: _oid, charge_types: _ct, created_at: _cc, ...rest
        /* eslint-enable no-unused-vars */
        }) => ({ ...rest, order_id: newOrder.id }))
        const { error: chargeErr } = await orderCharges.createMany(charges)
        if (chargeErr) return { data: newOrder, error: chargeErr, preview }
      }

      return { data: newOrder, error: null, preview }
    } catch (error) {
      return { data: null, error }
    }
  },

  checkLinked: async (orderId, table) => safe(() =>
    supabase.from(table).select('id').eq('order_id', orderId).limit(10)
  ),

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
        status: 'draft',
      })
      if (createErr || !fullOrder) return { data: null, error: createErr }

      return { data: fullOrder, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },
}

// ─── ENQUIRIES ─────────────────────────────────────────────
export const enquiries = {
  ...createTable('enquiries', { select: '*, customers(*)', ownerFilter: false }),

  // userId accepted for call-site consistency; RLS handles per-user filtering.
  // Paginated via `.range()` so we get the full dataset past the 1000-row cap.
  // eslint-disable-next-line no-unused-vars
  list: async (_userId) => {
    const PAGE = 1000
    const HARD_CAP = 20000
    const all = []
    for (let from = 0; from < HARD_CAP; from += PAGE) {
      const { data, error } = await safe(() =>
        supabase
          .from('enquiries')
          .select('id, enquiry_number, status, stage, outcome, probability, priority, source_channel, source, expected_value, expected_close_date, followup_date, contact_person_name, contact_phone, assigned_to, lost_reason, lost_at, created_at, customers(firm_name, contact_name)')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1)
      )
      if (error) return { data: null, error }
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < PAGE) break
    }
    return { data: all, error: null }
  },

  create: async (data) => {
    try {
      const { data: sess } = await supabase.auth.getSession()
      const userId = sess?.session?.user?.id
      if (!userId) return { data: null, error: new Error('Not authenticated') }

      // Serialised server-side sequence generation via advisory lock in RPC.
      // Replaces the earlier client-side MAX+1 pattern which raced under concurrent inserts.
      const { data: enquiry_number, error: seqErr } = await supabase.rpc('generate_enquiry_number', {
        p_user_id: userId,
      })
      if (seqErr) return { data: null, error: seqErr }

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
