import test from 'node:test'
import assert from 'node:assert/strict'
import { clearAppCaches, scopedCacheKey } from '../../src/lib/cache.js'

test('cache keys are always scoped to an authenticated user', () => {
  assert.equal(scopedCacheKey('saras_orders_v2', 'user-123'), 'saras_orders_v2_user-123')
  assert.equal(scopedCacheKey('saras_orders_v2', null), null)
})

test('logout cleanup removes only SARAS application caches', () => {
  const makeStorage = (initial) => {
    const storage = { ...initial }
    Object.defineProperty(storage, 'removeItem', {
      enumerable: false,
      value: key => { delete storage[key] },
    })
    return storage
  }
  const local = makeStorage({ saras_orders_v2_user: 'private', 'saras.recentSearches.v2.user': 'private', theme: 'dark' })
  const session = makeStorage({ saras_masters_v3_user: 'private', locale: 'en' })
  globalThis.window = { localStorage: local, sessionStorage: session }
  try {
    clearAppCaches()
    assert.deepEqual(Object.keys(local), ['theme'])
    assert.deepEqual(Object.keys(session), ['locale'])
  } finally {
    delete globalThis.window
  }
})
