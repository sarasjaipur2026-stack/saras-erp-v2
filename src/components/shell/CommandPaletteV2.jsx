/**
 * CommandPaletteV2 — primary navigation surface for the new ERP shell.
 *
 * One overlay, four search domains, one box. Replaces legacy CommandPalette.
 *
 * Features:
 *  - Domain-grouped results: Navigate · People · Records · Products
 *  - Verb commands: `>add customer`, `>new order`, `>pos`, `>q <query>`
 *  - Recent items on empty palette (last 5 records touched)
 *  - Tab cycles domain filter (All → People → Records → Products → Navigate → All)
 *  - Arrow up/down + Enter to jump
 *  - Cmd/Ctrl+Enter opens result in side-drawer (cross-module peek)
 *  - Esc dismisses
 *  - Mobile: full-screen sheet
 *
 * Open triggers: Cmd/Ctrl+K, `/` shortcut, or the saras:open-command-palette
 * window event dispatched by TopbarV2's hotbar.
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.3
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 5
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, ArrowRight, Plus, X, Eye, Hash } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { NAV_ITEMS, SYSTEM_ITEMS } from '../../lib/navItems'
import { searchAcrossDomains, formatResult, DOMAINS } from '../../lib/db/search'
import SearchResultDrawer from './SearchResultDrawer'

const VERBS = [
  { key: '>add customer', label: 'Add new customer', path: '/masters/customers?new=1', perm: ['masters', 'manage'] },
  { key: '>new order', label: 'New order', path: '/orders/new', perm: ['orders', 'create'] },
  { key: '>new enquiry', label: 'New enquiry', path: '/enquiries/new', perm: ['orders', 'create'] },
  { key: '>new invoice', label: 'New invoice', path: '/invoices?new=1', perm: ['invoices', 'create'] },
  { key: '>new payment', label: 'Record payment', path: '/payments?new=1', perm: ['payments', 'record'] },
  { key: '>pos', label: 'Open POS register', path: '/pos', perm: ['pos'] },
  { key: '>pos field', label: 'Open POS (field mode)', path: '/pos/field', perm: ['pos'] },
  { key: '>photos', label: 'Product photo wizard', path: '/pos/photo-wizard', perm: ['masters'] },
]

const RECENT_KEY = (uid) => `saras_palette_recent:${uid || 'anon'}`
const MAX_RECENT = 5
const DEBOUNCE_MS = 250

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '')

const norm = (s) => (s || '').toString().toLowerCase().trim()

export default function CommandPaletteV2() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin, hasPermission } = useAuth()
  const { user } = useAuth()

  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const [domainFilter, setDomainFilter] = useState('all') // 'all' | DOMAIN
  const [results, setResults] = useState(null) // null until first search
  const [loading, setLoading] = useState(false)
  const [drawerResult, setDrawerResult] = useState(null)
  const inputRef = useRef(null)

  // ---- open/close lifecycle ----
  const open = useCallback(() => {
    setIsOpen(true)
    setActiveIdx(0)
  }, [])
  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setActiveIdx(0)
    setDomainFilter('all')
    setResults(null)
  }, [])

  // Global hotkey + open-event listener
  useEffect(() => {
    const onKey = (e) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')
      const isSlash = e.key === '/' && !e.target?.matches?.('input, textarea, select, [contenteditable]')
      if (isCmdK || isSlash) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      } else if (e.key === 'Escape' && isOpen) {
        close()
      }
    }
    const onEvt = () => open()
    window.addEventListener('keydown', onKey)
    window.addEventListener('saras:open-command-palette', onEvt)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('saras:open-command-palette', onEvt)
    }
  }, [isOpen, open, close])

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 50)
      return () => clearTimeout(t)
    }
  }, [isOpen])

  // Close on route change
  const [prevPath, setPrevPath] = useState(location.pathname)
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname)
    if (isOpen) close()
  }

  // ---- query → results pipeline (debounced) ----
  useEffect(() => {
    if (!isOpen) return
    const q = query.trim()
    if (q.length === 0) {
      setResults(null)
      setLoading(false)
      return
    }
    // verb queries: skip RPC entirely
    if (q.startsWith('>')) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      const { data } = await searchAcrossDomains(q)
      setResults(data)
      setLoading(false)
      setActiveIdx(0)
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [query, isOpen])

  // ---- recent items (persisted) ----
  const recent = useMemo(() => {
    if (!user?.id) return []
    try {
      const raw = sessionStorage.getItem(RECENT_KEY(user.id))
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.slice(0, MAX_RECENT) : []
    } catch { return [] }
  }, [user?.id, isOpen])

  const pushRecent = useCallback((item) => {
    if (!user?.id) return
    try {
      const cur = JSON.parse(sessionStorage.getItem(RECENT_KEY(user.id)) || '[]')
      const without = cur.filter(c => c.id !== item.id)
      const next = [item, ...without].slice(0, MAX_RECENT)
      sessionStorage.setItem(RECENT_KEY(user.id), JSON.stringify(next))
    } catch {/* ignore */}
  }, [user?.id])

  // ---- assemble flat list for keyboard navigation ----
  const sections = useMemo(() => {
    const q = query.trim()
    const qNorm = norm(q)

    // Verb mode
    if (q.startsWith('>')) {
      const verbItems = VERBS
        .filter(v => v.key.startsWith(qNorm) || norm(v.label).includes(qNorm.replace(/^>/, '')))
        .filter(v => !v.perm || isAdmin || hasPermission(v.perm[0], v.perm[1]))
        .map(v => ({ kind: 'verb', id: v.key, label: v.label, path: v.path }))
      return [{ key: 'verbs', label: 'Quick actions', items: verbItems }]
    }

    // Empty query → recent + popular nav
    if (q.length === 0) {
      const recentItems = recent.map(r => ({
        kind: 'recent', id: r.id, label: r.label, path: r.path, subtitle: r.subtitle,
      }))
      const navItems = [...NAV_ITEMS, ...SYSTEM_ITEMS]
        .filter(it => {
          if (it.adminOnly) return isAdmin
          if (!it.perm) return true
          return hasPermission(it.perm)
        })
        .slice(0, 8)
        .map(it => ({ kind: 'nav', id: `nav:${it.path}`, label: it.label, path: it.path }))
      return [
        recentItems.length > 0 && { key: 'recent', label: 'Recent', items: recentItems },
        { key: 'navigate', label: 'Jump to', items: navItems },
      ].filter(Boolean)
    }

    // Query mode
    const out = []

    // Navigate domain — client-side filter on nav items
    if (domainFilter === 'all' || domainFilter === 'navigate') {
      const navMatches = [...NAV_ITEMS, ...SYSTEM_ITEMS]
        .filter(it => {
          if (it.adminOnly) return isAdmin
          if (!it.perm) return true
          return hasPermission(it.perm)
        })
        .filter(it => norm(it.label).includes(qNorm) || norm(it.path).includes(qNorm))
        .slice(0, 6)
        .map(it => ({ kind: 'nav', id: `nav:${it.path}`, label: it.label, path: it.path }))
      if (navMatches.length > 0) out.push({ key: 'navigate', label: '🧭 Navigate', items: navMatches })
    }

    if (results) {
      if (domainFilter === 'all' || domainFilter === 'people') {
        const items = results.people.map(r => ({ kind: 'record', id: r.entity_id, raw: r, ...formatResult(r) }))
        if (items.length) out.push({ key: 'people', label: '👥 People', items })
      }
      if (domainFilter === 'all' || domainFilter === 'records') {
        const items = results.records.map(r => ({ kind: 'record', id: r.entity_id, raw: r, ...formatResult(r) }))
        if (items.length) out.push({ key: 'records', label: '📦 Records', items })
      }
      if (domainFilter === 'all' || domainFilter === 'products') {
        const items = results.products.map(r => ({ kind: 'record', id: r.entity_id, raw: r, ...formatResult(r) }))
        if (items.length) out.push({ key: 'products', label: '📐 Products', items })
      }
    }

    return out
  }, [query, results, domainFilter, recent, isAdmin, hasPermission])

  // Flat list for arrow navigation
  const flat = useMemo(() => sections.flatMap(s => s.items.map(it => ({ ...it, sectionKey: s.key }))), [sections])

  // ---- keyboard nav ----
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, Math.max(0, flat.length - 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(0, i - 1))
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const idx = DOMAINS.indexOf(domainFilter)
      const next = domainFilter === 'all'
        ? DOMAINS[0]
        : idx >= 0 && idx < DOMAINS.length - 1
          ? DOMAINS[idx + 1]
          : 'all'
      setDomainFilter(next)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const item = flat[activeIdx]
      if (!item) return
      if (e.metaKey || e.ctrlKey) {
        // Cmd+Enter → side drawer (only for record results)
        if (item.kind === 'record') {
          setDrawerResult(item.raw)
          return
        }
      }
      pickItem(item)
    }
  }

  const pickItem = (item) => {
    if (item.kind === 'record') {
      pushRecent({ id: item.id, label: item.title, path: item.path, subtitle: item.subtitle })
    }
    close()
    if (item.path && item.path !== '#') navigate(item.path)
  }

  // ---- render ----
  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-3"
          onClick={close}
        >
          <div
            className="w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input row */}
            <div className="px-3 py-2.5 flex items-center gap-2 border-b border-slate-100">
              <Search size={16} className="text-slate-400 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Search · type > for actions"
                className="flex-1 outline-none text-sm placeholder:text-slate-400"
                autoComplete="off"
                spellCheck="false"
              />
              {loading && <span className="text-[10px] text-slate-400">searching…</span>}
              <button onClick={close} className="p-1 text-slate-300 hover:text-slate-600 rounded">
                <X size={14} />
              </button>
            </div>

            {/* Domain filter chips */}
            {query.trim().length > 0 && !query.startsWith('>') && (
              <div className="px-3 py-1.5 border-b border-slate-100 flex items-center gap-1.5 text-[10px]">
                <FilterChip label="All" active={domainFilter === 'all'} onClick={() => setDomainFilter('all')} />
                <FilterChip label="🧭 Navigate" active={domainFilter === 'navigate'} onClick={() => setDomainFilter('navigate')} />
                <FilterChip label="👥 People" active={domainFilter === 'people'} onClick={() => setDomainFilter('people')} />
                <FilterChip label="📦 Records" active={domainFilter === 'records'} onClick={() => setDomainFilter('records')} />
                <FilterChip label="📐 Products" active={domainFilter === 'products'} onClick={() => setDomainFilter('products')} />
                <span className="ml-auto text-slate-400 hidden sm:inline">Tab to cycle</span>
              </div>
            )}

            {/* Results */}
            <div className="flex-1 overflow-y-auto py-1">
              {sections.length === 0 && (
                <EmptyState query={query} />
              )}
              {sections.map((section) => (
                <Section key={section.key} label={section.label}>
                  {section.items.map((item) => {
                    const globalIdx = flat.findIndex(f => f.id === item.id && f.sectionKey === section.key)
                    const active = globalIdx === activeIdx
                    return (
                      <ResultRow
                        key={item.id}
                        item={item}
                        active={active}
                        onClick={() => pickItem(item)}
                        onPeek={item.kind === 'record' ? () => setDrawerResult(item.raw) : null}
                      />
                    )
                  })}
                </Section>
              ))}
            </div>

            {/* Footer hints */}
            <div className="px-3 py-1.5 border-t border-slate-100 text-[10px] text-slate-400 flex items-center gap-3 shrink-0">
              <Kbd>↑↓</Kbd> nav
              <Kbd>Enter</Kbd> open
              <Kbd>{isMac ? '⌘' : 'Ctrl'} ↵</Kbd> peek
              <Kbd>Tab</Kbd> domain
              <Kbd>Esc</Kbd> close
            </div>
          </div>
        </div>
      )}

      {drawerResult && (
        <SearchResultDrawer
          result={drawerResult}
          onClose={() => setDrawerResult(null)}
        />
      )}
    </>
  )
}

/* ----------------------------- subcomponents ----------------------------- */

function Section({ label, children }) {
  return (
    <div className="mb-1">
      <div className="px-3 pt-1.5 pb-1 text-[9px] uppercase tracking-wider font-semibold text-slate-400">
        {label}
      </div>
      <div>{children}</div>
    </div>
  )
}

function ResultRow({ item, active, onClick, onPeek }) {
  const Icon = item.kind === 'verb' ? Plus : item.kind === 'nav' ? ArrowRight : item.kind === 'recent' ? Hash : ArrowRight
  return (
    <div
      onClick={onClick}
      className={`group cursor-pointer mx-1 px-3 py-1.5 rounded-lg flex items-center gap-2 ${active ? 'bg-indigo-50' : 'hover:bg-slate-50'}`}
    >
      <Icon size={13} className={active ? 'text-indigo-600' : 'text-slate-300'} />
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] font-semibold truncate ${active ? 'text-indigo-700' : 'text-slate-700'}`}>{item.label || item.title}</div>
        {item.subtitle && (
          <div className="text-[10px] text-slate-400 truncate">{item.subtitle}</div>
        )}
      </div>
      {onPeek && (
        <button
          onClick={(e) => { e.stopPropagation(); onPeek() }}
          title="Peek (Cmd+Enter)"
          className="p-1 rounded text-slate-300 hover:text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Eye size={12} />
        </button>
      )}
    </div>
  )
}

function FilterChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-1.5 py-0.5 rounded-md font-semibold transition-colors ${active ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
    >
      {label}
    </button>
  )
}

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center px-1 py-0.5 rounded bg-slate-100 border border-slate-200 text-slate-600 font-mono text-[9px]">{children}</kbd>
  )
}

function EmptyState({ query }) {
  const q = query.trim()
  if (q.length === 0) {
    return <div className="px-3 py-6 text-center text-[12px] text-slate-400">Type to search · or <span className="font-mono bg-slate-100 px-1 rounded">{'>'}</span> for actions</div>
  }
  if (q.startsWith('>')) {
    return <div className="px-3 py-6 text-center text-[12px] text-slate-400">No matching action — try {'>'}new order, {'>'}add customer, {'>'}pos</div>
  }
  return <div className="px-3 py-6 text-center text-[12px] text-slate-400">Nothing found · try a shorter query or <span className="font-mono bg-slate-100 px-1 rounded">{'>'}</span> for actions</div>
}
