import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Clock, ArrowRight, X, Zap, FileText, Receipt, Truck, CreditCard, Package, Users, ShoppingCart } from 'lucide-react'
import { search, ENTITY_LABELS, ENTITY_ROUTES, groupResults } from '../lib/db/search'
import { useRecentSearches } from '../hooks/useRecentSearches'
import { useCommandPalette } from '../hooks/useCommandPalette'

const ICONS = {
  customer: Users,
  order: ShoppingCart,
  enquiry: FileText,
  invoice: Receipt,
  payment: CreditCard,
  delivery: Truck,
  purchase_order: Package,
  product: Package,
}

const JUMP_TO = [
  { label: 'New Order',     path: '/orders/new',     shortcut: null, icon: ShoppingCart },
  { label: 'New Enquiry',   path: '/enquiries/new',  shortcut: null, icon: FileText },
  { label: "Today's Dispatches", path: '/dispatch',  shortcut: null, icon: Truck },
  { label: 'Overdue Payments',   path: '/payments',  shortcut: null, icon: CreditCard },
]

// Small helper — debounce a value so we don't hammer the RPC
function useDebounced(value, ms = 150) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// Format currency — short form for palette rows
const fmt = (n) => {
  if (n == null) return ''
  const num = Number(n)
  if (!isFinite(num)) return ''
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(1)}Cr`
  if (num >= 100000)   return `₹${(num / 100000).toFixed(1)}L`
  if (num >= 1000)     return `₹${(num / 1000).toFixed(0)}k`
  return `₹${num.toLocaleString('en-IN')}`
}

// Outer wrapper — just handles the open/close keyboard binding.
// The inner component mounts fresh each time the palette is opened,
// so state (query, results, selected index) is always clean without
// needing setState-in-effect patterns.
export default function CommandPalette() {
  const { open, hide } = useCommandPalette()
  if (!open) return null
  return <CommandPaletteInner hide={hide} />
}

function CommandPaletteInner({ hide }) {
  const navigate = useNavigate()
  const { recents, remember, clear } = useRecentSearches()

  const [query, setQuery] = useState('')
  const debounced = useDebounced(query, 150)
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [errMsg, setErrMsg] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)

  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Autofocus the input once on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [])

  // Fire the RPC when the debounced query changes.
  // Fire the RPC when the debounced query changes — this effect genuinely
  // synchronises React state with an external async source (the Postgres RPC).
  // All setState calls below are either (a) gated on the async callback
  // resolving or (b) handle the empty-query reset case. This is the intended
  // use of useEffect per React docs and does not cause cascading renders.
  useEffect(() => {
    const q = debounced.trim()
    if (!q) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setResults([])
      setLoading(false)
      /* eslint-enable react-hooks/set-state-in-effect */
      return
    }
    let cancelled = false
    setLoading(true)
    setErrMsg('')
    search.entities(q, { maxPer: 5 })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setErrMsg("Couldn't search right now. Retry?"); setResults([]); return }
        setResults(Array.isArray(data) ? data : [])
        setSelectedIdx(0)
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [debounced])

  const grouped = useMemo(() => groupResults(results), [results])

  // Flattened list for keyboard navigation
  const flatItems = useMemo(() => grouped.flatMap((g) => g.rows), [grouped])

  const openItem = useCallback((item) => {
    if (!item) return
    remember(item)
    const builder = ENTITY_ROUTES[item.entity_type]
    if (builder) {
      navigate(builder(item.entity_id))
      hide()
    }
  }, [remember, navigate, hide])

  // Keyboard navigation within the palette
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIdx((i) => Math.min(i + 1, Math.max(flatItems.length - 1, 0)))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIdx((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (flatItems.length > 0) {
          openItem(flatItems[selectedIdx])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [flatItems, selectedIdx, openItem])

  // Scroll selected row into view
  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-idx="${selectedIdx}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [selectedIdx])

  const hasQuery = query.trim().length > 0
  const showEmptyResults = hasQuery && !loading && results.length === 0 && !errMsg

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center p-0 sm:p-4 sm:pt-[8vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      onMouseDown={(e) => { if (e.target === e.currentTarget) hide() }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
        onMouseDown={hide}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[80vh] bg-white sm:rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400 flex-shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything — firm, GSTIN, phone, city, order, invoice..."
            className="flex-1 bg-transparent text-[15px] text-slate-900 placeholder-slate-400 outline-none"
            aria-label="Search query"
            aria-controls="command-palette-results"
            aria-activedescendant={flatItems.length ? `cp-item-${selectedIdx}` : undefined}
          />
          {loading && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" aria-label="Searching" />}
          <button
            onClick={hide}
            className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-600 flex-shrink-0"
            aria-label="Close search"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div id="command-palette-results" ref={listRef} className="flex-1 overflow-y-auto">
          {/* Empty state (no query) */}
          {!hasQuery && (
            <>
              {recents.length > 0 && (
                <section className="px-2 py-2">
                  <header className="flex items-center justify-between px-3 py-1">
                    <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Recent</span>
                    <button onClick={clear} className="text-[11px] text-slate-400 hover:text-slate-600">Clear</button>
                  </header>
                  {recents.slice(0, 8).map((r) => (
                    <button
                      key={`${r.entity_type}-${r.entity_id}`}
                      onClick={() => openItem(r)}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-left"
                    >
                      <Clock className="w-4 h-4 text-slate-400 flex-shrink-0" aria-hidden="true" />
                      <span className="flex-1 min-w-0 text-[13px] text-slate-900 truncate">
                        {r.primary_label}
                        {r.secondary && <span className="text-slate-400 ml-2">· {r.secondary}</span>}
                      </span>
                      <span className="text-[11px] text-slate-400 capitalize">{ENTITY_LABELS[r.entity_type] || r.entity_type}</span>
                    </button>
                  ))}
                </section>
              )}
              <section className="px-2 py-2 border-t border-slate-100">
                <header className="px-3 py-1">
                  <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Jump to</span>
                </header>
                {JUMP_TO.map((j) => {
                  const Icon = j.icon
                  return (
                    <button
                      key={j.path}
                      onClick={() => { navigate(j.path); hide() }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 text-left"
                    >
                      <Icon className="w-4 h-4 text-indigo-500 flex-shrink-0" aria-hidden="true" />
                      <span className="flex-1 text-[13px] text-slate-900">{j.label}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-300" aria-hidden="true" />
                    </button>
                  )
                })}
              </section>
            </>
          )}

          {/* Results */}
          {hasQuery && results.length > 0 && (
            <div className="py-2">
              {grouped.map((group) => (
                <section key={group.type} className="mb-2">
                  <header className="px-5 py-1 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
                    {group.label}
                  </header>
                  {group.rows.map((row) => {
                    const flatIdx = flatItems.findIndex((f) => f.entity_type === row.entity_type && f.entity_id === row.entity_id)
                    const isSelected = flatIdx === selectedIdx
                    const Icon = ICONS[row.entity_type] || FileText
                    const meta = row.metadata || {}
                    return (
                      <button
                        key={`${row.entity_type}-${row.entity_id}`}
                        id={`cp-item-${flatIdx}`}
                        data-idx={flatIdx}
                        onClick={() => openItem(row)}
                        onMouseEnter={() => setSelectedIdx(flatIdx)}
                        className={`w-full flex items-center gap-3 px-5 py-2 text-left ${isSelected ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-indigo-600' : 'text-slate-400'}`} aria-hidden="true" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[13px] font-medium text-slate-900 truncate">{row.primary_label}</span>
                            {row.secondary && (
                              <span className="text-[11px] font-mono text-slate-400 flex-shrink-0">· {row.secondary}</span>
                            )}
                          </div>
                          {/* Meta line — compact, entity-type specific */}
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {row.entity_type === 'customer' && [meta.city, meta.state, meta.priority_tier].filter(Boolean).join(' · ')}
                            {row.entity_type === 'order' && [fmt(meta.grand_total), meta.status].filter(Boolean).join(' · ')}
                            {row.entity_type === 'invoice' && [fmt(meta.grand_total), meta.status].filter(Boolean).join(' · ')}
                            {row.entity_type === 'payment' && [fmt(meta.amount), meta.payment_mode, meta.payment_date].filter(Boolean).join(' · ')}
                            {row.entity_type === 'delivery' && [meta.delivery_date, meta.vehicle_number].filter(Boolean).join(' · ')}
                            {row.entity_type === 'purchase_order' && [fmt(meta.grand_total), meta.status].filter(Boolean).join(' · ')}
                            {row.entity_type === 'enquiry' && [meta.source, meta.status].filter(Boolean).join(' · ')}
                            {row.entity_type === 'product' && [meta.category, meta.hsn_code].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                        {isSelected && <ArrowRight className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" aria-hidden="true" />}
                      </button>
                    )
                  })}
                </section>
              ))}
            </div>
          )}

          {/* Empty results */}
          {showEmptyResults && (
            <div className="px-6 py-12 text-center">
              <Zap className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
              <p className="text-[13px] text-slate-600">No results. Try fewer words or check spelling.</p>
            </div>
          )}

          {/* Error state */}
          {errMsg && (
            <div className="px-6 py-8 text-center">
              <p className="text-[13px] text-red-600 mb-3">{errMsg}</p>
              <button
                onClick={() => setQuery((q) => q + ' ')}
                className="text-[12px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Footer tips */}
        {hasQuery && results.length > 0 && (
          <div className="hidden sm:flex items-center justify-between px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400">
            <span>↑↓ navigate · ⏎ open · Esc close</span>
            <span>{flatItems.length} result{flatItems.length === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>
    </div>
  )
}
