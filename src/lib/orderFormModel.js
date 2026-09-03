export const DEFAULT_ORDER = {
  customer_id: null,
  order_type_id: null,
  broker_id: null,
  payment_terms_id: null,
  currency_id: null,
  priority: 'normal',
  nature: 'sample',
  currency_code: 'INR',
  delivery_date_1: null,
  delivery_date_2: null,
  delivery_date_3: null,
  subtotal: 0,
  total_charges: 0,
  total_item_discount: 0,
  order_discount_type: 'flat',
  order_discount_value: 0,
  order_discount_amount: 0,
  taxable_amount: 0,
  cgst_amount: 0,
  sgst_amount: 0,
  igst_amount: 0,
  gst_type: 'intra_state',
  grand_total: 0,
  advance_paid: 0,
  balance_due: 0,
  customer_notes: '',
  internal_notes: '',
  production_notes: '',
  shipping_address: null,
  status: 'draft',
  line_items: [],
  charges: [],
}

const ORDER_FIELDS = Object.keys(DEFAULT_ORDER).filter(key => !['line_items', 'charges'].includes(key))

const LINE_FIELDS = [
  'sort_order', 'line_type', 'product_id', 'machine_id', 'material_id', 'color_id',
  'calculator_profile_id', 'width_cm', 'meters', 'weight_kg', 'quantity', 'unit',
  'rate_per_unit', 'amount', 'item_discount_type', 'item_discount_value',
  'item_discount_amount', 'gst_rate', 'gst_amount', 'instructions',
]

const LINE_DISPLAY_FIELDS = ['products', 'materials', 'machines', 'colors', 'calculator_profiles']

const CHARGE_FIELDS = ['charge_type_id', 'scope', 'amount', 'is_taxable']

const pick = (source, fields) => Object.fromEntries(
  fields.filter(key => source?.[key] !== undefined).map(key => [key, source[key]]),
)

export const buildOrderPayload = (formData, status) => {
  const payload = pick(formData, ORDER_FIELDS)
  if (payload.order_discount_type === 'percent') payload.order_discount_type = 'percentage'
  return { ...payload, status }
}

export const buildLinePayload = (line, orderId) => ({
  order_id: orderId,
  ...pick(line, LINE_FIELDS),
})

export const buildChargePayload = (charge, orderId) => ({
  order_id: orderId,
  ...pick(charge, CHARGE_FIELDS),
})

export const normalizeOrderForForm = (order, { duplicate = false, now = Date.now() } = {}) => {
  const lineItems = order?.order_line_items || order?.line_items || []
  const charges = order?.order_charges || order?.charges || []
  const normalized = {
    ...DEFAULT_ORDER,
    ...pick(order, ORDER_FIELDS),
    line_items: lineItems.map((line, index) => ({
      ...pick(line, LINE_FIELDS),
      ...pick(line, LINE_DISPLAY_FIELDS),
      id: duplicate ? `temp_duplicate_line_${now}_${index}` : line.id,
    })),
    charges: charges.map((charge, index) => ({
      ...pick(charge, CHARGE_FIELDS),
      id: duplicate ? `temp_duplicate_charge_${now}_${index}` : charge.id,
    })),
  }

  if (normalized.order_discount_type === 'percent') normalized.order_discount_type = 'percentage'

  if (duplicate) normalized.status = 'draft'
  return normalized
}

export const selectedRows = (rows, selectedIds) => rows.filter(row => selectedIds.has(row.id))

export const allVisibleRowsSelected = (rows, selectedIds) => (
  rows.length > 0 && rows.every(row => selectedIds.has(row.id))
)

export const toggleAllVisibleRows = (rows, selectedIds) => {
  const next = new Set(selectedIds)
  if (allVisibleRowsSelected(rows, selectedIds)) {
    rows.forEach(row => next.delete(row.id))
  } else {
    rows.forEach(row => next.add(row.id))
  }
  return next
}
