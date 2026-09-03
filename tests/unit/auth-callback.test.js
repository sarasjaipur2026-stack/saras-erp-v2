import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../../src/contexts/AuthContext.jsx', import.meta.url), 'utf8')

test('Supabase auth callback never performs awaited async work', () => {
  assert.doesNotMatch(source, /onAuthStateChange\s*\(\s*async\b/)
  assert.match(source, /onAuthStateChange\s*\(\s*\(event, session\)\s*=>/)
  assert.match(source, /profileRefreshTimer\s*=\s*setTimeout/)
})
