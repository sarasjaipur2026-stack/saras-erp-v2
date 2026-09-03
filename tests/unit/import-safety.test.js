import test from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_IMPORT_FILE_SIZE,
  sanitizeImportText,
  validateImportFile,
} from '../../src/lib/importSafety.js'

test('accepts supported import files within the size limit', () => {
  assert.equal(validateImportFile({ name: 'customers.csv', type: 'text/csv', size: 100 }), null)
  assert.equal(validateImportFile({
    name: 'customers.xlsx',
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    size: MAX_IMPORT_FILE_SIZE,
  }), null)
})
test('rejects mismatched, empty, and oversized files', () => {
  assert.match(validateImportFile({ name: 'payload.exe', type: 'application/octet-stream', size: 100 }), /CSV or XLSX/)
  assert.match(validateImportFile({ name: 'payload.xlsx', type: 'application/octet-stream', size: 100 }), /does not match/)
  assert.match(validateImportFile({ name: 'empty.csv', type: 'text/csv', size: 0 }), /empty/)
  assert.match(validateImportFile({ name: 'large.csv', type: 'text/csv', size: MAX_IMPORT_FILE_SIZE + 1 }), /too large/)
})

test('sanitizes control characters and enforces length', () => {
  assert.equal(sanitizeImportText('  ACME\u0000\u0007 Mills  ', 20), 'ACME Mills')
  assert.equal(sanitizeImportText('123456', 4), '1234')
  assert.equal(sanitizeImportText(42), 42)
})
