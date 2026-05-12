/**
 * Maps card id → component for the NowWhat home grid.
 *
 * Lives in its own file so cards.jsx can export only components (satisfies
 * the react-refresh/only-export-components rule).
 */

import {
  OverduePaymentsCard,
  OrdersPendingCard,
  LowStockCard,
  QcPendingCard,
  DispatchTodayCard,
  HeldBillsCard,
  TodaySalesCard,
  NewEnquiriesCard,
} from './cards'

export const CARD_REGISTRY = {
  overdue_payments: OverduePaymentsCard,
  orders_pending: OrdersPendingCard,
  low_stock: LowStockCard,
  qc_pending: QcPendingCard,
  dispatch_today: DispatchTodayCard,
  held_bills: HeldBillsCard,
  today_sales: TodaySalesCard,
  new_enquiries: NewEnquiriesCard,
}
