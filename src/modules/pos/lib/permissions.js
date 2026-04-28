/**
 * SARAS POS — permission catalog.
 *
 * Existing ERP permission model (see contexts/AuthContext.jsx hasPermission):
 *   - admin role:   bypass — everything allowed
 *   - manager/staff: profile.permissions[module][action] === true to allow
 *   - viewer:       only 'view' actions, gated by perms[module].view !== false
 *
 * This file is the canonical list of POS permissions so other modules
 * (Sidebar visibility, route guards, action buttons) all reference the
 * same string keys instead of stringly-typing them inline.
 *
 * Cashier role grant (seeded in supabase/migrations/2026-04-28T0002_pos_seed.sql):
 *   {
 *     pos: { view: true, create: true, hold: true, discount_line: true, discount_bill: true },
 *     pos_session: { open: true, close: true },
 *     // everything else off — no orders / masters / reports / settings
 *   }
 *
 * Manager+admin get every POS permission automatically.
 */

export const POS_PERMS = Object.freeze({
  // module key
  MODULE: 'pos',

  // POS register actions
  ACCESS: 'view',          // can open the POS register at all
  CREATE: 'create',        // can finalise a sale (createSale)
  HOLD: 'hold',            // can hold + recall a bill
  DISCOUNT_LINE: 'discount_line',
  DISCOUNT_BILL: 'discount_bill',
  VOID: 'void',            // void a held bill (manager+ only)

  // Image gallery in masters
  MANAGE_IMAGES: 'manage_images',

  // Quick Invoice button on OrderDetail (mode C)
  QUICK_INVOICE: 'quick_invoice',
})

export const POS_SESSION_PERMS = Object.freeze({
  MODULE: 'pos_session',

  OPEN: 'open',            // open a drawer / cash session
  CLOSE: 'close',          // close + reconcile (variance > ₹100 needs manager re-auth)
  Z_REPORT: 'z_report',    // view day-end report
})

/**
 * Helper — does this profile have any POS access at all?
 * Used by Sidebar to decide whether to show the "POS" entry.
 *
 * @param {{ role?: string, permissions?: Record<string, Record<string, boolean>> }} profile
 * @returns {boolean}
 */
export function canAccessPos(profile) {
  if (!profile) return false
  if (profile.role === 'admin') return true
  return profile.permissions?.[POS_PERMS.MODULE]?.[POS_PERMS.ACCESS] === true
}
