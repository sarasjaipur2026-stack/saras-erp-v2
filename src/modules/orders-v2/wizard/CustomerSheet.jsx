/**
 * <CustomerSheet> — customer picker for the Order Wizard, POS-style.
 *
 * Renders a chip showing the current customer (or "Pick customer" CTA).
 * Tap → modal with search + recent + tap-to-pick.
 *
 * F2 hotkey opens the picker — matches POS muscle memory.
 */

import { useEffect, useMemo, useState } from 'react'
import { User, X } from 'lucide-react'
import { Modal, Input } from '../../../components/ui'

/**
 * @param {object} props
 * @param {object|null} props.customer       — currently selected
 * @param {Array} props.customers            — master list from useApp
 * @param {(c: object|null) => void} props.onChange
 */
export default function CustomerSheet({ customer, customers, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  // F2 hotkey — same as POS
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'F2') return
      const tgt = e.target
      if (tgt && typeof tgt.matches === 'function') {
        if (tgt.matches('input, textarea, [contenteditable], [contenteditable="true"]')) return
      }
      e.preventDefault()
      setOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const matches = useMemo(() => {
    const list = (customers || []).filter((c) => c.active !== false)
    const term = q.trim().toLowerCase()
    if (!term) return list.slice(0, 40)
    return list.filter((c) =>
      (c.firm_name || '').toLowerCase().includes(term) ||
      (c.contact_person || '').toLowerCase().includes(term) ||
      (c.phone || '').includes(term) ||
      (c.gstin || '').toLowerCase().includes(term),
    ).slice(0, 40)
  }, [q, customers])

  const label = customer?.firm_name || customer?.contact_person || null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Click or press F2 to change customer"
        className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-[12px] font-semibold transition ${
          customer?.id
            ? 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
            : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
        }`}
      >
        <User size={13} />
        {label || 'Pick customer'}
        {!customer?.id && <span className="text-[9px] text-amber-700/70">F2</span>}
        {customer?.id && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onChange(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onChange(null)
              }
            }}
            className="rounded p-0.5 text-indigo-400 hover:bg-indigo-200 hover:text-indigo-700 cursor-pointer"
            title="Clear customer"
          >
            <X size={11} />
          </span>
        )}
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Pick customer" size="md">
        <div className="space-y-3">
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search firm · contact · phone · GSTIN"
          />
          <div className="max-h-96 overflow-y-auto border border-slate-100 rounded-xl">
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onMouseDown={() => {
                  onChange(c)
                  setOpen(false)
                  setQ('')
                }}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0"
              >
                <div className="text-[12px] font-semibold text-slate-700">
                  {c.firm_name || c.contact_person || 'Unnamed'}
                </div>
                <div className="text-[10px] text-slate-400">
                  {c.phone || '—'} · {c.gstin || 'no GSTIN'} · state {c.state_code || '—'}
                </div>
              </button>
            ))}
            {matches.length === 0 && (
              <div className="text-center py-6 text-[12px] text-slate-400">
                No matches for "{q}"
              </div>
            )}
          </div>
          <p className="text-[10px] text-slate-400 leading-snug text-center">
            Need to add a new customer? Go to <a href="/customers" className="text-indigo-600 hover:underline">Customers</a> first.
            Inline creation lands in a follow-up.
          </p>
        </div>
      </Modal>
    </>
  )
}
