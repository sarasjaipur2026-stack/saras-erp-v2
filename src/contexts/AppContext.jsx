import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import * as db from '../lib/db'

const AppContext = createContext(null)

// Schedule work after the browser is idle (paint-friendly)
const whenIdle = (fn, timeout = 100) =>
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback(fn, { timeout })
    : setTimeout(fn, timeout)

export function AppProvider({ children }) {
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [machines, setMachines] = useState([])
  const [colors, setColors] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [brokers, setBrokers] = useState([])
  const [chargeTypes, setChargeTypes] = useState([])
  const [orderTypes, setOrderTypes] = useState([])
  const [paymentTerms, setPaymentTerms] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [banks, setBanks] = useState([])
  const [staff, setStaff] = useState([])
  const [currencies, setCurrencies] = useState([])
  const [customers, setCustomers] = useState([])
  const [hsnCodes, setHsnCodes] = useState([])
  const [units, setUnits] = useState([])
  const [machineTypes, setMachineTypes] = useState([])
  const [productTypes, setProductTypes] = useState([])
  const [yarnTypes, setYarnTypes] = useState([])
  const [chaalTypes, setChaalTypes] = useState([])
  const [processTypes, setProcessTypes] = useState([])
  const [operatorsList, setOperatorsList] = useState([])
  const [packagingTypes, setPackagingTypes] = useState([])
  const [transports, setTransports] = useState([])
  const [qualityParameters, setQualityParameters] = useState([])
  const [loading, setLoading] = useState(false)
  const loaded = useRef(false)

  // Phase 1: Core masters needed by order forms and most pages
  const loadCritical = useCallback(async () => {
    const results = await Promise.all([
      db.products.getAll(),        // 0
      db.materials.getAll(),       // 1
      db.machines.getAll(),        // 2
      db.colors.getAll(),          // 3
      db.orderTypes.getAll(),      // 4
      db.paymentTerms.getAll(),    // 5
      db.chargeTypes.getAll(),     // 6
      db.customers.getAll(),       // 7
      db.brokers.getAll(),         // 8
      db.currencies.getAll(),      // 9
    ])
    const setters = [
      setProducts, setMaterials, setMachines, setColors,
      setOrderTypes, setPaymentTerms, setChargeTypes, setCustomers,
      setBrokers, setCurrencies,
    ]
    results.forEach((r, i) => { if (r?.data) setters[i](r.data) })
  }, [])

  // Phase 2: Secondary masters — loaded in background after first paint
  const loadDeferred = useCallback(async () => {
    const results = await Promise.all([
      db.suppliers.getAll(),       // 0
      db.warehouses.getAll(),      // 1
      db.banks.getAll(),           // 2
      db.staff.getAll(),           // 3
      db.hsnCodes.getAll(),        // 4
      db.units.getAll(),           // 5
      db.machineTypes.getAll(),    // 6
      db.productTypes.getAll(),    // 7
      db.yarnTypes.getAll(),       // 8
      db.chaalTypes.getAll(),      // 9
      db.processTypes.getAll(),    // 10
      db.operators.getAll(),       // 11
      db.packagingTypes.getAll(),  // 12
      db.transports.getAll(),      // 13
      db.qualityParameters.getAll(), // 14
    ])
    const setters = [
      setSuppliers, setWarehouses, setBanks, setStaff,
      setHsnCodes, setUnits, setMachineTypes, setProductTypes,
      setYarnTypes, setChaalTypes, setProcessTypes,
      setOperatorsList, setPackagingTypes, setTransports, setQualityParameters,
    ]
    results.forEach((r, i) => { if (r?.data) setters[i](r.data) })
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
    whenIdle(async () => {
      setLoading(true)
      await loadCritical()
      setLoading(false)
      // Phase 2 loads silently in background — no loading state
      whenIdle(() => { loadDeferred() }, 200)
      loaded.current = true
    })
  }, [loadCritical, loadDeferred])

  const getProductsForMachine = useCallback((machineCode) => {
    const machine = machines.find(m => m.code === machineCode)
    if (!machine) return products
    return products.filter(p => machine.products.includes(p.code))
  }, [machines, products])

  const getMachinesForProduct = useCallback((productCode) => {
    return machines.filter(m => m.products.includes(productCode))
  }, [machines])

  const getChargeTypesByScope = useCallback((scope) => {
    return chargeTypes.filter(ct => ct.scope === scope)
  }, [chargeTypes])

  const getDefaultPaymentTerms = useCallback((customerId) => {
    const customer = customers.find(c => c.id === customerId)
    if (!customer || !customer.payment_term_id) return null
    return paymentTerms.find(pt => pt.id === customer.payment_term_id)
  }, [customers, paymentTerms])

  const getExchangeRate = useCallback((currencyCode) => {
    const currency = currencies.find(c => c.code === currencyCode)
    return currency ? currency.exchange_rate : null
  }, [currencies])

  return (
    <AppContext.Provider value={{
      products, materials, machines, colors, suppliers, brokers,
      chargeTypes, orderTypes, paymentTerms, warehouses, banks, staff, currencies,
      customers,
      hsnCodes, units, machineTypes, productTypes, yarnTypes, chaalTypes,
      processTypes, operators: operatorsList, packagingTypes, transports, qualityParameters,
      loading,
      loadMasterData, getProductsForMachine, getMachinesForProduct,
      getChargeTypesByScope, getDefaultPaymentTerms, getExchangeRate
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
