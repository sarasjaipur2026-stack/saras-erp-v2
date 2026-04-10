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
  lineItems, orderCharges, orderTemplates, importLog, sheetsSync,
  activityLog, notifications,
  orders, enquiries,
  stockMovements, purchaseOrders, goodsReceipts,
  deliveries,
  productionPlans, jobwork, jobworkJobs,
  invoices, payments,
  appSettings, attachments, qualityInspections,
  reports, stats,
} from './db/index'
