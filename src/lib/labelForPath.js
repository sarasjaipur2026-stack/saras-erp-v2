/**
 * Pure helper — best-effort human label for a router path.
 *
 * Used by useRecentPages to label entries in the sidebar's "Recent" section.
 * Pulled into its own file so it's testable without spinning up React.
 *
 * @param {string} path e.g. '/orders/abc-123', '/masters/customers'
 * @returns {string} pretty label
 */
export function labelForPath(path) {
  if (!path || path === '/') return 'Dashboard'
  const segs = path.split('/').filter(Boolean)

  // /orders/abc → "Order detail" is friendlier than "Abc"
  if (segs[0] === 'orders' && segs[1] && segs[1] !== 'new') return 'Order detail'
  if (segs[0] === 'enquiries' && segs[1] && segs[1] !== 'new') return 'Enquiry detail'
  if (segs[0] === 'masters' && segs[1]) return 'Master ' + segs[1].replace(/[-_]/g, ' ')

  // Default — prettify the last segment.
  const last = segs[segs.length - 1] || segs[0] || ''
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
