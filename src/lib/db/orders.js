import { supabase } from '../supabase'
import { safe, createTable } from './core'
import { notifications } from './notifications'
import { buildOrderPayload, buildLinePayload, buildChargePayload, normalizeOrderForForm } from '../orderFormModel'


// ─── ORDERS (custom select with joins) ─────────────────────
export const orders = {
  ...createTable('orders', {
    select: '*, customers(firm_name, contact_name, city)',
    ownerFilter: false,
  }),

  save: (form, status, orderId, requestId) => safe(() => supabase.rpc('save_order_transactional', {
    p_order_id: orderId || null,
    p_request_id: requestId,
    p_order: { ...buildOrderPayload(form, status), expected_updated_at: form.updated_at || null },
    p_lines: (form.line_items || []).map(line => ({
      ...buildLinePayload(line, orderId),
      id: line.id && !String(line.id).startsWith('temp_') ? line.id : null,
    })),
    p_charges: (form.charges || []).map(charge => ({
      ...buildChargePayload(charge, orderId),
      id: charge.id && !String(charge.id).startsWith('temp_') ? charge.id : null,
    })),
  })),

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
          .select('id, order_number, status, priority, grand_total, balance_due, advance_paid, delivery_date_1, created_at, nature, customers(firm_name, contact_name), order_line_items(id)')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE - 1)
      )
      if (error) return { data: null, error }
      if (!data || data.length === 0) break
      all.push(...data)
      if (data.length < PAGE) break
      if (all.length >= HARD_CAP) {
        return { data: null, error: new Error(`Orders exceed the ${HARD_CAP.toLocaleString('en-IN')} row safety limit. Use filters or server pagination.`) }
      }
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
          calculator_profiles!order_line_items_calculator_profile_id_fkey(*)
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
    const result = await safe(() => supabase.rpc('transition_order_transactional', {
      p_order_id: id, p_status: status,
    }))
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

  create: (order) => orders.save({ ...order, line_items: [], charges: [] }, 'draft', null, crypto.randomUUID()),

  delete: (id) => safe(() => supabase.rpc('delete_draft_order', { p_order_id: id })),

  duplicate: async (id) => {
    const { data: original, error } = await orders.get(id)
    if (error || !original) return { data: null, error }
    const form = normalizeOrderForForm(original, { duplicate: true })
    return orders.save(form, 'draft', null, crypto.randomUUID())
  },

  checkLinked: async (orderId, table) => safe(() =>
    supabase.from(table).select('id').eq('order_id', orderId).limit(10)
  ),

  convertSampleToFull: async (id) => {
    try {
      const { data: sampleOrder, error: getErr } = await orders.get(id)
      if (getErr || !sampleOrder) return { data: null, error: getErr }

      const { data: fullOrder, error: createErr } = await safe(() => supabase.rpc('create_full_order_from_sample', { p_sample_id: id }))
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
      if (all.length >= HARD_CAP) {
        return { data: null, error: new Error(`Enquiries exceed the ${HARD_CAP.toLocaleString('en-IN')} row safety limit. Use filters or server pagination.`) }
      }
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

  convertToOrder: (enquiryId) => safe(() =>
    supabase.rpc('convert_enquiry_transactional', { p_enquiry_id: enquiryId })
  ),
}
