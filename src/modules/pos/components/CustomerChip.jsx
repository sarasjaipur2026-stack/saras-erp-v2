/**
 * CustomerChip — pill showing current customer (or Walk-in).
 * Click → modal with searchable customer list. F2 opens directly.
 */

import { useState, useEffect, useMemo } from 'react'
import { Modal, Input } from '../../../components/ui'
import { User } from 'lucide-react'

export default function CustomerChip({ customer, customers, onChange }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2' && !e.target.matches?.('input, textarea, select')) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const matches = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = customers || []
    if (!term) return list.slice(0, 30)
    return list.filter(c =>
      (c.firm_name || '').toLowerCase().includes(term) ||
      (c.contact_name || '').toLowerCase().includes(term) ||
      (c.phone || '').includes(term) ||
      (c.gstin || '').toLowerCase().includes(term)
    ).slice(0, 30)
  }, [q, customers])

  const label = customer?.id ? (customer.firm_name || customer.contact_name) : 'Walk-in'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`px-3 py-2 rounded-xl text-[12px] font-semibold flex items-center gap-2 ${customer?.id ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' : 'bg-amber-50 text-amber-800 border border-amber-200'}`}
        title={customer?.id ? 'Click or F2 to change customer' : 'Walk-in cash sale · F2 to register'}
      >
        <User size={13} />
        {label}
        {!customer?.id && <span className="text-[9px] text-amber-700/70">(F2)</span>}
      </button>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Pick customer" size="md">
        <div className="space-y-3">
          <Input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search firm · contact · phone · GSTIN" />
          <div className="max-h-96 overflow-y-auto border border-slate-100 rounded-xl">
            <button
              onMouseDown={() => { onChange(null); setOpen(false); setQ('') }}
              className="w-full text-left px-3 py-2.5 hover:bg-amber-50 border-b border-slate-50 flex items-center justify-between"
            >
              <div>
                <div className="text-[12px] font-semibold text-amber-800">Walk-in</div>
                <div className="text-[10px] text-slate-400">No customer record · cash sale</div>
              </div>
              <span className="text-[10px] text-amber-700/60">default</span>
            </button>
            {matches.map((c) => (
              <button
                key={c.id}
                onMouseDown={() => { onChange(c); setOpen(false); setQ('') }}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0"
              >
                <div className="text-[12px] font-semibold text-slate-700">{c.firm_name || c.contact_name}</div>
                <div className="text-[10px] text-slate-400">{c.phone || '—'} · {c.gstin || 'no GSTIN'} · {c.state_code || '—'}</div>
              </button>
            ))}
            {matches.length === 0 && (
              <div className="text-center py-6 text-[12px] text-slate-400">No matches</div>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
