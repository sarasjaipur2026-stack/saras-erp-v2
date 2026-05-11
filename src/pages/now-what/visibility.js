/**
 * NowWhat — card visibility predicates.
 *
 * Card visibility is role-aware:
 *   - Admin / manager → all cards
 *   - Staff → all except sensitive financial-admin-only cards (overdue,
 *     gross sales). They still see operational cards (low stock, dispatches,
 *     held bills, new enquiries, jobs).
 *   - Viewer → read-only operational cards
 *   - Cashier (POS-only) → only POS-relevant cards (held bills, today's
 *     sales)
 *
 * If a role isn't recognised, default to admin-level visibility (fail-open
 * inside the app — RLS still gates the underlying queries server-side).
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.2
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 6
 */

const ROLE_RULES = {
  admin: '*',
  manager: '*',
  staff: ['orders_pending', 'low_stock', 'qc_pending', 'dispatch_today', 'held_bills', 'today_sales', 'new_enquiries'],
  viewer: ['low_stock', 'dispatch_today', 'today_sales', 'new_enquiries'],
  cashier: ['held_bills', 'today_sales'],
}

const ALL_CARDS = [
  'overdue_payments',
  'orders_pending',
  'low_stock',
  'qc_pending',
  'dispatch_today',
  'held_bills',
  'today_sales',
  'new_enquiries',
]

/**
 * @param {string} role
 * @returns {string[]} card ids visible to this role, in declared order
 */
export function cardsForRole(role) {
  const allowed = ROLE_RULES[role] ?? '*'
  if (allowed === '*') return ALL_CARDS
  return ALL_CARDS.filter(id => allowed.includes(id))
}

/**
 * Convenience helper for tests + components.
 *
 * @param {string} role
 * @param {string} cardId
 */
export function isCardVisible(role, cardId) {
  return cardsForRole(role).includes(cardId)
}
