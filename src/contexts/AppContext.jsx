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

  // On mount: load critical masters only — deferred masters load on demand
  useEffect(() => {
    let cancelled = false

    if (loaded.current) {
      // Cache hit — still refresh critical in background silently
      whenIdle(() => {
        if (!cancelled) loadCritical()
      }, 500)
      return () => { cancelled = true }
    }

    // No cache — load critical only
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
    loadMasterData, ensureDeferred, getProductsForMachine, getMachinesForProduct,
    getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate,
  }), [masters, loading, loadMasterData, ensureDeferred, getProductsForMachine, getMachinesForProduct, getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate])

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
