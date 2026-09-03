const asNumber = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizedUnit = (value) => String(value || '').trim().toLowerCase()

const lineMeters = (line) => {
  const explicit = asNumber(line?.meters)
  if (explicit > 0) return explicit
  return ['m', 'meter', 'meters', 'metre', 'metres'].includes(normalizedUnit(line?.unit))
    ? asNumber(line?.quantity || line?.total_qty)
    : 0
}

const lineKgs = (line) => {
  const explicit = asNumber(line?.weight_kg)
  if (explicit > 0) return explicit
  return ['kg', 'kgs', 'kilogram', 'kilograms'].includes(normalizedUnit(line?.unit))
    ? asNumber(line?.quantity || line?.total_qty)
    : 0
}

const uniqueLabels = (items, keys) => [...new Set(items
  .map(item => keys.map(key => item?.[key]?.name).find(Boolean))
  .filter(Boolean))]

export function deriveEffectiveOrderQuantity({ orderMeters, orderKgs, metersPerKg }) {
  const meters = asNumber(orderMeters)
  const kgs = asNumber(orderKgs)
  const conversion = asNumber(metersPerKg)

  return {
    effectiveMeters: meters > 0 ? meters : (kgs > 0 && conversion > 0 ? kgs * conversion : 0),
    effectiveKgs: kgs > 0 ? kgs : (meters > 0 && conversion > 0 ? meters / conversion : 0),
  }
}

export function deriveCalculatorLinkFromOrder(order) {
  const items = Array.isArray(order?.order_line_items) ? order.order_line_items : []
  const orderMeters = items.reduce((total, line) => total + lineMeters(line), 0)
  const orderKgs = items.reduce((total, line) => total + lineKgs(line), 0)
  const taxableAmount = asNumber(order?.taxable_amount)
  const weightedLineRevenue = items.reduce((total, line) => {
    if (lineKgs(line) <= 0) return total
    const amount = asNumber(line?.net_amount) || asNumber(line?.amount)
    return total + amount
  }, 0)
  const everyLineHasWeight = items.length > 0 && items.every(line => lineKgs(line) > 0)
  const sellValue = everyLineHasWeight && taxableAmount > 0 ? taxableAmount : weightedLineRevenue

  const productTypeId = items
    .map(line => line?.products?.product_type_id || line?.product?.product_type_id)
    .find(Boolean) || ''
  const machineTypeId = items
    .map(line => line?.machines?.machine_type_id || line?.machine?.machine_type_id)
    .find(Boolean) || ''

  return {
    statePatch: {
      order_meters: orderMeters,
      order_kgs: orderKgs,
      actual_sell_per_kg: orderKgs > 0 && sellValue > 0 ? sellValue / orderKgs : 0,
      product_type_id: productTypeId,
      machine_type_id: machineTypeId,
    },
    summary: {
      orderNumber: order?.order_number || 'Draft order',
      customerName: order?.customers?.firm_name || 'Customer not set',
      lineCount: items.length,
      orderMeters,
      orderKgs,
      productNames: uniqueLabels(items, ['products', 'product']),
      machineNames: uniqueLabels(items, ['machines', 'machine']),
      productTypeMapped: Boolean(productTypeId),
      machineTypeMapped: Boolean(machineTypeId),
    },
  }
}
