import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as db from '../lib/db'

const AppContext = createContext(null)

// Schedule work after the browser is idle (paint-friendly)
const whenIdle = (fn, timeout = 100) =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout })
    : setTimeout(fn, timeout)

// ─── sessionStorage cache for master data ─────────────────
// Masters (products/materials/machines/etc.) change maybe once a week, so
// there is no user-perceivable freshness issue. The previous 10-min TTL was
// causing a post-idle lag because it returned null after 10 min of idle,
// which made the visibility handler fire 10 parallel master fetches right
// when the user clicked Orders/Enquiries. See production API logs for the
// smoking gun: 10 GET /rest/v1/{table}?limit=1000 within an 18 ms window
// on every visibility return.
//
// New behaviour: ALWAYS return cached masters synchronously regardless of
// age. Background refresh is throttled and explicit (see refreshIfStale).
const CACHE_KEY = 'saras_masters_v2'
const STALE_AFTER_MS = 30 * 60 * 1000  // refresh in background if >30min old
const VIS_REFRESH_MIN_IDLE_MS = 10 * 60 * 1000  // only refresh on visibility after ≥10min idle

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return { data: parsed.data, ts: Number(parsed.ts) || 0 }
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

// Routes where master data is NOT read — loading masters on these routes
// just clogs HTTP/2 slots and delays the page's own query. Everything not
// in this blacklist defaults to loading masters (safe for form / editor
// pages that legitimately need them).
const LIST_ROUTES_NO_MASTERS = [
  '/',                      // Dashboard
  '/orders',                // Orders list (form routes like /orders/new still load)
  '/enquiries',             // Enquiries list
  '/invoices',
  '/payments',
  '/dispatch',
  '/stock',
  '/reports',
  '/notifications',
  '/masters/customers',     // 3,400-row customer list — no other masters read
]
const routeNeedsMasters = (path) => !!path && !LIST_ROUTES_NO_MASTERS.includes(path)

export function AppProvider({ children }) {
  // Single state object for all masters — one setState call = one re-render
  const [masters, setMasters] = useState(() => {
    // Hydrate from cache on first render — zero network wait, ANY age OK.
    const cached = readCache()
    return cached?.data || { ...EMPTY_MASTERS }
  })
  const [loading, setLoading] = useState(() => !readCache()?.data)
  const loaded = useRef(!!readCache()?.data)
  const lastRefreshRef = useRef(readCache()?.ts || 0)

  // Coalesce concurrent loadCritical calls onto one in-flight promise
  const criticalInFlightRef = useRef(null)

  // Phase 1: Core masters — fetched SEQUENTIALLY in small batches (2 at a
  // time) so they don't saturate HTTP/2 connection slots and delay the
  // current page's own data query. With 9 tables, this takes ~5 rounds of
  // ~100 ms each instead of one burst that competes with /rest/v1/orders.
  const loadCritical = useCallback(() => {
    if (criticalInFlightRef.current) return criticalInFlightRef.current
    criticalInFlightRef.current = (async () => {
      try {
        const BATCH = 2
        const collected = {}
        for (let i = 0; i < CRITICAL_FNS.length; i += BATCH) {
          const slice = CRITICAL_FNS.slice(i, i + BATCH)
          const keys = CRITICAL_KEYS.slice(i, i + BATCH)
          const results = await Promise.allSettled(slice.map(fn => fn.getAll()))
          results.forEach((r, idx) => {
            if (r.status === 'fulfilled' && r.value?.data) collected[keys[idx]] = r.value.data
          })
        }
        setMasters(prev => {
          const next = { ...prev, ...collected }
          writeCache(next)
          return next
        })
        lastRefreshRef.current = Date.now()
      } finally {
        criticalInFlightRef.current = null
      }
    })()
    return criticalInFlightRef.current
  }, [])

  // Phase 2: Secondary masters — same batched pattern
  const deferredInFlightRef = useRef(null)
  const loadDeferred = useCallback(() => {
    if (deferredInFlightRef.current) return deferredInFlightRef.current
    deferredInFlightRef.current = (async () => {
      try {
        const BATCH = 2
        const collected = {}
        for (let i = 0; i < DEFERRED_FNS.length; i += BATCH) {
          const slice = DEFERRED_FNS.slice(i, i + BATCH)
          const keys = DEFERRED_KEYS.slice(i, i + BATCH)
          const results = await Promise.allSettled(slice.map(fn => fn.getAll()))
          results.forEach((r, idx) => {
            if (r.status === 'fulfilled' && r.value?.data) collected[keys[idx]] = r.value.data
          })
        }
        setMasters(prev => {
          const next = { ...prev, ...collected }
          writeCache(next)
          return next
        })
      } finally {
        deferredInFlightRef.current = null
      }
    })()
    return deferredInFlightRef.current
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

  // Explicit ensure() — pages that actually consume masters (OrderForm,
  // EnquiryForm, PurchasePage, CalculatorPage, etc.) call this from a
  // useEffect on mount. Idempotent + coalesced via criticalInFlightRef.
  const ensureCritical = useCallback(async () => {
    if (loaded.current) return
    await loadCritical()
    loaded.current = true
  }, [loadCritical])


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

    const path = typeof window !== 'undefined' ? window.location.pathname : ''
    const needsMasters = routeNeedsMasters(path)

    // Skip loadCritical on list/dashboard routes — they don't read masters.
    // Pages that DO read masters (OrderForm / EnquiryForm / Calculator /
    // PurchasePage / Jobwork / Masters/*) must call ensureCritical() from
    // their own useEffect.
    if (!needsMasters) {
      return () => { cancelled = true }
    }

    if (loaded.current) {
      // Cache hit — refresh silently during idle time (cheap, batched).
      whenIdle(() => { if (!cancelled) loadCritical() }, 2000)
      return () => { cancelled = true }
    }

    // First-visit to a master-consuming route — load during idle time.
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

  // Re-fetch critical masters when tab regains focus — but ONLY if:
  //   a) cache is older than VIS_REFRESH_MIN_IDLE_MS (30+ min)
  //   b) user was actually idle (hiddenAt tracked)
  //   c) we defer via whenIdle so the user's first click after return gets
  //      HTTP/2 priority instead of competing with 9 master fetches.
  useEffect(() => {
    let hiddenAt = 0
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
      if (document.visibilityState !== 'visible') return
      if (!loaded.current) return
      const idleDuration = hiddenAt ? Date.now() - hiddenAt : 0
      hiddenAt = 0
      const cacheAge = Date.now() - (lastRefreshRef.current || 0)
      // Only refresh if user was idle AND cache is actually stale
      if (idleDuration < VIS_REFRESH_MIN_IDLE_MS) return
      if (cacheAge < STALE_AFTER_MS) return
      // Refresh during idle time — never on the click-path.
      // Also wait 3 s after visibility so the user's first click (which
      // usually comes within ~500 ms of tab return) completes uncontended.
      setTimeout(() => {
        whenIdle(() => { loadCritical().catch(() => {}) }, 3000)
      }, 3000)
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
    loadMasterData, ensureCritical, ensureDeferred, getProductsForMachine, getMachinesForProduct,
    getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate, getCustomerById,
  }), [masters, loading, loadMasterData, ensureCritical, ensureDeferred, getProductsForMachine, getMachinesForProduct, getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate, getCustomerById])

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
