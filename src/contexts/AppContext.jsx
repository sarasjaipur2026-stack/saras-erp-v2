import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as db from '../lib/db'

const AppContext = createContext(null)

// Schedule work after the browser is idle (paint-friendly)
const whenIdle = (fn, timeout = 100) =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout })
    : setTimeout(fn, timeout)

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
  'commission_pct', 'order_mode', 'unit_type', 'active', 'state_code',
  'exchange_rate', 'products', 'count_or_denier', 'sequence_order',
  'cgst_pct', 'sgst_pct', 'igst_pct', 'vehicle_number', 'vehicle_type',
  'gstin', 'credit_limit', 'broker_id', 'payment_term_id',
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
// NOTE: `customers` intentionally excluded — with 3,400+ rows it was the single
// biggest page-load cost. Components that need a customer row fetch it by id
// via db.customers.get(id) or use the search_entities RPC (CustomerSearch,
// Cmd+K palette). The `masters.customers` array remains available as [] for
// back-compat; legacy `.find(...)` calls return undefined (same behaviour as
// before the preload kicked in).
const CRITICAL_KEYS = [
  'products', 'materials', 'machines', 'colors',
  'orderTypes', 'paymentTerms', 'chargeTypes',
  'brokers', 'currencies',
]
const CRITICAL_FNS = [
  db.products, db.materials, db.machines, db.colors,
  db.orderTypes, db.paymentTerms, db.chargeTypes,
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

  // Phase 1: Core masters needed by order forms and most pages
  const loadCritical = useCallback(async () => {
    const results = await Promise.allSettled(
      CRITICAL_FNS.map(fn => fn.getAll())
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
  const loadDeferred = useCallback(async () => {
    const results = await Promise.allSettled(
      DEFERRED_FNS.map(fn => fn.getAll())
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

  // Track whether deferred masters have been loaded
  const deferredLoaded = useRef(false)

  // Load deferred masters on demand — only fetches once
  const ensureDeferred = useCallback(async () => {
    if (deferredLoaded.current) return
    deferredLoaded.current = true
    await loadDeferred()
  }, [loadDeferred])

  const loadMasterData = useCallback(async () => {
    setLoading(true)
    await loadCritical()
    await loadDeferred()
    deferredLoaded.current = true
    setLoading(false)
    loaded.current = true
  }, [loadCritical, loadDeferred])

  // On mount: load critical masters only — deferred masters load on demand.
  //
  // Dashboard does not read any masters (it only uses stats.getDashboard()),
  // so when the user lands on /, we SKIP loadCritical entirely. The first
  // route that actually reads useApp() masters (OrderForm, EnquiryForm, etc.)
  // triggers the load via a cache-hydrating effect there OR via the
  // visibility / focus handler below if the cache has gone stale.
  //
  // Previously this effect had a 1.5s delay on Dashboard to dodge the free-
  // tier cold-start window. On Pro (with our dashboard_stats RPC now taking
  // ~50 ms server-side), that delay and the 10 follow-up master fetches
  // added ~2 s of dead time to the first paint on / for no user-visible
  // reason. Removed.
  useEffect(() => {
    let cancelled = false

    const onDashboard = typeof window !== 'undefined' && window.location.pathname === '/'

    // On Dashboard — skip entirely. Dashboard reads no masters. The first
    // master-consuming route will trigger hydration via its own useApp() path
    // (empty arrays render as "loading" until then) + the visibility handler
    // below will refresh whenever the user returns after a stale cache.
    if (onDashboard) {
      return () => { cancelled = true }
    }

    if (loaded.current) {
      // Non-Dashboard + cache hit — refresh silently during idle time.
      whenIdle(() => { if (!cancelled) loadCritical() }, 2000)
      return () => { cancelled = true }
    }

    // Non-Dashboard first-visit: load critical masters during idle time so
    // the page's own queries get first dibs on Supabase connections.
    whenIdle(async () => {
      if (cancelled) return
      setLoading(true)
      await loadCritical()
      if (cancelled) return
      setLoading(false)
      loaded.current = true
    })
    return () => { cancelled = true }
  }, [loadCritical])

  // Re-fetch critical masters when tab regains focus if cache is stale
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && loaded.current && !readCache()) {
        loadCritical().catch(() => {})
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [loadCritical])

  // O(1) lookup maps — rebuilt only when underlying arrays change
  const machinesByCode = useMemo(() => new Map(masters.machines.map(m => [m.code, m])), [masters.machines])
  // customersById used to be a preloaded Map over all 3,400+ customers which
  // cost seconds on every cold boot. Now we fetch a single customer row on
  // demand via db.customers.get(id) and cache inside AppContext so repeated
  // lookups for the same id stay cheap.
  const customerCache = useRef(new Map())
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

  // Fetch a single customer by id, with in-memory cache.
  // Returns the customer row (or null if not found / error).
  const getCustomerById = useCallback(async (customerId) => {
    if (!customerId) return null
    if (customerCache.current.has(customerId)) return customerCache.current.get(customerId)
    const { data, error } = await db.customers.get(customerId)
    if (error || !data) return null
    customerCache.current.set(customerId, data)
    return data
  }, [])

  const getDefaultPaymentTerms = useCallback(async (customerId) => {
    const customer = await getCustomerById(customerId)
    if (!customer || !customer.payment_term_id) return null
    return paymentTermsById.get(customer.payment_term_id) || null
  }, [getCustomerById, paymentTermsById])

  const getExchangeRate = useCallback((currencyCode) => {
    const currency = currenciesByCode.get(currencyCode)
    return currency ? currency.exchange_rate : null
  }, [currenciesByCode])

  // Stable context value — only changes when masters or loading change
  const value = useMemo(() => ({
    ...masters,
    loading,
    loadMasterData, ensureDeferred, getProductsForMachine, getMachinesForProduct,
    getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate, getCustomerById,
  }), [masters, loading, loadMasterData, ensureDeferred, getProductsForMachine, getMachinesForProduct, getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate, getCustomerById])

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
