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
