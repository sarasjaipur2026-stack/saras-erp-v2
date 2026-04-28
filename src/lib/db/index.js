// Barrel re-export — all existing `import { X } from '../../lib/db'` paths
// continue to work via the alias in db.js.

export { safe, createTable } from './core'

export {
  customers, products, materials, machines, colors, suppliers,
  brokers, chargeTypes, orderTypes, paymentTerms, warehouses,
  banks, staff, currencies, calculatorProfiles, stock,
  hsnCodes, units, machineTypes, productTypes, yarnTypes,
  yarnSupplierRates, processTypes, operators, packagingTypes,
  transports, qualityParameters, chaalTypes, customFieldDefinitions,
  lineItems, orderCharges, importLog,
} from './masters'

export { activityLog, notifications } from './notifications'
export { orders, enquiries } from './orders'
export { stockMovements, purchaseOrders, goodsReceipts } from './inventory'
export { deliveries } from './deliveries'
export { productionPlans, jobworkJobs } from './production'
export { invoices, payments } from './finance'
export { customerLedger } from './ledger'
export { appSettings, attachments, qualityInspections } from './system'
export { reports, stats } from './reports'
export { checkCustomerCredit, setCustomerCreditHold, logCreditOverride } from './credit'
export { posTerminals, posSessions, posTenders, posPrintJobs, productImages, invoiceLines } from './pos'
