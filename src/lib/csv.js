export const csvCell = (value) => {
  if (value == null) return ''
  let text = String(value)
  // Spreadsheet importers can ignore leading control characters before a formula.
  // eslint-disable-next-line no-control-regex
  if (typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export const toCsv = (rows, columns) => [
  columns.map(column => csvCell(column.label)).join(','),
  ...rows.map(row => columns.map(column => csvCell(column.value(row))).join(',')),
].join('\n')
