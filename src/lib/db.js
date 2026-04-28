// ─── SARAS ERP — Data Access Layer ─────────────────────────
// Split into domain modules under ./db/ for maintainability.
// This barrel preserves backward compatibility for all existing imports.

export {
  safe, createTable,
  customers, products, materials, machines, colors, suppliers,
  brokers, chargeTypes, orderTypes, paymentTerms, warehouses,
  banks, staff, currencies, calculatorProfiles, stock,
  hsnCodes, units, machineTypes, productTypes, yarnTypes,
  yarnSupplierRates, processTypes, operators, packagingTypes,
  transports, qualityParameters, chaalTypes, customFieldDefinitions,
  lineItems, orderCharges, importLog,
  activityLog, notifications,
  orders, enquiries,
  stockMovements, purchaseOrders, goodsReceipts,
  deliveries,
  productionPlans, jobworkJobs,
  invoices, payments, customerLedger,
  appSettings, attachments, qualityInspections,
  reports, stats,
  checkCustomerCredit, setCustomerCreditHold, logCreditOverride,
  posTerminals, posSessions, posTenders, posPrintJobs, productImages, invoiceLines,
} from './db/index'
