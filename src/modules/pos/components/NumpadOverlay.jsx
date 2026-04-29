/**
 * NumpadOverlay — touch-friendly numpad for tablet field-sales mode.
 * Pops up over a cart row's qty or rate input.
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §7
 */

import { useState, useEffect } from 'react'
import { Modal } from '../../../components/ui'

const KEYS = ['1','2','3','4','5','6','7','8','9','.','0','⌫']

export default function NumpadOverlay({ open, onClose, label, initialValue, onSubmit }) {
  const [val, setVal] = useState('')

  useEffect(() => {
    if (open) setVal(String(initialValue ?? ''))
  }, [open, initialValue])

  const tap = (k) => {
    if (k === '⌫') return setVal(v => v.slice(0, -1))
    if (k === '.' && val.includes('.')) return
    setVal(v => v + k)
  }

  const submit = () => {
    const n = parseFloat(val)
    if (Number.isFinite(n) && n >= 0) onSubmit(n)
    onClose()
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={label || 'Enter value'} size="sm">
      <div className="text-3xl font-bold text-center py-4 bg-slate-50 rounded-lg mb-3">
        {val || <span className="text-slate-300">0</span>}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map(k => (
          <button
            key={k}
            onClick={() => tap(k)}
            className="py-4 text-xl font-semibold bg-white border border-slate-200 rounded-xl hover:bg-slate-50 active:bg-slate-100"
          >
            {k}
          </button>
        ))}
      </div>
      <div className="flex gap-2 mt-3">
        <button onClick={() => setVal('')} className="flex-1 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-500 font-semibold hover:bg-slate-50">Clear</button>
        <button onClick={submit} className="flex-1 py-2.5 text-sm bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700">Set</button>
      </div>
    </Modal>
  )
}
