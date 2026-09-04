const option = (value, label = value) => ({ value, label })

export const PRIORITY_OPTIONS = [
  option('', 'All priorities'),
  option('A - Cross-sell', 'A · Cross-sell'),
  option('B - Enterprise', 'B · Enterprise'),
  option('C - Mid-market', 'C · Mid-market'),
  option('D - SMB B2B', 'D · SMB / B2B'),
  option('E - B2C', 'E · Retail / B2C'),
]

export const INDUSTRY_OPTIONS = [
  option('', 'All industries'),
  option('Apparel & Fashion'),
  option('B2C', 'Retail / B2C'),
  option('Consumer Goods'),
  option('Consumables'),
  option('Home Textiles'),
  option('Institutional'),
  option('Manufacturing - Engineering'),
  option('Manufacturing - Materials'),
  option('Manufacturing - Metals'),
  option('Services'),
  option('Textiles'),
  option('Trading & Retail'),
  option('Unknown', 'Other / Unknown'),
]

export const FREQUENCY_OPTIONS = [
  option('', 'No buying history'),
  option('1. One-time (1)', 'One-time · 1 order'),
  option('2. Occasional (2-3)', 'Occasional · 2–3 orders'),
  option('3. Regular (4-9)', 'Regular · 4–9 orders'),
  option('4. Frequent (10-24)', 'Frequent · 10–24 orders'),
  option('5. Power Buyer (25+)', 'Power buyer · 25+ orders'),
]

export const RECENCY_OPTIONS = [
  option('', 'No recent activity data'),
  option('A. Hot (<=30d)', 'Hot · ordered in 30 days'),
  option('B. Warm (31-90d)', 'Warm · 31–90 days'),
  option('C. Cooling (91-180d)', 'Cooling · 91–180 days'),
  option('D. Dormant (181-365d)', 'Dormant · 181–365 days'),
  option('E. Lost (>365d)', 'Lost · over 1 year'),
]

export const SOURCE_OPTIONS = [
  option('', 'Company not selected'),
  option('SC', 'Saras Creations'),
  option('SU', 'Saras Udyog'),
  option('BOTH', 'Both companies'),
]

export const CLASSIFICATION_OPTIONS = [
  option('all', 'All customers'),
  option('classified', 'Classified only'),
  option('needs_attention', 'Needs classification'),
]

const normalize = value => String(value || '').trim().toLowerCase()

export const isCustomerClassified = customer => (
  Boolean(customer?.priority_tier)
  && Boolean(customer?.industry_sector)
  && customer.industry_sector !== 'Unknown'
)

export const filterCustomers = (customerList, filters) => {
  const search = normalize(filters.search)
  return customerList.filter(customer => {
    const searchable = [
      customer.firm_name,
      customer.contact_name,
      customer.phone,
      customer.city,
      customer.state,
      customer.gstin,
    ].map(normalize).join(' ')

    if (search && !searchable.includes(search)) return false
    if (filters.priority && customer.priority_tier !== filters.priority) return false
    if (filters.industry && customer.industry_sector !== filters.industry) return false
    if (filters.recency && customer.recency_tier !== filters.recency) return false
    if (filters.source && customer.source_company !== filters.source) return false
    if (filters.classification === 'classified' && !isCustomerClassified(customer)) return false
    if (filters.classification === 'needs_attention' && isCustomerClassified(customer)) return false
    return true
  })
}

export const getCustomerStats = customerList => customerList.reduce((stats, customer) => {
  stats.total += 1
  if (isCustomerClassified(customer)) stats.classified += 1
  else stats.needsAttention += 1
  if (/^[AB]\b/.test(customer.priority_tier || '')) stats.highValue += 1
  if (/^(A\. Hot|B\. Warm)/.test(customer.recency_tier || '')) stats.active += 1
  return stats
}, { total: 0, classified: 0, needsAttention: 0, highValue: 0, active: 0 })

export const getCustomerFormPayload = form => ({
  firm_name: String(form.firm_name || '').trim(),
  contact_name: String(form.contact_name || '').trim() || null,
  phone: String(form.phone || '').trim() || null,
  email: String(form.email || '').trim() || null,
  city: String(form.city || '').trim() || null,
  state: String(form.state || '').trim() || null,
  address: String(form.address || '').trim() || null,
  gstin: String(form.gstin || '').trim().toUpperCase() || null,
  pan: String(form.pan || '').trim().toUpperCase() || null,
  source_company: form.source_company || null,
  priority_tier: form.priority_tier || null,
  industry_sector: form.industry_sector || null,
  industry_sub: String(form.industry_sub || '').trim() || null,
  frequency_tier: form.frequency_tier || null,
  recency_tier: form.recency_tier || null,
})

const usefulSegment = customer => {
  if (customer.industry_sub && customer.industry_sub !== 'Unknown') return customer.industry_sub
  if (customer.industry_sector && customer.industry_sector !== 'Unknown') return customer.industry_sector
  return 'textile and garment accessories'
}

export const buildProspectSearches = customer => {
  const segment = usefulSegment(customer)
  const location = [customer.city, customer.state].filter(Boolean).join(', ') || 'India'
  const mapsQuery = `${segment} manufacturers wholesalers in ${location}`
  const webQuery = `${segment} buyers distributors ${location}`
  const directoryQuery = `site:indiamart.com ${segment} ${location}`
  const googleUrl = query => `https://www.google.com/search?q=${encodeURIComponent(query)}`

  return [
    {
      id: 'maps',
      title: 'Nearby businesses',
      description: 'Factories, shops and distributors near this customer.',
      query: mapsQuery,
      url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`,
    },
    {
      id: 'web',
      title: 'Similar buyers',
      description: 'Find companies in the same trade and location.',
      query: webQuery,
      url: googleUrl(webQuery),
    },
    {
      id: 'directory',
      title: 'Industry directory',
      description: 'Search matching IndiaMART business listings.',
      query: directoryQuery,
      url: googleUrl(directoryQuery),
    },
  ]
}
