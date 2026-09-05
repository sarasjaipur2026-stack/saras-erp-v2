const number = value => Number.isFinite(Number(value)) ? Number(value) : 0
const money = value => Math.round((value + Number.EPSILON) * 100) / 100

// Rates come from the configured product/HSN masters; amounts are rounded to paise.
export function calculateOrderPricing(order, products = [], hsnCodes = []) {
  let subtotal = 0
  let itemDiscount = 0
  let itemTax = 0
  const lines = (order.line_items || []).map(item => {
    const product = products.find(p => p.id === item.product_id) || item.products
    const hsn = hsnCodes.find(h => h.code === product?.hsn_code)
    const rate = number(hsn
      ? (order.gst_type === 'inter_state' ? hsn.igst_pct : number(hsn.cgst_pct) + number(hsn.sgst_pct))
      : (product?.gst_rate ?? item.gst_rate ?? 18))
    const quantity = number(item.quantity) || number(item.meters) || number(item.weight_kg)
    const amount = money(quantity * number(item.rate_per_unit))
    const discount = money(Math.min(amount, Math.max(0,
      ['percent', 'percentage'].includes(item.item_discount_type)
        ? amount * number(item.item_discount_value) / 100
        : number(item.item_discount_value))))
    const tax = money((amount - discount) * rate / 100)
    subtotal += amount
    itemDiscount += discount
    itemTax += tax
    return { ...item, amount, item_discount_amount: discount, gst_rate: rate, gst_amount: tax }
  })
  const net = money(subtotal - itemDiscount)
  const discount = money(Math.min(net, Math.max(0,
    ['percent', 'percentage'].includes(order.order_discount_type)
      ? net * number(order.order_discount_value) / 100
      : number(order.order_discount_value))))
  const charges = order.charges || []
  const totalCharges = money(charges.reduce((sum, c) => sum + number(c.amount), 0))
  const taxableCharges = money(charges.filter(c => c.is_taxable).reduce((sum, c) => sum + number(c.amount), 0))
  const averageRate = net > 0 ? itemTax / net : 0
  const tax = money(itemTax + (taxableCharges - discount) * averageRate)
  const interstate = order.gst_type === 'inter_state'
  const cgst = interstate ? 0 : money(tax / 2)
  const sgst = interstate ? 0 : money(tax - cgst)
  const total = money(net - discount + totalCharges + tax)
  return {
    ...order, line_items: lines, subtotal: money(subtotal), total_item_discount: money(itemDiscount),
    total_charges: totalCharges, order_discount_amount: discount,
    taxable_amount: money(net - discount + taxableCharges),
    cgst_amount: cgst, sgst_amount: sgst, igst_amount: interstate ? tax : 0,
    grand_total: total, balance_due: money(total - number(order.advance_paid)),
  }
}
