import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as db from '../lib/db'

const AppContext = createContext(null)

// Schedule work after the browser is idle (paint-friendly)
const whenIdle = (fn, timeout = 100) =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout })
    : setTimeout(fn, timeout)

export function AppProvider({ children }) {
  // Single state object for all masters — one setState call = one re-render
  const [masters, setMasters] = useState({
    products: [], materials: [], machines: [], colors: [],
    suppliers: [], brokers: [], chargeTypes: [], orderTypes: [],
    paymentTerms: [], warehouses: [], banks: [], staff: [], currencies: [],
    customers: [], hsnCodes: [], units: [], machineTypes: [], productTypes: [],
    yarnTypes: [], chaalTypes: [], processTypes: [], operators: [],
    packagingTypes: [], transports: [], qualityParameters: [],
  })
  const [loading, setLoading] = useState(false)
  const loaded = useRef(false)

  // Phase 1: Core masters needed by order forms and most pages
  const loadCritical = useCallback(async () => {
    const results = await Promise.all([
      db.products.getAll(),
      db.materials.getAll(),
      db.machines.getAll(),
      db.colors.getAll(),
      db.orderTypes.getAll(),
      db.paymentTerms.getAll(),
      db.chargeTypes.getAll(),
      db.customers.getAll(),
      db.brokers.getAll(),
      db.currencies.getAll(),
    ])
    const keys = [
      'products', 'materials', 'machines', 'colors',
      'orderTypes', 'paymentTerms', 'chargeTypes', 'customers',
      'brokers', 'currencies',
    ]
    setMasters(prev => {
      const next = { ...prev }
      results.forEach((r, i) => { if (r?.data) next[keys[i]] = r.data })
      return next
    })
  }, [])

  // Phase 2: Secondary masters — loaded in background after first paint
  const loadDeferred = useCallback(async () => {
    const results = await Promise.all([
      db.suppliers.getAll(),
      db.warehouses.getAll(),
      db.banks.getAll(),
      db.staff.getAll(),
      db.hsnCodes.getAll(),
      db.units.getAll(),
      db.machineTypes.getAll(),
      db.productTypes.getAll(),
      db.yarnTypes.getAll(),
      db.chaalTypes.getAll(),
      db.processTypes.getAll(),
      db.operators.getAll(),
      db.packagingTypes.getAll(),
      db.transports.getAll(),
      db.qualityParameters.getAll(),
    ])
    const keys = [
      'suppliers', 'warehouses', 'banks', 'staff',
      'hsnCodes', 'units', 'machineTypes', 'productTypes',
      'yarnTypes', 'chaalTypes', 'processTypes',
      'operators', 'packagingTypes', 'transports', 'qualityParameters',
    ]
    setMasters(prev => {
      const next = { ...prev }
      results.forEach((r, i) => { if (r?.data) next[keys[i]] = r.data })
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

  // On mount: defer ALL master loading so Dashboard/Login paint instantly
  useEffect(() => {
    let cancelled = false
    whenIdle(async () => {
      if (cancelled) return
      setLoading(true)
      await loadCritical()
      if (cancelled) return
      setLoading(false)
      loaded.current = true
      // Phase 2 loads silently in background
      whenIdle(() => { if (!cancelled) loadDeferred() }, 200)
    })
    return () => { cancelled = true }
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
    loadMasterData, getProductsForMachine, getMachinesForProduct,
    getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate,
  }), [masters, loading, loadMasterData, getProductsForMachine, getMachinesForProduct, getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate])

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
