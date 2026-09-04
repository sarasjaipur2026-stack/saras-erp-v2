const csvCell = (value) => {
  if (value == null) return ''
  let text = String(value)
  if (typeof value === 'string' && /^[=+\-@]/.test(text)) text = `'${text}`
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const ordersToCsv = (orders) => {
  const columns = [
    ['Order #', row => row.order_number || ''],
    ['Customer', row => row.customers?.firm_name || row.customers?.contact_name || ''],
    ['Status', row => row.status || ''],
    ['Priority', row => row.priority || ''],
    ['Created', row => row.created_at?.slice(0, 10) || ''],
    ['Delivery', row => row.delivery_date_1?.slice(0, 10) || ''],
    ['Grand Total', row => Number(row.grand_total || 0).toFixed(2)],
    ['Advance Paid', row => Number(row.advance_paid || 0).toFixed(2)],
    ['Balance Due', row => Number(row.balance_due || 0).toFixed(2)],
  ]
  const header = columns.map(([label]) => csvCell(label)).join(',')
  const body = orders.map(row => columns.map(([, value]) => csvCell(value(row))).join(',')).join('\n')
  return `\uFEFF${header}\n${body}`
}

export const downloadOrdersCsv = (orders, filename = 'orders.csv') => {
  const blob = new Blob([ordersToCsv(orders)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const printOrders = (orders) => {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  doc.open()
  doc.write('<!doctype html><html><head><title>Orders</title></head><body></body></html>')
  doc.close()

  const style = doc.createElement('style')
  style.textContent = 'body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h1{font-size:20px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left}th{background:#f1f5f9}.num{text-align:right}'
  doc.head.appendChild(style)

  const heading = doc.createElement('h1')
  heading.textContent = `Orders (${orders.length})`
  doc.body.appendChild(heading)
  const table = doc.createElement('table')
  const labels = ['Order #', 'Customer', 'Status', 'Created', 'Delivery', 'Grand Total', 'Balance Due']
  const headRow = table.createTHead().insertRow()
  labels.forEach(label => {
    const th = doc.createElement('th')
    th.textContent = label
    headRow.appendChild(th)
  })
  const body = table.createTBody()
  orders.forEach(order => {
    const row = body.insertRow()
    const values = [
      order.order_number || '—',
      order.customers?.firm_name || order.customers?.contact_name || '—',
      order.status || '—',
      order.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : '—',
      order.delivery_date_1 ? new Date(order.delivery_date_1).toLocaleDateString('en-IN') : '—',
      Number(order.grand_total || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
      Number(order.balance_due || 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
    ]
    values.forEach((value, index) => {
      const cell = row.insertCell()
      cell.textContent = value
      if (index >= 5) cell.className = 'num'
    })
  })
  doc.body.appendChild(table)

  const cleanup = () => setTimeout(() => frame.remove(), 1000)
  frame.contentWindow.addEventListener('afterprint', cleanup, { once: true })
  frame.contentWindow.focus()
  frame.contentWindow.print()
  setTimeout(cleanup, 60_000)
}

const documentLabels = {
  confirmation: 'Order Confirmation',
  production: 'Production Slip',
  challan: 'Delivery Challan',
}

const quantityForLine = (line) => {
  if (Number(line.meters) > 0) return { value: Number(line.meters), unit: 'm' }
  if (Number(line.weight_kg) > 0) return { value: Number(line.weight_kg), unit: 'kg' }
  return { value: Number(line.total_qty || line.quantity || 0), unit: line.unit || 'pcs' }
}

export const orderDocumentModel = (order, type = 'confirmation', deliveries = []) => {
  const label = documentLabels[type] || documentLabels.confirmation
  const deliveredByLine = deliveries.reduce((result, delivery) => {
    if (delivery.line_item_id) {
      result[delivery.line_item_id] = (result[delivery.line_item_id] || 0) + Number(delivery.quantity_delivered || 0)
    }
    return result
  }, {})
  const lines = (order?.order_line_items || []).map((line, index) => {
    const quantity = quantityForLine(line)
    const delivered = deliveredByLine[line.id] || 0
    return {
      serial: index + 1,
      item: line.products?.name || line.materials?.name || line.instructions || 'Custom item',
      machine: line.machines?.name || '—',
      material: line.materials?.name || '—',
      color: line.colors?.name || '—',
      quantity: quantity.value,
      unit: quantity.unit,
      delivered,
      pending: Math.max(0, quantity.value - delivered),
      rate: Number(line.rate_per_unit || 0),
      amount: Number(line.amount || 0),
      instructions: line.instructions || '—',
    }
  })

  return {
    type,
    label,
    orderNumber: order?.order_number || 'Draft',
    customer: order?.customers?.firm_name || order?.customers?.contact_name || '—',
    contact: order?.customers?.contact_name || '—',
    phone: order?.customers?.phone || '—',
    created: order?.created_at ? new Date(order.created_at).toLocaleDateString('en-IN') : '—',
    delivery: order?.delivery_date_1 ? new Date(order.delivery_date_1).toLocaleDateString('en-IN') : '—',
    status: order?.status || '—',
    lines,
    subtotal: Number(order?.subtotal || 0),
    discount: Number(order?.total_item_discount || 0) + Number(order?.order_discount_amount || 0),
    tax: Number(order?.cgst_amount || 0) + Number(order?.sgst_amount || 0) + Number(order?.igst_amount || 0),
    grandTotal: Number(order?.grand_total || 0),
    advance: Number(order?.advance_paid || 0),
    balance: Number(order?.balance_due || 0),
    customerNotes: order?.customer_notes || '',
    productionNotes: order?.production_notes || '',
  }
}

const addTextCell = (doc, row, text, className = '') => {
  const cell = row.insertCell()
  cell.textContent = String(text)
  cell.className = className
}

export const printOrderDocument = (order, type = 'confirmation', deliveries = []) => {
  const model = orderDocumentModel(order, type, deliveries)
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0'
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  doc.open()
  doc.write('<!doctype html><html><head></head><body></body></html>')
  doc.close()
  doc.title = `${model.label} ${model.orderNumber}`

  const style = doc.createElement('style')
  style.textContent = `
    @page{size:A4;margin:16mm}body{font-family:Arial,sans-serif;color:#0f172a;font-size:12px}
    h1{font-size:22px;margin:0}h2{font-size:15px;margin:24px 0 8px}.muted{color:#64748b}
    .header{display:flex;justify-content:space-between;gap:24px;border-bottom:2px solid #0f172a;padding-bottom:12px}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px 20px;margin-top:16px}.meta b{display:block;font-size:10px;text-transform:uppercase;color:#64748b;margin-bottom:2px}
    table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #cbd5e1;padding:7px;text-align:left;vertical-align:top}th{background:#f1f5f9;font-size:10px;text-transform:uppercase}.num{text-align:right}.totals{width:310px;margin-left:auto}.totals td:first-child{font-weight:600}.grand{font-weight:700;font-size:14px}.notes{border:1px solid #cbd5e1;padding:10px;white-space:pre-wrap}.footer{margin-top:48px;display:flex;justify-content:space-between}.signature{width:180px;border-top:1px solid #0f172a;padding-top:5px;text-align:center}
  `
  doc.head.appendChild(style)

  const header = doc.createElement('div')
  header.className = 'header'
  const titleWrap = doc.createElement('div')
  const title = doc.createElement('h1')
  title.textContent = model.label
  const subtitle = doc.createElement('div')
  subtitle.className = 'muted'
  subtitle.textContent = 'sarasERP Jaipur'
  titleWrap.append(title, subtitle)
  const number = doc.createElement('strong')
  number.textContent = model.orderNumber
  header.append(titleWrap, number)
  doc.body.appendChild(header)

  const meta = doc.createElement('div')
  meta.className = 'meta'
  ;[
    ['Customer', model.customer], ['Contact', model.contact], ['Phone', model.phone],
    ['Order date', model.created], ['Delivery date', model.delivery], ['Status', model.status],
  ].forEach(([key, value]) => {
    const item = doc.createElement('div')
    const keyNode = doc.createElement('b')
    keyNode.textContent = key
    item.append(keyNode, doc.createTextNode(value))
    meta.appendChild(item)
  })
  doc.body.appendChild(meta)

  const itemHeading = doc.createElement('h2')
  itemHeading.textContent = type === 'production' ? 'Production instructions' : 'Items'
  doc.body.appendChild(itemHeading)
  const table = doc.createElement('table')
  const headerRow = table.createTHead().insertRow()
  const columns = type === 'confirmation'
    ? [['#','serial'], ['Item','item'], ['Qty','quantity'], ['Unit','unit'], ['Rate','rate'], ['Amount','amount']]
    : type === 'challan'
      ? [['#','serial'], ['Item','item'], ['Ordered','quantity'], ['Delivered','delivered'], ['Pending','pending'], ['Unit','unit']]
      : [['#','serial'], ['Item','item'], ['Machine','machine'], ['Material','material'], ['Color','color'], ['Qty','quantity'], ['Unit','unit'], ['Instructions','instructions']]
  columns.forEach(([heading]) => {
    const th = doc.createElement('th')
    th.textContent = heading
    headerRow.appendChild(th)
  })
  const tableBody = table.createTBody()
  model.lines.forEach(line => {
    const row = tableBody.insertRow()
    columns.forEach(([, key]) => {
      const money = key === 'rate' || key === 'amount'
      const value = money ? Number(line[key]).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : line[key]
      addTextCell(doc, row, value, money || ['quantity','delivered','pending'].includes(key) ? 'num' : '')
    })
  })
  doc.body.appendChild(table)

  if (type === 'confirmation') {
    const totals = doc.createElement('table')
    totals.className = 'totals'
    ;[
      ['Subtotal', model.subtotal], ['Discount', model.discount], ['Tax', model.tax],
      ['Grand total', model.grandTotal], ['Advance', model.advance], ['Balance due', model.balance],
    ].forEach(([key, value], index) => {
      const row = totals.insertRow()
      if (index === 3) row.className = 'grand'
      addTextCell(doc, row, key)
      addTextCell(doc, row, Number(value).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }), 'num')
    })
    doc.body.appendChild(totals)
  }

  const notesText = type === 'production' ? model.productionNotes : model.customerNotes
  if (notesText) {
    const notesHeading = doc.createElement('h2')
    notesHeading.textContent = 'Notes'
    const notes = doc.createElement('div')
    notes.className = 'notes'
    notes.textContent = notesText
    doc.body.append(notesHeading, notes)
  }

  const footer = doc.createElement('div')
  footer.className = 'footer'
  ;['Prepared by', type === 'challan' ? 'Receiver signature' : 'Authorized signature'].forEach(label => {
    const signature = doc.createElement('div')
    signature.className = 'signature'
    signature.textContent = label
    footer.appendChild(signature)
  })
  doc.body.appendChild(footer)

  const cleanup = () => setTimeout(() => frame.remove(), 1000)
  frame.contentWindow.addEventListener('afterprint', cleanup, { once: true })
  frame.contentWindow.focus()
  frame.contentWindow.print()
  setTimeout(cleanup, 60_000)
}
