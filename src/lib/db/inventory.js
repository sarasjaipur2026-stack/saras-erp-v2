import { supabase } from '../supabase'
import { safe, createTable, fetchAllPaged } from './core'
import { toPaise, toRupees } from '../money'
import { todayIST } from '../dates'

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

  computeBalances: async ({ includeCustomerOwned = false } = {}) => {
    // Ask Postgres to aggregate. Previous implementation paged through every
    // movement and summed in JS — wire cost + latency scaled linearly with
    // history. Server-side RPC returns final buckets in a single round trip.
    // Default: exclude customer-owned inward-jobwork material so own-inventory
    // reports don't inflate with material that belongs to a customer.
    // Pass { includeCustomerOwned: true } for physical-warehouse views.
    const { data, error } = await supabase.rpc('stock_balances', {
      p_include_customer_owned: !!includeCustomerOwned,
    })
    if (error) {
      // Fall back to client-side aggregation if the RPC is unavailable
      // (e.g. stale schema, RLS issue) — keeps the UI working while alerting
      // the operator instead of silently showing blank stock.
      if (import.meta.env.DEV) console.error('[stockMovements.computeBalances] RPC failed, falling back', error)
      return await stockMovementsFallback.computeBalances({ includeCustomerOwned })
    }
    return { data: data || [], error: null }
  },
}

// Legacy paged fallback (only used if the RPC fails for some reason)
const stockMovementsFallback = {
  computeBalances: async ({ includeCustomerOwned = false } = {}) => {
    const { data, error } = await fetchAllPaged((lo, hi) => {
      let q = supabase
        .from('stock_movements')
        .select('id, kind, quantity, unit, product_id, material_id, yarn_type_id, product_type_id, warehouse_id, customer_owned, created_at, products(name), materials(name), yarn_types(name), product_types(name), warehouses(name)')
        .order('created_at', { ascending: true })
      if (!includeCustomerOwned) q = q.eq('customer_owned', false)
      return q.range(lo, hi)
    })
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

  // PO line-level reconciliation — one row per outstanding PO item.
  // Returns ordered / received / pending quantities so the purchase team can
  // chase suppliers on what's still open. Closed (pending <= 0) lines are
  // excluded unless includeClosed: true.
  reconciliation: async ({ includeClosed = false } = {}) => {
    try {
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(
          'id, quantity, quantity_received, unit, rate_per_unit, amount, yarn_types(name), purchase_orders!inner(id, po_number, po_date, expected_date, status, suppliers(firm, name))',
        )
        .limit(5000)
      if (error) return { data: null, error }
      const rows = (data || []).map((r) => {
        const ordered = Number(r.quantity || 0)
        const received = Number(r.quantity_received || 0)
        const pending = Math.max(0, ordered - received)
        const pct = ordered > 0 ? Math.round((received / ordered) * 100) : 0
        const po = r.purchase_orders
        return {
          po_item_id: r.id,
          po_id: po?.id,
          po_number: po?.po_number,
          po_date: po?.po_date,
          expected_date: po?.expected_date,
          po_status: po?.status,
          supplier: po?.suppliers?.firm || po?.suppliers?.name || '—',
          yarn: r.yarn_types?.name || '—',
          unit: r.unit,
          ordered,
          received,
          pending,
          pct,
          rate: Number(r.rate_per_unit || 0),
          pending_value: pending * Number(r.rate_per_unit || 0),
          overdue:
            pending > 0 &&
            po?.expected_date &&
            new Date(po.expected_date) < new Date(),
        }
      })
      const filtered = includeClosed ? rows : rows.filter((r) => r.pending > 0)
      // Overdue first, then by expected_date asc, then by po_date desc
      filtered.sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1
        if (a.expected_date && b.expected_date) {
          return new Date(a.expected_date) - new Date(b.expected_date)
        }
        return new Date(b.po_date || 0) - new Date(a.po_date || 0)
      })
      return { data: filtered, error: null }
    } catch (error) {
      return { data: null, error }
    }
  },

  // gstType: 'intra_state' (CGST+SGST) or 'inter_state' (IGST). Derived from supplier.state_code if omitted.
  // Per-item GST resolved from yarn_types.hsn_code_id → hsn_codes rates.
  // HSN is MANDATORY — PO save is blocked if any yarn lacks an HSN mapping,
  // preventing invoices from shipping with fallback-0% or wrong tax.
  // Callers can set allowMissingHsn: true for legacy data migration only.
  createWithItems: async ({ supplier_id, po_date, expected_date, notes, items, gstType, allowMissingHsn = false }) => {
    try {
      const { data: poNum, error: numErr } = await supabase.rpc('next_po_number')
      if (numErr) return { data: null, error: numErr }

      // Determine gstType from supplier state if caller didn't pass it
      let resolvedGstType = gstType
      if (!resolvedGstType && supplier_id) {
        const { data: sup } = await supabase
          .from('suppliers')
          .select('state_code')
          .eq('id', supplier_id)
          .single()
        if (sup?.state_code) {
          resolvedGstType = sup.state_code === '08' ? 'intra_state' : 'inter_state'
        }
      }
      const isIntra = resolvedGstType !== 'inter_state'

      // Fetch per-yarn HSN rates in one shot
      const yarnIds = (items || []).map(it => it.yarn_type_id).filter(Boolean)
      const hsnRateByYarn = new Map()
      const yarnNameById = new Map()
      if (yarnIds.length) {
        const { data: yarns } = await supabase
          .from('yarn_types')
          .select('id, name, hsn_code_id, hsn_codes(cgst_pct, sgst_pct, igst_pct)')
          .in('id', yarnIds)
        for (const y of yarns || []) {
          yarnNameById.set(y.id, y.name)
          const h = y.hsn_codes
          if (h) {
            hsnRateByYarn.set(y.id, {
              cgst: Number(h.cgst_pct) || 0,
              sgst: Number(h.sgst_pct) || 0,
              igst: Number(h.igst_pct) || 0,
            })
          }
        }
      }

      // Block PO save if any yarn is missing an HSN mapping
      if (!allowMissingHsn) {
        const missing = yarnIds.filter(id => !hsnRateByYarn.has(id))
        if (missing.length > 0) {
          const names = missing.map(id => yarnNameById.get(id) || id).join(', ')
          return {
            data: null,
            error: new Error(`Cannot save PO — the following yarn(s) have no HSN code configured: ${names}. Set HSN on each yarn in Masters → Yarn Types before creating the PO.`),
          }
        }
      }

      // Compute per-line amounts + totals on the integer-paise grid so a 200-line PO
      // reconciles exactly instead of drifting by ₹0.01 per row.
      const DEFAULT_GST = 12 // legacy fallback only — allowMissingHsn=true path
      let subtotalPaise = 0
      let cgstPaise = 0
      let sgstPaise = 0
      let igstPaise = 0
      const enrichedItems = (items || []).filter(it => it.yarn_type_id && Number(it.quantity) > 0).map(it => {
        const qty = Number(it.quantity) || 0
        const rate = Number(it.rate_per_unit) || 0
        const amountPaise = toPaise(qty * rate)
        const hsn = hsnRateByYarn.get(it.yarn_type_id)
        const effectiveRate = hsn
          ? (isIntra ? (hsn.cgst + hsn.sgst) : hsn.igst)
          : DEFAULT_GST
        const gstPaise = Math.round((amountPaise * effectiveRate) / 100)
        subtotalPaise += amountPaise
        if (isIntra) {
          // Half-split in paise, remainder goes to SGST so cgst+sgst === total gst.
          const half = Math.floor(gstPaise / 2)
          cgstPaise += half
          sgstPaise += gstPaise - half
        } else {
          igstPaise += gstPaise
        }
        return { it, amount: toRupees(amountPaise), gst_rate: effectiveRate, gst_amount: toRupees(gstPaise) }
      })
      const subtotal = toRupees(subtotalPaise)
      const cgst = toRupees(cgstPaise)
      const sgst = toRupees(sgstPaise)
      const igst = toRupees(igstPaise)
      const grand = toRupees(subtotalPaise + cgstPaise + sgstPaise + igstPaise)

      const { data: po, error: poErr } = await supabase
        .from('purchase_orders')
        .insert([{
          po_number: poNum,
          supplier_id,
          po_date: po_date || todayIST(),
          expected_date: expected_date || null,
          status: 'issued',
          subtotal,
          cgst_amount: cgst,
          sgst_amount: sgst,
          igst_amount: igst,
          grand_total: grand,
          notes: notes || null,
        }])
        .select()
        .single()
      if (poErr) return { data: null, error: poErr }

      if (enrichedItems.length) {
        const rows = enrichedItems.map(({ it, amount }) => ({
          po_id: po.id,
          yarn_type_id: it.yarn_type_id,
          description: it.description || null,
          quantity: Number(it.quantity) || 0,
          unit: it.unit || 'kg',
          rate_per_unit: Number(it.rate_per_unit) || 0,
          amount,
        }))
        const { error: itemErr } = await supabase.from('purchase_order_items').insert(rows)
        if (itemErr) {
          // Rollback header to avoid orphan
          await supabase.from('purchase_orders').delete().eq('id', po.id)
          return { data: null, error: itemErr }
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

      const today = received_date || todayIST()
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
