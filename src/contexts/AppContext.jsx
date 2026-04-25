import { createContext, useContext, useState, useCallback, useRef, useMemo } from 'react'
import * as db from '../lib/db'
import { perfMark } from '../lib/perfMark'

const AppContext = createContext(null)

// Schedule work after the browser is idle (paint-friendly)
const whenIdle = (fn, timeout = 100) =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout })
    : setTimeout(fn, timeout)

// CRIT-1: HTTP/2 caps concurrent streams per origin at 6. Firing 10 critical
// + 15 deferred master fetches via Promise.allSettled means 25 in queue.
// OrderForm / OrdersPage queries land at position 20+. Limit our master pool
// to 4 concurrent so the user's actual page query has room to overtake.
async function runWithLimit(limit, items, mapFn) {
  const results = new Array(items.length)
  let idx = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = idx++
      if (i >= items.length) return
      try {
        results[i] = { status: 'fulfilled', value: await mapFn(items[i], i) }
      } catch (reason) {
        results[i] = { status: 'rejected', reason }
      }
    }
  })
  await Promise.all(workers)
  return results
}

// ─── sessionStorage cache for master data ─────────────────
const CACHE_KEY = 'saras_masters_v2'
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const { ts, data } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY)
      return null
    }
    return data
  } catch {
    return null
  }
}

// Trim each master to only cache essential dropdown fields (id, name, code, etc.)
// This keeps cache under ~500KB instead of ~4MB
const CACHE_FIELDS = new Set([
  'id', 'name', 'code', 'firm_name', 'contact_name', 'city', 'phone',
  'prefix', 'symbol', 'hex_code', 'hindi_name', 'category', 'days',
  'description', 'charge_mode', 'default_value', 'applies_to', 'is_taxable',
  'commission_pct', 'order_mode', 'unit_type', 'active', 'is_active', 'state_code',
  'exchange_rate', 'products', 'count_or_denier', 'sequence_order',
  'cgst_pct', 'sgst_pct', 'igst_pct', 'vehicle_number', 'vehicle_type',
  'gstin', 'credit_limit', 'broker_id', 'payment_term_id',
  // Critical for dropdown + line-item cascades
  'gst_rate', 'hsn_code', 'default_unit_id', 'unit_id',
  // Banks — DB uses bank_name not name
  'bank_name', 'account_number', 'ifsc_code', 'branch', 'account_type',
  // Brokers — DB also has commission_rate in some schemas
  'commission_rate',
  // Customers — needed for pricing/GST decisions
  'commission_pct_override', 'advance_required_pct', 'overdue_days_allowed',
  // Spindles/machine_count (machine display)
  'spindles', 'machine_count', 'compatible_products', 'machine_type',
])

function trimForCache(data) {
  const trimmed = {}
  for (const [key, arr] of Object.entries(data)) {
    if (!Array.isArray(arr) || arr.length === 0) { trimmed[key] = arr; continue }
    trimmed[key] = arr.map(row => {
      const slim = {}
      for (const [k, v] of Object.entries(row)) {
        if (CACHE_FIELDS.has(k)) slim[k] = v
      }
      return slim
    })
  }
  return trimmed
}

function writeCache(data) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: trimForCache(data) }))
  } catch {
    // sessionStorage full or unavailable — ignore
  }
}

// ─── Master data keys & db mappings ───────────────────────
const CRITICAL_KEYS = [
  'products', 'materials', 'machines', 'colors',
  'orderTypes', 'paymentTerms', 'chargeTypes', 'customers',
  'brokers', 'currencies',
]
const CRITICAL_FNS = [
  db.products, db.materials, db.machines, db.colors,
  db.orderTypes, db.paymentTerms, db.chargeTypes, db.customers,
  db.brokers, db.currencies,
]

const DEFERRED_KEYS = [
  'suppliers', 'warehouses', 'banks', 'staff',
  'hsnCodes', 'units', 'machineTypes', 'productTypes',
  'yarnTypes', 'chaalTypes', 'processTypes',
  'operators', 'packagingTypes', 'transports', 'qualityParameters',
]
const DEFERRED_FNS = [
  db.suppliers, db.warehouses, db.banks, db.staff,
  db.hsnCodes, db.units, db.machineTypes, db.productTypes,
  db.yarnTypes, db.chaalTypes, db.processTypes,
  db.operators, db.packagingTypes, db.transports, db.qualityParameters,
]

const EMPTY_MASTERS = Object.fromEntries(
  [...CRITICAL_KEYS, ...DEFERRED_KEYS].map(k => [k, []])
)

export function AppProvider({ children }) {
  // Single state object for all masters — one setState call = one re-render
  const [masters, setMasters] = useState(() => {
    // Hydrate from cache on first render — zero network wait
    const cached = readCache()
    return cached || { ...EMPTY_MASTERS }
  })
  const [loading, setLoading] = useState(() => !readCache())
  const loaded = useRef(!!readCache())

  // Phase 1: Core masters needed by order forms and most pages.
  // Concurrency capped at 4 to avoid HTTP/2 stream contention with the user's
  // own page-level queries (CRIT-1).
  const loadCritical = useCallback(async () => {
    const results = await perfMark('appContext.critical', () =>
      runWithLimit(4, CRITICAL_FNS, (fn, i) =>
        perfMark(`master.${CRITICAL_KEYS[i]}`, () => fn.getAll())
      )
    )
    setMasters(prev => {
      const next = { ...prev }
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.data) next[CRITICAL_KEYS[i]] = r.value.data
      })
      writeCache(next)
      return next
    })
  }, [])

  // Phase 2: Secondary masters — loaded in background after first paint
  // (also concurrency-capped per CRIT-1).
  const loadDeferred = useCallback(async () => {
    const results = await perfMark('appContext.deferred', () =>
      runWithLimit(4, DEFERRED_FNS, (fn, i) =>
        perfMark(`master.${DEFERRED_KEYS[i]}`, () => fn.getAll())
      )
    )
    setMasters(prev => {
      const next = { ...prev }
      results.forEach((r, i) => {
        if (r.status === 'fulfilled' && r.value?.data) next[DEFERRED_KEYS[i]] = r.value.data
      })
      writeCache(next)
      return next
    })
  }, [])

  const loadMasterData = useCallback(async () => {
    setLoading(true)
    await loadCritical()
    await loadDeferred()
    setLoading(false)
    loaded.current = true
  }, [loadCritical, loadDeferred])

  // Invalidate a single master (call after create/update/delete in master edit pages)
  const invalidateMaster = useCallback(async (key) => {
    const all = [...CRITICAL_KEYS, ...DEFERRED_KEYS]
    const allFns = [...CRITICAL_FNS, ...DEFERRED_FNS]
    const idx = all.indexOf(key)
    if (idx < 0) return
    const res = await allFns[idx].getAll()
    if (res?.data) {
      setMasters(prev => {
        const next = { ...prev, [key]: res.data }
        writeCache(next)
        return next
      })
    }
  }, [])

  // Full cache bust (e.g., after CSV import or multi-master change)
  const invalidateAll = useCallback(async () => {
    try { sessionStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
    await loadMasterData()
  }, [loadMasterData])

  // LAZY LOADING CONTRACT.
  //
  // Supabase API logs showed that on every post-login visit, AppContext fired
  // 25 master GETs in parallel (10 critical + 15 deferred). HTTP/2 caps
  // concurrent streams at 6 per origin, so OrdersPage's listPaged ended up at
  // position 40+ in the queue. That's the visible "modules feel laggy".
  //
  // Fix: AppContext no longer fetches anything on mount. It only reads the
  // sessionStorage cache (if present) and exposes `primeMasters()` for pages
  // that actually need masters (OrderForm dropdowns, enquiry form, master
  // CRUD pages). Pages that don't consume masters — list views, dashboard,
  // reports — pay zero master-load cost.
  //
  // Masters refetch only when:
  //   1. primeMasters() is explicitly called by a consumer
  //   2. invalidateMaster(key) is triggered after a master-page write
  //   3. invalidateAll() wipes the cache (CSV import etc.)
  const priming = useRef(null)
  const primeMasters = useCallback(() => {
    if (loaded.current) return Promise.resolve()
    if (priming.current) return priming.current
    priming.current = (async () => {
      try {
        setLoading(true)
        // Serialize rather than parallelize. HTTP/2 stream contention > JS
        // await cost. 10 sequential 50ms queries < 10 parallel 500ms queries
        // behind 40 other requests.
        await loadCritical()
        loaded.current = true
        // Kick Phase 2 once critical is done so forms can paint with primary
        // dropdowns immediately.
        whenIdle(() => { loadDeferred() }, 200)
      } finally {
        setLoading(false)
      }
    })()
    return priming.current
  }, [loadCritical, loadDeferred])

  // O(1) lookup maps — rebuilt only when underlying arrays change
  const machinesByCode = useMemo(() => new Map(masters.machines.map(m => [m.code, m])), [masters.machines])
  const customersById = useMemo(() => new Map(masters.customers.map(c => [c.id, c])), [masters.customers])
  const paymentTermsById = useMemo(() => new Map(masters.paymentTerms.map(pt => [pt.id, pt])), [masters.paymentTerms])
  const currenciesByCode = useMemo(() => new Map(masters.currencies.map(c => [c.code, c])), [masters.currencies])

  // Lookup helpers using maps
  const getProductsForMachine = useCallback((machineCode) => {
    const machine = machinesByCode.get(machineCode)
    if (!machine) return masters.products
    const codes = new Set(machine.products)
    return masters.products.filter(p => codes.has(p.code))
  }, [machinesByCode, masters.products])

  const getMachinesForProduct = useCallback((productCode) => {
    return masters.machines.filter(m => m.products?.includes(productCode))
  }, [masters.machines])

  const getChargeTypesByScope = useCallback((scope) => {
    return masters.chargeTypes.filter(ct => ct.scope === scope)
  }, [masters.chargeTypes])

  const getDefaultPaymentTerms = useCallback((customerId) => {
    const customer = customersById.get(customerId)
    if (!customer || !customer.payment_term_id) return null
    return paymentTermsById.get(customer.payment_term_id) || null
  }, [customersById, paymentTermsById])

  const getExchangeRate = useCallback((currencyCode) => {
    const currency = currenciesByCode.get(currencyCode)
    return currency ? currency.exchange_rate : null
  }, [currenciesByCode])

  // Stable context value — only changes when masters or loading change
  const value = useMemo(() => ({
    ...masters,
    loading,
    primeMasters, loadMasterData, invalidateMaster, invalidateAll,
    getProductsForMachine, getMachinesForProduct,
    getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate,
  }), [masters, loading, primeMasters, loadMasterData, invalidateMaster, invalidateAll, getProductsForMachine, getMachinesForProduct, getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate])

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
