/**
 * Fetch the outstanding balance for a customer = sum of `balance_due` across
 * all orders for that customer that aren't completed / cancelled.
 *
 * Doesn't touch the shared orders DAL — keeps the query local to orders-v2
 * so the audit-flagged ESLint issues in `src/lib/db/orders.js` stay
 * untouched until they're fixed in a dedicated pass.
 *
 * Returns `{ outstanding, openCount, loading, error, refetch }`.
 */

import { useCallback } from 'react'
import { useSWRList } from '../../../hooks/useSWRList'
import { supabase } from '../../../lib/supabase'

const OPEN_STATUSES_NEGATIVE = ['completed', 'cancelled']

export function useCustomerOutstanding(customerId) {
  const key = customerId ? `customer-outstanding:${customerId}` : 'customer-outstanding:none'

  const fetcher = useCallback(async () => {
    if (!customerId) return { outstanding: 0, openCount: 0 }
    const { data, error } = await supabase
      .from('orders')
      .select('balance_due, status')
      .eq('customer_id', customerId)
      .not('status', 'in', `(${OPEN_STATUSES_NEGATIVE.join(',')})`)
      .limit(2000)
    if (error) throw error
    let outstanding = 0
    let openCount = 0
    for (const row of data || []) {
      const bal = Number(row.balance_due) || 0
      if (bal > 0) outstanding += bal
      openCount += 1
    }
    return { outstanding, openCount }
  }, [customerId])

  const { data, loading, error, refetch } = useSWRList(key, fetcher, {
    enabled: Boolean(customerId),
    // Outstanding doesn't change as often as the order itself — 60 s is fine,
    // and a new save in this wizard will invalidate by virtue of the
    // realtime channel on the orders table.
    staleAfterMs: 60_000,
  })

  return {
    outstanding: Number(data?.outstanding) || 0,
    openCount: Number(data?.openCount) || 0,
    loading,
    error,
    refetch,
  }
}
