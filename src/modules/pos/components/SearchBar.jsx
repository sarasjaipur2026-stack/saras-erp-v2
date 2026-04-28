/**
 * SearchBar — typeahead for products by code/name/HSN.
 * Press Enter to add the top result. Esc clears.
 */

import { useState, useRef, useMemo, useEffect } from 'react'
import { Search } from 'lucide-react'

export default function SearchBar({ products, onAdd, autoFocus = true }) {
  const inputRef = useRef(null)
  const [q, setQ] = useState('')
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
    const handler = (e) => {
      if (e.key === 'F1' || (e.key === '/' && !e.target.matches?.('input, textarea'))) {
        e.preventDefault()
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [autoFocus])

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (!term) return []
    return products.filter(p =>
      (p.code || '').toLowerCase().includes(term) ||
      (p.name || '').toLowerCase().includes(term) ||
      (p.hsn_code || '').toLowerCase().includes(term)
    ).slice(0, 8)
  }, [q, products])

  const submit = () => {
    if (matches[0]) {
      onAdd(matches[0])
      setQ('')
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit() }
    if (e.key === 'Escape') { setQ('') }
  }

  return (
    <div className="relative w-72">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        ref={inputRef}
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={onKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search code · name · HSN  (F1)"
        className="w-full pl-9 pr-3 py-2 text-[13px] bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
      />
      {focused && matches.length > 0 && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-lg z-50 max-h-72 overflow-y-auto">
          {matches.map((p) => (
            <button
              key={p.id}
              onMouseDown={(e) => { e.preventDefault(); onAdd(p); setQ('') }}
              className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0"
            >
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold text-slate-700">{p.name}</div>
                <div className="text-[12px] font-bold text-indigo-600">₹{Number(p.default_rate || 0).toFixed(0)}</div>
              </div>
              <div className="text-[10px] text-slate-400 font-mono">{p.code} · HSN {p.hsn_code || '—'}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
