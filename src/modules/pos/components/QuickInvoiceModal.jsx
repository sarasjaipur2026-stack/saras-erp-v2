/**
 * QuickInvoiceModal — Mode C: skip the production/dispatch wizard for
 * trading-mode orders. Opens from OrderDetail's "Quick Invoice" button.
 *
 * Loads order_line_items, builds the same payload pos_create_sale expects,
 * lets cashier pick tender + outputs, fires the RPC. Resulting invoice has
 * source='pos' and is linked to the order via the customer ledger.
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §4.1 (Mode C)
 * Plan: docs/specs/2026-04-28-pos-system-plan.md §Phase 11
 */

import { useEffect, useState, useMemo } from 'react'
import { Modal, Button } from '../../../components/ui'
import { Banknote, Smartphone, CreditCard, Wallet, Plus, X, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { createSale, defaultTerminal, currentSession } from '../lib/posDb'
import { computeCartGst } from '../lib/gstSplit'
import { validateTenders } from '../lib/tenderRules'

const TENDER_TYPES = [
  { key: 'cash', label: 'Cash', icon: Banknote },
  { key: 'upi', label: 'UPI', icon: Smartphone },
  { key: 'card', label: 'Card', icon: CreditCard },
  { key: 'account', label: 'On account', icon: Wallet },
]

export default function QuickInvoiceModal({ open, onClose, order, customer, onSuccess }) {
  const [loading, setLoading] = useState(false)
  const [lines, setLines] = useState([])
  const [terminal, setTerminal] = useState(null)
  const [session, setSession] = useState(null)
  const [tenders, setTenders] = useState([])
  const [outputs, setOutputs] = useState(['a4'])  // A4 invoice default for order-driven Mode C
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Hydrate when modal opens
  useEffect(() => {
    if (!open || !order?.id) return
    let alive = true
    setLoading(true)
    setError('')
    ;(async () => {
      const { data: items, error: liErr } = await supabase
        .from('order_line_items')
        .select('*, products(code,name,hsn_code,gst_rate)')
        .eq('order_id', order.id)
      if (!alive) return
      if (liErr) { setError(liErr.message); setLoading(false); return }
      // Map order line items to POS line shape
      const cartLines = (items || []).map((li, i) => ({
        id: li.id,
        product_id: li.product_id,
        description: li.products?.name || 'Item',
        qty: Number(li.meters || li.weight_kg || 0),
        unit: li.products?.rate_unit === 'per_kg' ? 'kg' : 'm',
        rate: Number(li.rate_per_unit || 0),
        gst_rate: Number(li.products?.gst_rate || 0),
        hsn_code: li.products?.hsn_code || '',
        discount_pct: 0,
        discount_amt: 0,
        sort_order: i,
      }))
      setLines(cartLines)

      const { data: t } = await defaultTerminal()
      if (!alive) return
      setTerminal(t)
      if (t) {
        const { data: s } = await currentSession(t.id)
        if (alive) setSession(s)
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [open, order?.id])

  const totals = useMemo(() => computeCartGst(lines, customer?.state_code), [lines, customer])
  const billTotal = totals.grand_total

  // Pre-fill default tender = full bill total in cash
  useEffect(() => {
    if (open && lines.length > 0) {
      setTenders([{ tender_type: 'cash', amount: billTotal, reference: '' }])
    }
  }, [open, lines.length, billTotal])

  const validation = useMemo(() => validateTenders(tenders, billTotal, customer), [tenders, billTotal, customer])

  const addTender = (type) => setTenders(prev => [...prev, { tender_type: type, amount: 0, reference: '' }])
  const updateTender = (idx, patch) => setTenders(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
  const removeTender = (idx) => setTenders(prev => prev.filter((_, i) => i !== idx))
  const toggleOutput = (k) => setOutputs(prev => prev.includes(k) ? prev.filter(o => o !== k) : [...prev, k])

  const onConfirm = async () => {
    if (!validation.ok) { setError(validation.errors.join(' · ')); return }
    if (!session) { setError('Open a POS drawer session first'); return }

    setSubmitting(true)
    setError('')
    const idem = crypto.randomUUID()

    const payload = {
      session_id: session.id,
      terminal_id: terminal?.id,
      customer_id: customer?.id || null,
      warehouse_id: terminal?.default_warehouse_id || null,
      doc_type: 'tax_invoice',
      held: false,
      hold_label: null,
      notes: `Quick invoice from order ${order.order_number || order.id}`,
      subtotal: totals.subtotal,
      cgst_amount: totals.cgst_amount,
      sgst_amount: totals.sgst_amount,
      igst_amount: totals.igst_amount,
      total_tax: totals.total_tax,
      grand_total: totals.grand_total,
      lines: totals.lines.map((l, i) => ({
        product_id: l.product_id,
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        rate: l.rate,
        discount_pct: 0,
        discount_amt: 0,
        hsn_code: l.hsn_code,
        gst_rate: l.gst_rate,
        taxable_amount: l.taxable_amount,
        cgst_amount: l.cgst_amount,
        sgst_amount: l.sgst_amount,
        igst_amount: l.igst_amount,
        line_total: l.line_total,
        sort_order: i,
      })),
      tenders: tenders.map(t => ({ tender_type: t.tender_type, amount: Number(t.amount), reference: t.reference || null })),
      outputs,
      print_payload: { source: 'order', order_id: order.id, order_number: order.order_number },
    }

    const { data: invoiceId, error: rpcErr } = await createSale(payload, idem)
    setSubmitting(false)
    if (rpcErr) { setError(String(rpcErr.message || rpcErr)); return }
    onSuccess?.(invoiceId)
  }

  return (
    <Modal isOpen={open} onClose={onClose} title={`Quick Invoice — ${order?.order_number || ''}`} size="lg">
      {loading ? (
        <div className="py-12 text-center text-slate-400"><Loader2 className="inline animate-spin mr-2" /> Loading order…</div>
      ) : (
        <div className="grid grid-cols-2 gap-6">
          {/* LEFT — order summary */}
          <div>
            <div className="text-[12px] font-semibold text-slate-700 mb-2">Order lines ({lines.length})</div>
            <div className="bg-slate-50 rounded-lg p-2 space-y-1 max-h-72 overflow-y-auto">
              {totals.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-[11px]">
                  <div className="flex-1 truncate">{l.description}</div>
                  <div className="text-slate-500">{Number(l.qty).toFixed(2)}{l.unit} × ₹{Number(l.rate).toFixed(0)}</div>
                  <div className="font-semibold w-20 text-right">₹{Number(l.line_total).toFixed(2)}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 p-2 bg-white border border-slate-200 rounded-lg text-[11px] space-y-0.5">
              <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>₹{totals.subtotal.toFixed(2)}</span></div>
              {totals.interState
                ? <div className="flex justify-between text-slate-500"><span>IGST</span><span>₹{totals.igst_amount.toFixed(2)}</span></div>
                : <>
                    <div className="flex justify-between text-slate-500"><span>CGST</span><span>₹{totals.cgst_amount.toFixed(2)}</span></div>
                    <div className="flex justify-between text-slate-500"><span>SGST</span><span>₹{totals.sgst_amount.toFixed(2)}</span></div>
                  </>}
              <div className="flex justify-between font-bold text-slate-800 pt-1 mt-1 border-t border-slate-200">
                <span>Total</span><span>₹{totals.grand_total.toFixed(2)}</span>
              </div>
            </div>
            <div className="mt-3 text-[10px] text-slate-400">
              Customer: <b>{customer?.firm_name || 'Walk-in'}</b>{customer?.state_code && ` · State ${customer.state_code}`}
            </div>
          </div>

          {/* RIGHT — tenders + outputs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] font-semibold text-slate-700">Tenders</div>
              <div className="flex items-center gap-1">
                {TENDER_TYPES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => addTender(t.key)}
                    disabled={t.key === 'account' && !customer?.id}
                    className="text-[10px] px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 inline-flex items-center gap-1 disabled:opacity-30"
                  >
                    <Plus size={10} /> {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              {tenders.map((t, idx) => {
                const meta = TENDER_TYPES.find(x => x.key === t.tender_type)
                const Icon = meta?.icon || Wallet
                return (
                  <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2">
                    <Icon size={14} className="text-slate-500" />
                    <span className="text-[11px] font-semibold text-slate-700 w-16">{meta?.label}</span>
                    <input type="number" value={t.amount} onChange={e => updateTender(idx, { amount: parseFloat(e.target.value) || 0 })} className="flex-1 px-2 py-1 text-[12px] border border-slate-200 rounded" />
                    <button onClick={() => removeTender(idx)} className="p-1 text-slate-300 hover:text-red-500"><X size={12} /></button>
                  </div>
                )
              })}
            </div>

            <div className="mt-3 text-[12px] font-semibold text-slate-700">Send / print</div>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {['thermal','a4','whatsapp','email'].map(k => (
                <label key={k} className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] border cursor-pointer ${outputs.includes(k) ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-500'}`}>
                  <input type="checkbox" checked={outputs.includes(k)} onChange={() => toggleOutput(k)} className="rounded" />
                  {k}
                </label>
              ))}
            </div>

            {error && <div className="mt-3 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{error}</div>}
            {!validation.ok && tenders.length > 0 && !error && (
              <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">{validation.errors[0]}</div>
            )}

            {!session && !loading && (
              <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">No POS drawer open — open one from /pos/session first.</div>
            )}

            <div className="mt-4 flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
              <Button onClick={onConfirm} loading={submitting} disabled={!validation.ok || tenders.length === 0 || !session}>
                Confirm ₹{billTotal.toFixed(2)}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}
