/**
 * thermalReceipt80 — ESC/POS string builder for 80mm thermal receipts.
 *
 * Output is a UTF-8 string with embedded ESC/POS escape sequences. The
 * print bridge (tools/print-bridge/) writes this directly to a USB
 * thermal printer via node-thermal-printer or escpos.
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §7
 */

// ESC/POS control codes
const ESC = '\x1B'
const GS = '\x1D'
const INIT = `${ESC}@`              // initialise
const BOLD_ON = `${ESC}E\x01`
const BOLD_OFF = `${ESC}E\x00`
const ALIGN_LEFT = `${ESC}a\x00`
const ALIGN_CENTER = `${ESC}a\x01`
const ALIGN_RIGHT = `${ESC}a\x02`
const SIZE_NORMAL = `${GS}!\x00`
const SIZE_DOUBLE = `${GS}!\x11`    // 2x width 2x height
const FEED_3 = '\n\n\n'
const CUT = `${GS}V\x00`
const DRAWER_KICK = `${ESC}p\x00\x19\xFA`  // open cash drawer pin 2

const COLS = 42 // 80mm at default font ≈ 42 chars

function pad(text, len, align = 'left') {
  text = String(text ?? '')
  if (text.length >= len) return text.slice(0, len)
  const space = len - text.length
  if (align === 'right') return ' '.repeat(space) + text
  if (align === 'center') {
    const left = Math.floor(space / 2)
    return ' '.repeat(left) + text + ' '.repeat(space - left)
  }
  return text + ' '.repeat(space)
}

function divider(char = '-') {
  return char.repeat(COLS) + '\n'
}

/**
 * Build the receipt string.
 *
 * @param {object} bill {
 *   shop:      { name, address, gstin, phone },
 *   invoice:   { invoice_number, invoice_date, doc_type },
 *   customer:  { firm_name, phone } | null,
 *   lines:     [{ description, qty, unit, rate, line_total }],
 *   totals:    { subtotal, cgst_amount, sgst_amount, igst_amount, grand_total },
 *   tenders:   [{ tender_type, amount }],
 *   cashier:   string,
 *   openDrawer: boolean (default true),
 * }
 * @returns {string} ESC/POS-encoded receipt
 */
export function buildThermalReceipt(bill) {
  const out = []
  out.push(INIT)

  // Header
  out.push(ALIGN_CENTER, SIZE_DOUBLE, BOLD_ON, (bill.shop?.name || 'SARAS') + '\n', BOLD_OFF, SIZE_NORMAL)
  if (bill.shop?.address) out.push(bill.shop.address + '\n')
  if (bill.shop?.gstin) out.push(`GSTIN: ${bill.shop.gstin}\n`)
  if (bill.shop?.phone) out.push(`Ph: ${bill.shop.phone}\n`)
  out.push('\n')

  // Doc type
  out.push(ALIGN_CENTER, BOLD_ON, (bill.invoice?.doc_type === 'tax_invoice' ? 'TAX INVOICE' : 'BILL OF SUPPLY') + '\n', BOLD_OFF, ALIGN_LEFT)
  out.push(divider())

  // Invoice meta
  out.push(`Bill: ${bill.invoice?.invoice_number || ''}\n`)
  out.push(`Date: ${bill.invoice?.invoice_date || new Date().toISOString().slice(0, 10)}\n`)
  if (bill.customer?.firm_name) {
    out.push(`Customer: ${bill.customer.firm_name}\n`)
    if (bill.customer.phone) out.push(`Phone: ${bill.customer.phone}\n`)
  } else {
    out.push('Customer: Walk-in\n')
  }
  if (bill.cashier) out.push(`Cashier: ${bill.cashier}\n`)
  out.push(divider())

  // Lines header
  out.push(BOLD_ON)
  out.push(pad('Item', 22) + pad('Qty', 6, 'right') + pad('Rate', 6, 'right') + pad('Amt', 8, 'right') + '\n')
  out.push(BOLD_OFF)
  out.push(divider())

  // Lines
  for (const line of bill.lines || []) {
    const desc = String(line.description || '')
    // wrap long descriptions
    const first = desc.slice(0, 22)
    out.push(pad(first, 22))
    out.push(pad(formatQty(line.qty, line.unit), 6, 'right'))
    out.push(pad(Number(line.rate).toFixed(0), 6, 'right'))
    out.push(pad(Number(line.line_total).toFixed(2), 8, 'right'))
    out.push('\n')
    if (desc.length > 22) {
      out.push(pad('  ' + desc.slice(22, 22 + 40), 42) + '\n')
    }
  }
  out.push(divider())

  // Totals
  const t = bill.totals || {}
  out.push(pad('Subtotal', 32) + pad('₹' + Number(t.subtotal || 0).toFixed(2), 10, 'right') + '\n')
  if (t.igst_amount > 0) {
    out.push(pad('IGST', 32) + pad('₹' + Number(t.igst_amount).toFixed(2), 10, 'right') + '\n')
  } else {
    if (t.cgst_amount > 0) out.push(pad('CGST', 32) + pad('₹' + Number(t.cgst_amount).toFixed(2), 10, 'right') + '\n')
    if (t.sgst_amount > 0) out.push(pad('SGST', 32) + pad('₹' + Number(t.sgst_amount).toFixed(2), 10, 'right') + '\n')
  }
  out.push(divider('='))
  out.push(BOLD_ON, SIZE_DOUBLE)
  out.push(pad('TOTAL', 12) + pad('₹' + Number(t.grand_total || 0).toFixed(2), 9, 'right') + '\n')
  out.push(SIZE_NORMAL, BOLD_OFF)
  out.push(divider('='))

  // Tenders
  if (bill.tenders?.length) {
    out.push('Paid:\n')
    for (const tender of bill.tenders) {
      const label = tender.tender_type.toUpperCase()
      out.push(pad('  ' + label, 32) + pad('₹' + Number(tender.amount).toFixed(2), 10, 'right') + '\n')
    }
    out.push('\n')
  }

  // Footer
  out.push(ALIGN_CENTER)
  out.push('Thank you — visit again!\n')
  out.push(`Powered by SARAS ERP\n`)

  out.push(FEED_3, CUT)
  if (bill.openDrawer !== false) out.push(DRAWER_KICK)

  return out.join('')
}

function formatQty(qty, unit) {
  const n = Number(qty || 0)
  const fixed = n % 1 === 0 ? n.toFixed(0) : n.toFixed(2)
  return `${fixed}${unit || ''}`
}
