import { supabase } from '../supabase'
import { safe, createTable, fetchAll } from './core'

// ─── PRODUCTION PLANS ──────────────────────────────────────
const productionPlansBase = createTable('production_plans', {
  orderBy: 'created_at',
  orderAsc: false,
  ownerFilter: false,
  select: '*, orders(id, order_number, status, customers(firm_name)), machines(id, name, code), materials(id, name)',
})
export const productionPlans = {
  ...productionPlansBase,

  getAll: async () => safe(() => fetchAll(() => supabase
      .from('production_plans')
      .select('id, status, planned_qty, completed_qty, planned_start, planned_end, machine_id, material_id, order_id, created_at, orders(id, order_number, customers(firm_name)), machines(id, name, code), materials(id, name)')
      .order('created_at', { ascending: false })
  )),

  listByOrder: async (orderId) => safe(() =>
    supabase.from('production_plans').select('*, machines(name), materials(name)').eq('order_id', orderId).order('created_at', { ascending: false }).limit(100)
  ),

  update: async (id, patch) => {
    return safe(() => supabase.rpc('update_production_plan_transactional', {
      p_plan_id: id,
      p_patch: patch,
    }))
  },

  createFromOrder: async (orderId, requestId = crypto.randomUUID()) => {
    try {
      return await safe(() => supabase.rpc('create_production_plans_transactional', {
        p_order_id: orderId,
        p_request_id: requestId,
      }))
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

  getAll: async () => safe(() => fetchAll(() => supabase
      .from('jobwork_jobs')
      .select('id, job_number, direction, status, start_date, due_date, rate_per_unit, rate_unit, customer_id, supplier_id, order_id, created_at, customers(firm_name), suppliers(name, firm)')
      .order('start_date', { ascending: false })
  )),

  createWithItems: async ({ direction, customer_id, supplier_id, order_id, start_date, due_date, rate_per_unit, rate_unit, notes, items, request_id }) => {
    try {
      if (direction === 'inward' && !customer_id) return { data: null, error: new Error('Inward jobwork needs a customer') }
      if (direction === 'outward' && !supplier_id) return { data: null, error: new Error('Outward jobwork needs a jobworker (supplier)') }

      return await safe(() => supabase.rpc('create_jobwork_transactional', {
        p_payload: {
          direction,
          customer_id: direction === 'inward' ? customer_id : null,
          supplier_id: direction === 'outward' ? supplier_id : null,
          order_id: order_id || null,
          start_date: start_date || new Date().toISOString().slice(0, 10),
          due_date: due_date || null,
          rate_per_unit: rate_per_unit || null,
          rate_unit: rate_unit || 'kg',
          notes: notes || null,
          items: (items || []).filter(it => Number(it.quantity) > 0 && (it.yarn_type_id || it.product_type_id)).map(it => ({
            kind: it.kind,
            yarn_type_id: it.yarn_type_id || null,
            product_type_id: it.product_type_id || null,
            quantity: Number(it.quantity),
            unit: it.unit || 'kg',
            event_date: it.event_date || start_date || new Date().toISOString().slice(0, 10),
            notes: it.notes || null,
          })),
        },
        p_request_id: request_id || crypto.randomUUID(),
      }))
    } catch (error) {
      return { data: null, error }
    }
  },

  addItem: async ({ job_id, kind, yarn_type_id, product_type_id, quantity, unit, event_date, notes, request_id }) => {
    try {
      return await safe(() => supabase.rpc('add_jobwork_item_transactional', {
        p_payload: {
          job_id,
          kind,
          yarn_type_id: yarn_type_id || null,
          product_type_id: product_type_id || null,
          quantity: Number(quantity),
          unit: unit || 'kg',
          event_date: event_date || new Date().toISOString().slice(0, 10),
          notes: notes || null,
        },
        p_request_id: request_id || crypto.randomUUID(),
      }))
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
