import test from 'node:test'
import assert from 'node:assert/strict'
import { isJwtStaleError } from '../../src/lib/db/requestPolicy.js'

test('retries only errors that prove authentication is stale', () => {
  assert.equal(isJwtStaleError({ status: 401 }), true)
  assert.equal(isJwtStaleError({ code: 'PGRST301' }), true)
  assert.equal(isJwtStaleError({ message: 'JWT expired' }), true)
})
test('does not retry permission, timeout, or network failures', () => {
  assert.equal(isJwtStaleError({ status: 403 }), false)
  assert.equal(isJwtStaleError(new Error('Request timed out')), false)
  assert.equal(isJwtStaleError(new Error('Failed to fetch')), false)
})
