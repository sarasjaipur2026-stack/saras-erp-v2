import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { Search, Plus, ArrowRight, Command, FileText, User } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { NAV_ITEMS, SYSTEM_ITEMS } from '../lib/navItems'
import { supabase } from '../lib/supabase'

// Ctrl+K / Cmd+K global command palette. Lets the operator jump to any module
// or kick off a quick action from anywhere without touching the sidebar.
// Typed query fuzzy-matches on label + path + synonyms (e.g. "gst" → Invoices).
// H19 — each quick action now declares the (module, action) gate it needs.
// Hidden for users without the permission so viewers don't see "New invoice"
// etc. links that would just redirect them into a view-only page.
const QUICK_ACTIONS = [
  { id: 'new-order', label: 'New order', icon: Plus, path: '/orders/new', keywords: 'create booking sale', perm: ['orders', 'create'] },
  { id: 'new-customer', label: 'New customer', icon: Plus, path: '/masters/customers?new=1', keywords: 'add party firm gstin', perm: ['masters', 'manage'] },
  { id: 'new-invoice', label: 'New invoice', icon: Plus, path: '/invoices?new=1', keywords: 'bill gst tax', perm: ['invoices', 'create'] },
  { id: 'new-payment', label: 'Record payment', icon: Plus, path: '/payments?new=1', keywords: 'receive cash cheque upi neft', perm: ['payments', 'record'] },
  { id: 'new-enquiry', label: 'New enquiry', icon: Plus, path: '/enquiries/new', keywords: 'lead inquiry', perm: ['orders', 'create'] },
]

const SYNONYMS = {
  '/invoices': 'bill tax gst',
  '/payments': 'receive cash cheque',
  '/masters/customers': 'party firm',
  '/masters/suppliers': 'vendor',
  '/masters/hsn-codes': 'hsn tax gst code',
  '/calculator': 'costing price quote',
  '/stock': 'inventory kg bag',
  '/dispatch': 'delivery lr ship',
  '/reports': 'mis summary',
}

const normalize = (s) => (s || '').toString().toLowerCase()

export default function CommandPalette() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin, hasPermission } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)

  // Global Ctrl+K / Cmd+K toggle. Registers once on mount, tears down on unmount.
  useEffect(() => {
    const handler = (e) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')
      if (isCmdK) {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  // Prev-prop sync — close palette on route change + reset on open.
  // Using the sync-state-during-render pattern instead of useEffect to avoid
  // react-hooks/set-state-in-effect cascading-render warnings.
  const [prevPath, setPrevPath] = useState(location.pathname)
  if (prevPath !== location.pathname) {
    setPrevPath(location.pathname)
    if (isOpen) setIsOpen(false)
    if (query) setQuery('')
  }

  const [prevOpen, setPrevOpen] = useState(isOpen)
  if (prevOpen !== isOpen) {
    setPrevOpen(isOpen)
    if (isOpen) {
      if (query) setQuery('')
      if (activeIdx !== 0) setActiveIdx(0)
    }
  }

  // Autofocus the input when the palette opens — refs can only be touched
  // inside effects, so focus is side-effect only here, no state writes.
  useEffect(() => {
    if (!isOpen) return
    const t = setTimeout(() => inputRef.current?.focus(), 40)
    return () => clearTimeout(t)
  }, [isOpen])

  const navItems = useMemo(() => {
    return [...NAV_ITEMS, ...SYSTEM_ITEMS]
      .filter((it) => {
        if (it.adminOnly) return isAdmin
        if (!it.perm) return true
        return hasPermission(it.perm)
      })
      .map((it) => ({
        id: `nav:${it.path}`,
        label: it.label,
        path: it.path,
        icon: it.icon,
        kind: 'nav',
        keywords: SYNONYMS[it.path] || '',
      }))
  }, [isAdmin, hasPermission])

  const allowedActions = useMemo(
    () => QUICK_ACTIONS
      .filter((a) => {
        if (isAdmin) return true
        if (!a.perm) return true
        const [mod, act] = a.perm
        return hasPermission(mod, act)
      })
      .map((a) => ({ ...a, kind: 'action' })),
    [isAdmin, hasPermission],
  )

  const allItems = useMemo(
    () => [
      ...allowedActions,
      ...navItems,
    ],
    [allowedActions, navItems],
  )

  // Live DB lookup for orders + customers — debounced so each keystroke
  // doesn't round-trip Supabase. Caps each bucket at 5 to keep the palette
  // tight. Results sit above the nav/action list when present.
  const [dbResults, setDbResults] = useState([])
  // Prev-prop sync — reset when palette closes or query too short. Using the
  // sync-state-during-render pattern to avoid react-hooks/set-state-in-effect.
  const queryKey = isOpen ? query.trim() : ''
  const [prevQK, setPrevQK] = useState(queryKey)
  if (prevQK !== queryKey) {
    setPrevQK(queryKey)
    if (queryKey.length < 2 && dbResults.length > 0) setDbResults([])
  }
  useEffect(() => {
    if (!isOpen) return
    const q = query.trim()
    if (q.length < 2) return
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const [ordRes, custRes] = await Promise.all([
          supabase.from('orders')
            .select('id, order_number, status, customers(firm_name)')
            .or(`order_number.ilike.%${q.replace(/[%,()]/g,' ')}%`)
            .order('created_at', { ascending: false })
            .limit(5),
          supabase.from('customers')
            .select('id, firm_name, contact_name, city')
            .or(`firm_name.ilike.%${q.replace(/[%,()]/g,' ')}%,contact_name.ilike.%${q.replace(/[%,()]/g,' ')}%`)
            .limit(5),
        ])
        if (cancelled) return
        const orders = (ordRes.data || []).map((o) => ({
          id: `order:${o.id}`,
          label: o.order_number || '(no number)',
          sublabel: o.customers?.firm_name || '',
          path: `/orders/${o.id}`,
          icon: FileText,
          kind: 'record',
          keywords: '',
        }))
        const custs = (custRes.data || []).map((c) => ({
          id: `cust:${c.id}`,
          label: c.firm_name || c.contact_name || '(unnamed)',
          sublabel: [c.contact_name, c.city].filter(Boolean).join(' · '),
          path: `/masters/customers?focus=${c.id}`,
          icon: User,
          kind: 'record',
          keywords: '',
        }))
        setDbResults([...orders, ...custs])
      } catch {
        if (!cancelled) setDbResults([])
      }
    }, 180)
    return () => { cancelled = true; clearTimeout(t) }
  }, [isOpen, query])

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems
    const terms = normalize(query).split(/\s+/).filter(Boolean)
    const staticHits = allItems.filter((it) => {
      const hay = `${normalize(it.label)} ${normalize(it.path)} ${normalize(it.keywords)}`
      return terms.every((t) => hay.includes(t))
    })
    return [...dbResults, ...staticHits]
  }, [query, allItems, dbResults])

  // Prev-prop sync — reset highlight when query changes. Mirrors the pattern
  // used in SearchSelect / DataTable so we don't trip react-hooks/set-state-in-effect.
  const [prevQuery, setPrevQuery] = useState(query)
  if (prevQuery !== query) {
    setPrevQuery(query)
    if (activeIdx !== 0) setActiveIdx(0)
  }

  const handleKey = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = filtered[activeIdx]
      if (hit) navigate(hit.path)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-24">
      <div
        className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <Search size={18} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Jump to… or type to search (try: new order, gst, customer)"
            className="flex-1 outline-none text-[14px] bg-transparent placeholder:text-slate-400"
          />
          <kbd className="text-[10px] font-mono text-slate-400 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
            ESC
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-auto">
          {filtered.length === 0 ? (
            <div className="px-6 py-10 text-center text-[13px] text-slate-400">
              No matches for "{query}"
            </div>
          ) : (
            filtered.map((it, idx) => {
              const Icon = it.icon
              const isActive = idx === activeIdx
              return (
                <button
                  key={it.id}
                  type="button"
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => navigate(it.path)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    isActive ? 'bg-indigo-50' : 'hover:bg-slate-50'
                  }`}
                >
                  {Icon && (
                    <Icon
                      size={16}
                      className={`shrink-0 ${
                        it.kind === 'action'
                          ? 'text-indigo-500'
                          : it.kind === 'record'
                          ? 'text-emerald-500'
                          : 'text-slate-400'
                      }`}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className={`text-[13px] font-medium truncate ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>
                      {it.label}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{it.sublabel || it.path}</div>
                  </div>
                  {isActive && <ArrowRight size={14} className="text-indigo-500 shrink-0" />}
                </button>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-100 text-[10px] text-slate-400 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="font-mono">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="font-mono">↵</kbd> open</span>
            <span className="flex items-center gap-1"><kbd className="font-mono">ESC</kbd> close</span>
          </div>
          <div className="flex items-center gap-1">
            <Command size={10} /> K anywhere
          </div>
        </div>
      </div>
    </div>
  )
}
