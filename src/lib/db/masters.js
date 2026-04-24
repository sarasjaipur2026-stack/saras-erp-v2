import { createTable } from './core'
import { supabase } from '../supabase'

// Generic linked-records probe for masters. Returns a map { table: count } of
// non-empty referring rows so the UI can warn before delete. Safe: uses the
// `head: true, count: 'exact'` trick so no rows leave the server.
const linkedCheck = async (links) => {
  const result = {}
  for (const { table, column, value } of links) {
    if (!value) continue
    const { count, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq(column, value)
    if (!error && count > 0) result[table] = count
  }
  return result
}

// ─── SIMPLE TABLE INSTANCES ────────────────────────────────
const customersBase = createTable('customers', { ownerFilter: false })
export const customers = {
  ...customersBase,
  // Non-empty result = caller should confirm / block delete
  checkLinked: async (id) => linkedCheck([
    { table: 'orders', column: 'customer_id', value: id },
    { table: 'enquiries', column: 'customer_id', value: id },
    { table: 'invoices', column: 'customer_id', value: id },
    { table: 'customer_ledger', column: 'customer_id', value: id },
    { table: 'deliveries', column: 'customer_id', value: id },
  ]),
}

const productsBase = createTable('products', { ownerFilter: false })
export const products = {
  ...productsBase,
  checkLinked: async (id) => linkedCheck([
    { table: 'order_line_items', column: 'product_id', value: id },
    { table: 'stock_movements', column: 'product_id', value: id },
  ]),
}

export const materials = createTable('materials', { ownerFilter: false })
export const machines = createTable('machines', { orderBy: 'id', orderAsc: true, ownerFilter: false })
export const colors = createTable('colors', { ownerFilter: false })

const suppliersBase = createTable('suppliers', { ownerFilter: false })
export const suppliers = {
  ...suppliersBase,
  checkLinked: async (id) => linkedCheck([
    { table: 'purchase_orders', column: 'supplier_id', value: id },
    { table: 'goods_receipts', column: 'supplier_id', value: id },
    { table: 'jobwork_jobs', column: 'supplier_id', value: id },
    { table: 'yarn_supplier_rates', column: 'supplier_id', value: id },
  ]),
}
export const brokers = createTable('brokers', { ownerFilter: false })
export const chargeTypes = createTable('charge_types', { ownerFilter: false })
export const orderTypes = createTable('order_types', { ownerFilter: false })
export const paymentTerms = createTable('payment_terms', { ownerFilter: false })
export const warehouses = createTable('warehouses', { ownerFilter: false })
export const banks = createTable('banks', { ownerFilter: false })
export const staff = createTable('staff', { ownerFilter: false })
export const currencies = createTable('currencies', { ownerFilter: false })
export const calculatorProfiles = createTable('calculator_profiles', { ownerFilter: false })
export const stock = createTable('stock', { ownerFilter: false })

// ─── NEW MASTER TABLES ─────────────────────────────────────
export const hsnCodes = createTable('hsn_codes', { orderBy: 'code', orderAsc: true, ownerFilter: false })
export const units = createTable('units', { orderBy: 'unit_type', orderAsc: true, ownerFilter: false })
export const machineTypes = createTable('machine_types', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const productTypes = createTable('product_types', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const yarnTypes = createTable('yarn_types', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const yarnSupplierRates = createTable('yarn_supplier_rates', { ownerFilter: false })
export const processTypes = createTable('process_types', { orderBy: 'sequence_order', orderAsc: true, ownerFilter: false })
export const operators = createTable('operators', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const packagingTypes = createTable('packaging_types', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const transports = createTable('transports', { orderBy: 'vehicle_number', orderAsc: true, ownerFilter: false })
export const qualityParameters = createTable('quality_parameters', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const chaalTypes = createTable('chaal_types', { orderBy: 'name', orderAsc: true, ownerFilter: false })
export const customFieldDefinitions = createTable('custom_field_definitions', { ownerFilter: false })

// ─── SIMPLE MODULE TABLES ──────────────────────────────────
export const lineItems = createTable('order_line_items', { ownerFilter: false })
export const orderCharges = createTable('order_charges', { ownerFilter: false })
export const importLog = createTable('import_log', { orderBy: 'created_at', orderAsc: false, ownerFilter: false })
