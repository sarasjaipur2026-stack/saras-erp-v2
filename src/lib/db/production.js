import { supabase } from '../supabase'
import { safe, createTable } from './core'

// ─── JOBWORK TRACKING ──────────────────────────────────────
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

  update: async (id, patch) => {
    const result = await productionPlansBase.update(id, patch)
    if (result?.error || !result?.data) return result
    const plan = result.data
    const isCompleting = patch.status === 'completed'
    if (isCompleting && (plan.completed_qty || 0) > 0 && plan.product_id) {
      try {
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

// ─── JOBWORK JOBS ──────────────────────────────────────────
const jobworkJobsBase = createTable('jobwork_jobs', {
  orderBy: 'start_date',
  orderAsc: false,
  ownerFilter: false,
  select: '*, customers(firm_name, phone), suppliers(name, firm), jobwork_items(*, yarn_types(name), product_types(name))',
})
export const jobworkJobs = {
  ...jobworkJobsBase,

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
          await supabase.from('jobwork_jobs').update({ status: 'in_progress' }).eq('id', job.id)

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
            if (import.meta.env.DEV) console.error('[jobworkJobs.createWithItems] stock hook failed', sErr)
          }
        }
      }
      return { data: { ...job, job_number: jobNum }, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

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
