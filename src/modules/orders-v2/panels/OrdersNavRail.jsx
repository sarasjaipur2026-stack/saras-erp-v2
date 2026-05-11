/**
 * <OrdersNavRail> — left rail of the Orders V2 workspace.
 *
 * Sections, top to bottom:
 *   1. Status      — multi-select chips (Cmd/Ctrl+click adds, plain click sets)
 *   2. Date        — single-select date preset (Today / Week / Month / All)
 *   3. Search      — debounced customer / order-number text input
 *   4. Saved       — user's saved searches; click to load, × to remove
 *   5. Save + Clear footer
 *
 * All state lives in the URL via `useOrdersList`. This component is a thin
 * controller — read filters, dispatch setFilter().
 *
 * Saved-search persistence goes through `profiles.preferences.orders_saved_searches`
 * (DAL helpers in `src/lib/db/profiles.js`). Convention documented in
 * `docs/MIGRATING_TO_SHELL.md`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Bookmark, Search as SearchIcon, Trash2 } from 'lucide-react'
import { useAuth } from '../../../contexts/AuthContext'
import { useToast } from '../../../contexts/ToastContext'
import {
  getSavedSearches,
  saveSearch,
  removeSavedSearch,
} from '../../../lib/db/profiles'
import { ORDER_STATUSES, DATE_PRESETS } from '../hooks/filterUtils'
import OrdersFilterChip from './OrdersFilterChip'

// Display label for a status code. 'qc' stays uppercase; everything else
// Title-Cases.
function statusLabel(s) {
  if (s === 'qc') return 'QC'
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const DATE_LABEL = {
  all: 'All time',
  today: 'Today',
  week: 'Last 7 days',
  month: 'Last 30 days',
  custom: 'Custom range',
}

/**
 * @param {object} props
 * @param {object} props.filters   — current filters from useOrdersList
 * @param {(patch: object) => void} props.setFilter
 */
export default function OrdersNavRail({ filters, setFilter }) {
  const { user } = useAuth()
  const toast = useToast()

  // ─── Status (multi-select) ────────────────────────────────
  const activeStatuses = useMemo(
    () => (filters.status === 'all' ? [] : filters.status.split(',')),
    [filters.status],
  )

  const toggleStatus = useCallback((s, multi) => {
    if (multi) {
      // Cmd/Ctrl+click: toggle individual chip
      const next = activeStatuses.includes(s)
        ? activeStatuses.filter((x) => x !== s)
        : [...activeStatuses, s]
      setFilter({ status: next.length ? next.join(',') : 'all' })
    } else {
      // Plain click: replace the set
      const isOnlyActive = activeStatuses.length === 1 && activeStatuses[0] === s
      setFilter({ status: isOnlyActive ? 'all' : s })
    }
  }, [activeStatuses, setFilter])

  // ─── Date preset ──────────────────────────────────────────
  const setDate = useCallback((preset) => {
    setFilter({ date: preset, dateFrom: null, dateTo: null })
  }, [setFilter])

  // ─── Q (debounced) ────────────────────────────────────────
  // Sync URL → local with the React-19 "compute during render" pattern —
  // tracking the previous URL value as state (not in an effect, not in a
  // ref). Cleaner than the legacy setState-in-effect anti-pattern.
  const currentUrlQ = filters.q || ''
  const [qLocal, setQLocal] = useState(currentUrlQ)
  const [prevUrlQ, setPrevUrlQ] = useState(currentUrlQ)
  if (prevUrlQ !== currentUrlQ) {
    setPrevUrlQ(currentUrlQ)
    if (qLocal !== currentUrlQ) setQLocal(currentUrlQ)
  }

  // Push the debounced value into the URL (300ms keystroke debounce). This
  // effect is OK — it writes to the URL (external) via setTimeout, not
  // synchronous React state.
  useEffect(() => {
    if (qLocal === currentUrlQ) return
    const t = setTimeout(() => setFilter({ q: qLocal }), 300)
    return () => clearTimeout(t)
  }, [qLocal, currentUrlQ, setFilter])

  // ─── Saved searches ───────────────────────────────────────
  const [savedList, setSavedList] = useState([])

  // Refresh helper for event handlers (save/remove). Event-handler setState
  // is normal — only effect-body setState is the cascading-render risk.
  const refreshSaved = useCallback(async () => {
    if (!user?.id) return
    const { data, error } = await getSavedSearches(user.id, 'orders')
    if (!error) setSavedList(data || [])
  }, [user])

  // Initial load — async fetch inside the effect; setState happens in the
  // `.then()` callback after a microtask boundary, not in the effect body.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    getSavedSearches(user.id, 'orders').then(({ data, error }) => {
      if (cancelled || error) return
      setSavedList(data || [])
    })
    return () => { cancelled = true }
  }, [user])

  const handleLoadSaved = useCallback((entry) => {
    // Load the entry's params over current state and mark `saved` for context.
    const patch = { saved: entry.name }
    // Re-hydrate known filter keys; anything else gets ignored by setFilter.
    if (entry.params) {
      for (const k of ['status', 'date', 'dateFrom', 'dateTo', 'q', 'nature']) {
        if (entry.params[k] != null) patch[k] = entry.params[k]
      }
    }
    setFilter(patch)
  }, [setFilter])

  const handleRemoveSaved = useCallback(async (name) => {
    if (!user?.id) return
    const { error } = await removeSavedSearch(user.id, 'orders', name)
    if (error) {
      toast.error('Could not remove saved search')
      return
    }
    setSavedList((prev) => prev.filter((e) => e.name !== name))
    // If the active saved-marker matches, clear it from URL.
    if (filters.saved === name) setFilter({ saved: null })
    toast.success?.(`Removed "${name}"`)
  }, [user, filters.saved, setFilter, toast])

  const handleSaveCurrent = useCallback(async () => {
    if (!user?.id) {
      toast.error('Sign in to save searches')
      return
    }
    const name = window.prompt('Name this search:')?.trim()
    if (!name) return
    // Capture the filter params (skip page/pageSize/saved itself).
    const params = {}
    for (const k of ['status', 'date', 'dateFrom', 'dateTo', 'q', 'nature']) {
      if (filters[k] != null && filters[k] !== '' && filters[k] !== 'all') {
        params[k] = filters[k]
      }
    }
    const { error } = await saveSearch(user.id, 'orders', { name, params })
    if (error) {
      toast.error(error.message || 'Could not save search')
      return
    }
    await refreshSaved()
    setFilter({ saved: name })
    toast.success?.(`Saved "${name}"`)
  }, [user, filters, refreshSaved, setFilter, toast])

  // ─── Clear all ────────────────────────────────────────────
  const handleClear = useCallback(() => {
    setFilter({
      status: 'all',
      date: 'all',
      dateFrom: null,
      dateTo: null,
      q: '',
      nature: 'all',
      saved: null,
    })
    setQLocal('')
  }, [setFilter])

  const hasActiveFilters =
    filters.status !== 'all' ||
    filters.date !== 'all' ||
    (filters.q && filters.q.trim()) ||
    filters.nature !== 'all' ||
    filters.saved

  return (
    <div className="flex h-full flex-col gap-4 p-3 text-[12px]">
      {/* Search */}
      <section>
        <SectionHeader>Search</SectionHeader>
        <div className="relative">
          <SearchIcon
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={qLocal}
            onChange={(e) => setQLocal(e.target.value)}
            placeholder="Customer / order #…"
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-2 text-[12px] placeholder:text-slate-400 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/10"
          />
        </div>
      </section>

      {/* Status */}
      <section>
        <SectionHeader>Status</SectionHeader>
        <div className="flex flex-col gap-1">
          <OrdersFilterChip
            active={activeStatuses.length === 0}
            onClick={() => setFilter({ status: 'all' })}
          >
            All statuses
          </OrdersFilterChip>
          {ORDER_STATUSES.map((s) => (
            <OrdersFilterChip
              key={s}
              active={activeStatuses.includes(s)}
              onClick={(e) => toggleStatus(s, e?.metaKey || e?.ctrlKey)}
              title="Cmd/Ctrl+click to multi-select"
            >
              {statusLabel(s)}
            </OrdersFilterChip>
          ))}
        </div>
      </section>

      {/* Date */}
      <section>
        <SectionHeader>Date</SectionHeader>
        <div className="flex flex-col gap-1">
          {DATE_PRESETS.filter((p) => p !== 'custom').map((p) => (
            <OrdersFilterChip
              key={p}
              active={filters.date === p}
              onClick={() => setDate(p)}
            >
              {DATE_LABEL[p]}
            </OrdersFilterChip>
          ))}
        </div>
      </section>

      {/* Saved */}
      <section>
        <SectionHeader>
          <span className="inline-flex items-center gap-1.5">
            <Bookmark size={11} /> Saved
          </span>
        </SectionHeader>
        {savedList.length === 0 ? (
          <div className="text-[11px] text-slate-400">
            No saved searches yet. Configure filters then tap <strong>Save current</strong>.
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {savedList.map((entry) => (
              <OrdersFilterChip
                key={entry.name}
                active={filters.saved === entry.name}
                onClick={() => handleLoadSaved(entry)}
                onRemove={() => handleRemoveSaved(entry.name)}
              >
                {entry.name}
              </OrdersFilterChip>
            ))}
          </div>
        )}
      </section>

      {/* Footer actions */}
      <section className="mt-auto flex flex-col gap-1.5 pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={handleSaveCurrent}
          disabled={!hasActiveFilters}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
          title={hasActiveFilters ? 'Save the current filter combination' : 'Set some filters first'}
        >
          <Bookmark size={11} /> Save current
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasActiveFilters}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
        >
          <Trash2 size={11} /> Clear all
        </button>
      </section>
    </div>
  )
}

function SectionHeader({ children }) {
  return (
    <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </div>
  )
}
