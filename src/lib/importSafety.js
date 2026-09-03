export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 1000

const ALLOWED_EXTENSIONS = new Set(['csv', 'xlsx'])
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

export const sanitizeImportText = (value, maxLength = 500) => {
  if (typeof value !== 'string') return value
  return value
    .trim()
    .split('')
    .filter(character => {
      const code = character.charCodeAt(0)
      return code === 9 || code === 10 || code === 13 || code >= 32
    })
    .join('')
    .slice(0, maxLength)
}
export const validateImportFile = (file) => {
  if (!file) return 'Choose a file to import'
  const extension = String(file.name || '').split('.').pop()?.toLowerCase()
  if (!ALLOWED_EXTENSIONS.has(extension)) return 'Please select a CSV or XLSX file'
  if (file.type && !ALLOWED_MIME_TYPES.has(file.type)) return 'The selected file type does not match CSV or XLSX'
  if (!Number.isFinite(file.size) || file.size <= 0) return 'The selected file is empty'
  if (file.size > MAX_IMPORT_FILE_SIZE) return 'File is too large. Maximum allowed size is 5 MB.'
  return null
}
