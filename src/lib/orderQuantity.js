export const orderQuantity = line => ({
  quantity: Number(line.quantity || line.meters || line.weight_kg || 0),
  unit: line.quantity ? (line.unit || 'pcs') : line.meters ? 'meters' : 'kg',
})

export const deliveryProgress = (line, deliveries) => {
  const totalQty = orderQuantity(line).quantity
  const deliveredQty = deliveries.filter(d => d.line_item_id === line.id)
    .reduce((sum, d) => sum + Number(d.quantity_delivered ?? d.delivered_qty ?? 0), 0)
  return { totalQty, deliveredQty, percentage: totalQty > 0 ? Math.round(deliveredQty / totalQty * 100) : 0 }
}
