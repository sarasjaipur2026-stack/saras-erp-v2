/**
 * HoldRecallSheet — list held bills for current session, recall any.
 * Spec: docs/specs/2026-04-28-pos-system-design.md §6 (hold/recall)
 */

import { useEffect, useState } from 'react'
import { Modal, Button } from '../../../components/ui'
import { listHeldSales, recallSale } from '../lib/posDb'
import { fmtMoney, fmtDate } from '../../../lib/format'

export default function HoldRecallSheet({ open, onClose, sessionId, onRecall }) {
  const [bills, setBills] = useState([])
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!open || !sessionId) return
    let alive = true
    setLoading(true)
    setErr('')
    ;(async () => {
      const { data, error } = await listHeldSales(sessionId)
      if (!alive) return
      if (error) setErr(String(error.message || error))
      else setBills(data || [])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [open, sessionId])

  const recall = async (id) => {
    setLoading(true)
    const { data, error } = await recallSale(id)
    setLoading(false)
    if (error) { setErr(String(error.message || error)); return }
    if (!data) { setErr('Bill not found or no longer held'); return }
    onRecall(data)
    onClose()
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Held bills" size="md">
      {err && <div className="mb-3 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{err}</div>}

      {loading ? (
        <div className="py-8 text-center text-[12px] text-slate-400">Loading…</div>
      ) : bills.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-slate-400">No held bills in this session</div>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {bills.map(b => (
            <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 bg-slate-50 rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold text-slate-700 truncate">{b.hold_label || b.invoice_number}</div>
                <div className="text-[10px] text-slate-400">{b.invoice_number} · {fmtDate(b.created_at)}</div>
              </div>
              <div className="text-[12px] font-bold text-slate-700">{fmtMoney(b.grand_total)}</div>
              <Button size="xs" onClick={() => recall(b.id)}>Recall</Button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
