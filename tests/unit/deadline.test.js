import test from 'node:test'
import assert from 'node:assert/strict'
import { withDeadline } from '../../src/lib/deadline.js'

test('stalled authentication times out and subsequent operations can succeed', async () => {
  await assert.rejects(withDeadline(() => new Promise(() => {}), 10), /timed out/)
  assert.equal(await withDeadline(() => Promise.resolve('recovered'), 20), 'recovered')
})

test('deadline preserves operation errors', async () => {
  await assert.rejects(withDeadline(() => { throw new Error('denied') }, 20), /denied/)
})
