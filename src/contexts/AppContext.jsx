import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import * as db from '../lib/db'

const AppContext = createContext(null)

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
  // New masters (Session A)
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

  const loadMasterData = useCallback(async () => {
    setLoading(true)
    const results = await Promise.all([
      db.products.getAll(),        // 0
      db.materials.getAll(),       // 1
      db.machines.getAll(),        // 2
      db.colors.getAll(),          // 3
      db.suppliers.getAll(),       // 4
      db.brokers.getAll(),         // 5
      db.chargeTypes.getAll(),     // 6
      db.orderTypes.getAll(),      // 7
      db.paymentTerms.getAll(),    // 8
      db.warehouses.getAll(),      // 9
      db.banks.getAll(),           // 10
      db.staff.getAll(),           // 11
      db.currencies.getAll(),      // 12
      db.customers.getAll(),       // 13
      db.hsnCodes.getAll(),        // 14
      db.units.getAll(),           // 15
      db.machineTypes.getAll(),    // 16
      db.productTypes.getAll(),    // 17
      db.yarnTypes.getAll(),       // 18
      db.chaalTypes.getAll(),      // 19
      db.processTypes.getAll(),    // 20
      db.operators.getAll(),       // 21
      db.packagingTypes.getAll(),  // 22
      db.transports.getAll(),      // 23
      db.qualityParameters.getAll(), // 24
    ])
    const setters = [
      setProducts, setMaterials, setMachines, setColors, setSuppliers,
      setBrokers, setChargeTypes, setOrderTypes, setPaymentTerms, setWarehouses,
      setBanks, setStaff, setCurrencies, setCustomers, setHsnCodes, setUnits,
      setMachineTypes, setProductTypes, setYarnTypes, setChaalTypes, setProcessTypes,
      setOperatorsList, setPackagingTypes, setTransports, setQualityParameters,
    ]
    results.forEach((r, i) => { if (r?.data) setters[i](r.data) })
    setLoading(false)
  }, [])

  useEffect(() => { loadMasterData() }, [loadMasterData])

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
