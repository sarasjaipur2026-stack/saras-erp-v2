/**
 * Pure visibility matrix for the status-gated quick-action stack on the
 * Orders V2 detail page.
 *
 * Every action descriptor declares EITHER a `nextStatus` (the click calls
 * `ordersDb.updateStatus(orderId, nextStatus)`) OR a `navigateTo` function
 * that takes the order and returns a URL.
 *
 * Splitting it out as a pure module lets the visibility matrix be unit-tested
 * exhaustively without rendering React.
 */

export const ORDER_STATUSES = [
  'draft', 'booking', 'approved', 'production', 'qc', 'dispatch', 'completed', 'cancelled',
]

/**
 * Build the action list for a given status. Pure — returns a NEW array each
 * call so callers can't accidentally mutate shared state.
 *
 * @param {string} status
 * @returns {Array<{
 *   id: string,
 *   label: string,
 *   icon: string,                      // lucide icon name (consumer maps it)
 *   variant: 'primary'|'secondary'|'danger',
 *   nextStatus?: string,               // for 'status' kind
 *   navigateTo?: (order: object) => string,  // for 'navigate' kind
 * }>}
 */
export function quickActionsForStatus(status) {
  switch (status) {
    case 'draft':
    case 'booking':
      return [
        { id: 'approve', label: 'Approve',  icon: 'CheckCircle2', variant: 'primary',   nextStatus: 'approved' },
        { id: 'edit',    label: 'Edit',     icon: 'Pencil',       variant: 'secondary', navigateTo: (o) => `/orders/${o.id}/edit` },
        { id: 'cancel',  label: 'Cancel',   icon: 'XCircle',      variant: 'danger',    nextStatus: 'cancelled' },
      ]

    case 'approved':
      return [
        { id: 'start-production', label: 'Start production', icon: 'Factory', variant: 'primary',   nextStatus: 'production' },
        { id: 'edit',             label: 'Edit',             icon: 'Pencil',  variant: 'secondary', navigateTo: (o) => `/orders/${o.id}/edit` },
        { id: 'hold',             label: 'Hold',             icon: 'Pause',   variant: 'secondary', nextStatus: 'booking' },
      ]

    case 'production':
      return [
        { id: 'mark-qc', label: 'Mark QC',  icon: 'ClipboardCheck', variant: 'primary',   nextStatus: 'qc' },
        { id: 'edit',    label: 'Edit',     icon: 'Pencil',         variant: 'secondary', navigateTo: (o) => `/orders/${o.id}/edit` },
      ]

    case 'qc':
      return [
        { id: 'schedule-dispatch', label: 'Schedule dispatch', icon: 'Truck',     variant: 'primary',   navigateTo: (o) => `/dispatch?order_id=${o.id}` },
        { id: 'back-to-production', label: 'Back to production', icon: 'Factory', variant: 'secondary', nextStatus: 'production' },
      ]

    case 'dispatch':
      return [
        { id: 'mark-completed',   label: 'Mark completed',   icon: 'CheckCheck', variant: 'primary',   nextStatus: 'completed' },
        { id: 'generate-invoice', label: 'Generate invoice', icon: 'FileText',   variant: 'secondary', navigateTo: (o) => `/invoicing/new?order_id=${o.id}` },
      ]

    case 'completed':
      return [
        { id: 'record-payment',   label: 'Record payment',   icon: 'Banknote', variant: 'primary',   navigateTo: (o) => `/finance/payments/new?order_id=${o.id}` },
        { id: 'generate-invoice', label: 'Generate invoice', icon: 'FileText', variant: 'secondary', navigateTo: (o) => `/invoicing/new?order_id=${o.id}` },
      ]

    case 'cancelled':
      return [
        { id: 'reopen', label: 'Reopen', icon: 'RotateCcw', variant: 'secondary', nextStatus: 'draft' },
      ]

    default:
      return []
  }
}

/**
 * Helper for tests + UI: does a given status expose a given action id?
 */
export function isActionVisible(status, actionId) {
  return quickActionsForStatus(status).some((a) => a.id === actionId)
}
