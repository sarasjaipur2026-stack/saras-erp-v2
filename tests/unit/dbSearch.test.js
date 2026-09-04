import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizePageSearch } from '../../src/lib/pageSearch.js'

test('server-side master search keeps business terms and removes filter syntax', () => {
  assert.equal(normalizePageSearch('  जयपुर Threads-2 @ 12.5  '), 'जयपुर Threads-2 @ 12.5')
  assert.equal(normalizePageSearch('Acme),id.eq.secret,%_'), 'Acme  id.eq.secret   ')
  assert.equal(normalizePageSearch('x'.repeat(120)).length, 100)
})
