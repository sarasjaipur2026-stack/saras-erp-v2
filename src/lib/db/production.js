import { supabase } from '../supabase'
import { safe, createTable } from './core'
import { todayIST } from '../dates'

// Derive qty + unit from an order_line_items row (schema has no .quantity/.unit)
const deriveLineQty = (li) => {
  if (li?.meters && Number(li.meters) > 0) return { qty: Number(li.meters), unit: 'm' }
  if (li?.weight_kg && Number(li.weight_kg) > 0) return { qty: Number(li.weight_kg), unit: 'kg' }
  if (li?.total_qty && Number(li.total_qty) > 0) return { qty: Number(li.total_qty), unit: 'pcs' }
  return { qty: 0, unit: 'pcs' }
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
      .select('id, status, planned_qty, completed_qty, planned_start, planned_end, machine_id, material_id, order_id, created_at, orders(id, order_number, customers(firm_name)), machines(id, name, code), materials(id, name)')
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
    if (!isCompleting || (plan.completed_qty || 0) <= 0) return result

    // production_plans has NO product_id column → resolve via linked line item
    try {
      let productId = null
      let unit = 'pcs'
      if (plan.line_item_id) {
        const { data: li } = await supabase
          .from('order_line_items')
          .select('product_id, meters, weight_kg, total_qty')
          .eq('id', plan.line_item_id)
          .single()
        if (li) {
          productId = li.product_id || null
          unit = deriveLineQty(li).unit
        }
      }
      if (!productId) return result

      // Idempotent: skip if stock-in already fired
      const { data: existing } = await supabase
        .from('stock_movements')
        .select('id')
        .eq('source_type', 'production')
        .eq('source_id', plan.id)
        .limit(1)
      if (existing && existing.length > 0) return result

      await supabase.from('stock_movements').insert([{
        kind: 'in',
        product_id: productId,
        quantity: plan.completed_qty,
        unit,
        source_type: 'production',
        source_id: plan.id,
        notes: `Production complete (plan ${String(plan.id).slice(0, 8)})`,
      }])
    } catch (e) {
      if (import.meta.env.DEV) console.error('[productionPlans.update] stock-in hook failed', e)
    }
    return result
  },

  createFromOrder: async (orderId) => {
    try {
      const { data: order, error: ordErr } = await supabase
        .from('orders')
        .select('id, order_number, status, order_line_items(id, product_id, meters, weight_kg, total_qty, material_id, machine_id)')
        .eq('id', orderId)
        .single()
      if (ordErr || !order) return { data: null, error: ordErr }
      const items = order.order_line_items || []
      if (!items.length) return { data: null, error: new Error('Order has no line items') }
      const plans = items.map(li => {
        const { qty } = deriveLineQty(li)
        return {
          order_id: order.id,
          line_item_id: li.id,
          machine_id: li.machine_id || null,
          material_id: li.material_id || null,
          planned_qty: qty,
          status: 'planned',
        }
      })
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
          start_date: start_date || todayIST(),
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
            event_date: it.event_date || start_date || todayIST(),
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
            // Inward jobwork = customer sends us their material; we braid it; we return it.
            // Physically in our warehouse, but accounting-wise it's customer-owned.
            // Flag the movement so inventory-valuation reports can exclude it.
            const isCustomerOwned = direction === 'inward'
            const stockRows = (insertedItems || []).map(it => ({
              kind: (it.kind === 'material_received' || it.kind === 'finished_received') ? 'in' : 'out',
              yarn_type_id: it.yarn_type_id,
              product_type_id: it.product_type_id,
              quantity: it.quantity,
              unit: it.unit,
              source_type: 'jobwork',
              source_id: it.id,
              customer_owned: isCustomerOwned,
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

  // Return-balance report — per-job net material that's still out / still to
  // be returned. Positive balance = job still owes output; negative = over-return.
  // Returns { rows, totals } so the UI can show headline counts.
  returnBalance: async ({ includeClosed = false } = {}) => {
    try {
      const { data, error } = await supabase
        .from('jobwork_jobs')
        .select('id, job_number, direction, status, start_date, due_date, customers(firm_name), suppliers(name, firm), jobwork_items(kind, quantity, unit, event_date, yarn_types(name), product_types(name))')
        .order('start_date', { ascending: false })
        .limit(1000)
      if (error) return { data: null, error }
      const now = new Date()
      const rows = (data || []).map((j) => {
        const items = j.jobwork_items || []
        // Enum labels (from jobwork_item_kind):
        //   material_sent     = WE send raw to outward jobworker (stock OUT)
        //   material_received = WE receive raw from inward customer (stock IN, customer-owned)
        //   finished_received = WE receive finished back from outward jobworker (stock IN)
        //   finished_returned = WE return finished to inward customer (stock OUT, clears customer-owned)
        const inward = items
          .filter((it) => it.kind === 'material_received' || it.kind === 'finished_received')
          .reduce((s, it) => s + Number(it.quantity || 0), 0)
        const outward = items
          .filter((it) => it.kind === 'material_sent' || it.kind === 'finished_returned')
          .reduce((s, it) => s + Number(it.quantity || 0), 0)
        const balance = j.direction === 'inward'
          // Inward: we received raw material, balance = received - returned as finished
          ? inward - outward
          // Outward: we issued raw, balance = issued - received back as finished
          : outward - inward
        const overdue = balance > 0.001 && j.due_date && new Date(j.due_date) < now
        return {
          id: j.id,
          job_number: j.job_number,
          direction: j.direction,
          status: j.status,
          party: j.direction === 'inward'
            ? (j.customers?.firm_name || '—')
            : (j.suppliers?.firm || j.suppliers?.name || '—'),
          start_date: j.start_date,
          due_date: j.due_date,
          inward_qty: inward,
          outward_qty: outward,
          balance,
          overdue,
          item_count: items.length,
        }
      })
      const filtered = includeClosed ? rows : rows.filter((r) => Math.abs(r.balance) > 0.001)
      filtered.sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
        return Math.abs(b.balance) - Math.abs(a.balance)
      })
      const totals = filtered.reduce(
        (t, r) => ({
          openJobs: t.openJobs + (r.balance > 0.001 ? 1 : 0),
          overdueJobs: t.overdueJobs + (r.overdue ? 1 : 0),
          outstandingQty: t.outstandingQty + Math.max(0, r.balance),
        }),
        { openJobs: 0, overdueJobs: 0, outstandingQty: 0 },
      )
      return { data: { rows: filtered, totals }, error: null }
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
        event_date: event_date || todayIST(),
        notes: notes || null,
      }]).select().single()
      if (error) return { data, error }

      const stockKind = (kind === 'material_received' || kind === 'finished_received') ? 'in' : 'out'
      try {
        // Resolve the job's direction so we can flag customer-owned material.
        const { data: parentJob } = await supabase
          .from('jobwork_jobs')
          .select('direction')
          .eq('id', job_id)
          .single()
        const isCustomerOwned = parentJob?.direction === 'inward'
        await supabase.from('stock_movements').insert([{
          kind: stockKind,
          yarn_type_id: yarn_type_id || null,
          product_type_id: product_type_id || null,
          quantity: Number(quantity),
          unit: unit || 'kg',
          source_type: 'jobwork',
          source_id: data?.id || null,
          customer_owned: isCustomerOwned,
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
      completed_date: todayIST(),
    })
  },
}
