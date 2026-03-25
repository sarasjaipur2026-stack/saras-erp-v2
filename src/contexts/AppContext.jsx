import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import * as db from '../lib/db'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [products, setProducts] = useState([])
  const [materials, setMaterials] = useState([])
  const [machines, setMachines] = useState([])
  const [colors, setColors] = useState([])
  const [loading, setLoading] = useState(false)

  const loadMasterData = useCallback(async () => {
    setLoading(true)
    const [p, m, mc, c] = await Promise.all([
      db.products.getAll(),
      db.materials.getAll(),
      db.machines.getAll(),
      db.colors.getAll(),
    ])
    if (p.data) setProducts(p.data)
    if (m.data) setMaterials(m.data)
    if (mc.data) setMachines(mc.data)
    if (c.data) setColors(c.data)
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

  return (
    <AppContext.Provider value={{
      products, materials, machines, colors, loading,
      loadMasterData, getProductsForMachine, getMachinesForProduct
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
