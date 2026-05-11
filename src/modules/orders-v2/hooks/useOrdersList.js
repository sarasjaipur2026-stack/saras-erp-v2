import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSWRList } from '../../../hooks/useSWRList'
import { useRealtimeTable } from '../../../hooks/useRealtimeTable'
import { orders as ordersDb } from '../../../lib/db/orders'
import {
  parseFiltersFromURL,
  serializeFiltersToURL,
  cacheKey,
  filtersToListPagedArgs,
  matchesFilter,
  EMPTY_FILTERS,
} from './filterUtils'

/**
 * Hook for the Orders V2 list page.
 *
 * - The URL (`?status=…&date=…&q=…&saved=…&page=…`) is the source of truth
 *   for filter state. Any tab switch / refresh / deep-link comes back with
 *   the same view.
 * - `useSWRList` caches one entry per filter combination — switching back
 *   to a previously-visited filter set repaints instantly from sessionStorage,
 *   then revalidates in the background.
 * - `useRealtimeTable('orders')` triggers a debounced background refetch when
 *   the orders table changes anywhere (own insert, other-user update, etc.).
 *
 * Multi-status filtering: the server only pushes down a single status. When
 * the filter is multi-status we leave it off the server query and apply
 * `matchesFilter` client-side over the returned page.
 *
 * @returns {{
 *   filters: object,
 *   rows: Array<object>,
 *   count: number,
 *   loading: boolean,
 *   error: Error | null,
 *   refetch: () => Promise<unknown>,
 *   setFilter: (patch: object) => void,
 * }}
 */
export function useOrdersList() {
  const [searchParams, setSearchParams] = useSearchParams()
  const searchString = searchParams.toString()

  // `searchString` is a stable, primitive dep — re-parse only when the URL
  // actually changed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const filters = useMemo(() => parseFiltersFromURL(searchParams), [searchString])
  const key = useMemo(() => cacheKey(filters), [filters])
  const listPagedArgs = useMemo(() => filtersToListPagedArgs(filters), [filters])
  const argsKey = useMemo(() => JSON.stringify(listPagedArgs), [listPagedArgs])

  // Stable fetcher keyed on argsKey — useSWRList holds the reference for the
  // lifetime of a key, so we just need it to be deterministic per filter set.
  const fetcher = useCallback(async () => {
    const res = await ordersDb.listPaged(listPagedArgs)
    return { rows: res?.data || [], count: res?.count || 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [argsKey])

  const { data, loading, error, refetch } = useSWRList(key, fetcher, { staleAfterMs: 30_000 })

  // Realtime: any change on `orders` → background refetch. The hook itself
  // debounces 250ms, so a burst of inserts collapses into one round-trip.
  useRealtimeTable('orders', () => { refetch() })

  // Multi-status: server returns the broader set (or status=all), we narrow.
  const rows = useMemo(() => {
    const all = data?.rows || []
    const list = filters.status === 'all' ? [] : filters.status.split(',')
    if (list.length > 1) return all.filter((r) => matchesFilter(r, filters))
    return all
  }, [data, filters])

  const count = data?.count || 0

  /**
   * Patch the filter set. Resets pagination unless `page` is explicitly part
   * of the patch — clicking a filter chip should return to page 0.
   *
   * @param {object} patch
   */
  const setFilter = useCallback((patch) => {
    const next = { ...filters, ...patch }
    if (!('page' in patch)) next.page = 0
    setSearchParams(serializeFiltersToURL(next))
  }, [filters, setSearchParams])

  return { filters, rows, count, loading, error, refetch, setFilter }
}

export { EMPTY_FILTERS }
