import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildProspectSearches,
  filterCustomers,
  getCustomerFormPayload,
  getCustomerStats,
  isCustomerClassified,
} from '../../src/lib/customerInsights.js'

const customers = [
  {
    id: 'a', firm_name: 'Alpha Textiles', city: 'Jaipur', state: 'Rajasthan',
    priority_tier: 'A - Cross-sell', industry_sector: 'Textiles',
    recency_tier: 'A. Hot (<=30d)', source_company: 'SC',
  },
  {
    id: 'b', firm_name: 'Beta Store', phone: '9876543210',
    priority_tier: 'E - B2C', industry_sector: 'Unknown', source_company: 'SU',
  },
]

test('customer classification requires a useful industry and priority', () => {
  assert.equal(isCustomerClassified(customers[0]), true)
  assert.equal(isCustomerClassified(customers[1]), false)
})

test('customer filters search business details and combine segment filters', () => {
  assert.deepEqual(filterCustomers(customers, { search: 'jaipur', classification: 'all' }).map(x => x.id), ['a'])
  assert.deepEqual(filterCustomers(customers, { search: '9876', classification: 'all' }).map(x => x.id), ['b'])
  assert.deepEqual(filterCustomers(customers, { search: '', classification: 'needs_attention', source: 'SU' }).map(x => x.id), ['b'])
  assert.deepEqual(filterCustomers(customers, { search: '', classification: 'classified', priority: 'A - Cross-sell' }).map(x => x.id), ['a'])
})

test('customer dashboard stats separate classified, active and high-value records', () => {
  assert.deepEqual(getCustomerStats(customers), {
    total: 2, classified: 1, needsAttention: 1, highValue: 1, active: 1,
  })
})

test('customer form payload sends only editable fields and normalizes blanks', () => {
  assert.deepEqual(getCustomerFormPayload({
    id: 'do-not-send', firm_name: ' Alpha ', contact_name: '', gstin: '08abc',
    priority_tier: 'A - Cross-sell', created_at: 'do-not-send',
  }), {
    firm_name: 'Alpha', contact_name: null, phone: null, email: null, city: null,
    state: null, address: null, gstin: '08ABC', pan: null, source_company: null,
    priority_tier: 'A - Cross-sell', industry_sector: null, industry_sub: null,
    frequency_tier: null, recency_tier: null,
  })
})

test('prospect searches include the customer segment and location', () => {
  const searches = buildProspectSearches({
    industry_sector: 'Textiles', industry_sub: 'Yarn & Thread', city: 'Jaipur', state: 'Rajasthan',
  })
  assert.equal(searches.length, 3)
  assert.match(searches[0].query, /Yarn & Thread/)
  assert.match(searches[0].query, /Jaipur, Rajasthan/)
  assert.match(searches[0].url, /^https:\/\/www\.google\.com\/maps\/search/)
})
