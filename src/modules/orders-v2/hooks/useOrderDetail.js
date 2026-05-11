/**
 * Hook for the Orders V2 detail page.
 *
 * Reads:
 *   - the order + every join we need for any of the 6 tabs (one fetch via
 *     ordersDb.get(id) — already a fat select)
 *   - the active tab from `?tab=` (default 'overview'; falls back to overview
 *     on unknown values rather than throwing)
 *
 * Subscribes to realtime changes on `orders` filtered to this id, plus the
 * child tables that the tabs read from (line_items, deliveries, payments,
 * invoices) — all under one channel filtered to `order_id=eq.:id`.
 *
 * Returns `{ order, loading, error, refetch, tab, setTab }`.
 */

import { useCallback, useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { useSWRList } from '../../../hooks/useSWRList'
import { useRealtimeTable } from '../../../hooks/useRealtimeTable'
import { orders as ordersDb } from '../../../lib/db/orders'

const TABS = ['overview', 'production', 'dispatch', 'invoice', 'payments', 'activity']
export const ORDER_DETAIL_TABS = TABS

/**
 * @param {string} [explicitId]  override useParams (handy for tests + previews)
 */
export function useOrderDetail(explicitId) {
  const params = useParams()
  const id = explicitId || params.id

  const [searchParams, setSearchParams] = useSearchParams()
  const rawTab = (searchParams.get('tab') || 'overview').trim().toLowerCase()
  const tab = TABS.includes(rawTab) ? rawTab : 'overview'

  const cacheKey = id ? `order:${id}` : 'order:none'

  const fetcher = useCallback(async () => {
    if (!id) return null
    const res = await ordersDb.get(id)
    if (res?.error) throw res.error
    return res?.data || null
  }, [id])

  const { data: order, loading, error, refetch } = useSWRList(
    cacheKey,
    fetcher,
    { enabled: Boolean(id), staleAfterMs: 15_000 },
  )

  // Realtime: the order row + its dependent tables. Each subscription is
  // filtered server-side so a busy database doesn't fire callbacks for
  // unrelated rows.
  const filterClauseOrderId = id ? `order_id=eq.${id}` : undefined
  const filterClauseId = id ? `id=eq.${id}` : undefined

  useRealtimeTable('orders',           () => { refetch() }, { filter: filterClauseId,      enabled: Boolean(id) })
  useRealtimeTable('order_line_items', () => { refetch() }, { filter: filterClauseOrderId, enabled: Boolean(id) })
  useRealtimeTable('deliveries',       () => { refetch() }, { filter: filterClauseOrderId, enabled: Boolean(id) })
  useRealtimeTable('payments',         () => { refetch() }, { filter: filterClauseOrderId, enabled: Boolean(id) })

  const setTab = useCallback((next) => {
    if (!TABS.includes(next)) return
    const sp = new URLSearchParams(searchParams)
    if (next === 'overview') sp.delete('tab')
    else sp.set('tab', next)
    setSearchParams(sp)
  }, [searchParams, setSearchParams])

  // Derived helpers — kept here so consumers (and tabs) don't all rewrite them.
  const summary = useMemo(() => {
    if (!order) return null
    const advance = Number(order.advance_paid) || 0
    const grand = Number(order.grand_total) || 0
    const balance = Number(order.balance_due) || 0
    const lineCount = Array.isArray(order.order_line_items) ? order.order_line_items.length : 0
    return { advance, grand, balance, lineCount }
  }, [order])

  return { id, order, summary, loading, error, refetch, tab, setTab }
}
