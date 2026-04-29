/**
 * CheckoutDrawer — split tender + output picker, calls posDb.createSale.
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §6
 * Plan: docs/specs/2026-04-28-pos-system-plan.md §Phase 7
 */

import { useState, useMemo, useEffect } from 'react'
import { Modal, Button } from '../../../components/ui'
import { Banknote, Smartphone, CreditCard, Wallet, Plus, X } from 'lucide-react'
import { validateTenders } from '../lib/tenderRules'
import { createSale } from '../lib/posDb'

const TENDER_TYPES = [
  { key: 'cash', label: 'Cash', icon: Banknote, color: 'emerald' },
  { key: 'upi', label: 'UPI', icon: Smartphone, color: 'indigo' },
  { key: 'card', label: 'Card', icon: CreditCard, color: 'sky' },
  { key: 'account', label: 'On account', icon: Wallet, color: 'amber' },
]

const DEFAULT_OUTPUTS = ['thermal']

export default function CheckoutDrawer({ open, onClose, cart, terminal, session, onSuccess }) {
  const { state, totals } = cart
  const billTotal = totals.grand_total_after_discount

  const [tenders, setTenders] = useState([])
  const [outputs, setOutputs] = useState(DEFAULT_OUTPUTS)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset on open / pre-fill single cash tender for the full amount
  useEffect(() => {
    if (open) {
      setTenders([{ tender_type: 'cash', amount: billTotal, reference: '' }])
      setOutputs(DEFAULT_OUTPUTS)
      setError('')
    }
  }, [open, billTotal])

  const validation = useMemo(() => validateTenders(tenders, billTotal, state.customer), [tenders, billTotal, state.customer])

  const addTender = (type) => setTenders(prev => [...prev, { tender_type: type, amount: 0, reference: '' }])
  const updateTender = (idx, patch) => setTenders(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t))
  const removeTender = (idx) => setTenders(prev => prev.filter((_, i) => i !== idx))

  const toggleOutput = (key) => setOutputs(prev => prev.includes(key) ? prev.filter(o => o !== key) : [...prev, key])

  const onConfirm = async () => {
    if (!validation.ok) {
      setError(validation.errors.join(' · '))
      return
    }
    if (!session) {
      setError('Open a drawer session first')
      return
    }
    setSubmitting(true)
    setError('')

    const idempotencyKey = crypto.randomUUID()

    const payload = {
      session_id: session.id,
      terminal_id: terminal.id,
      customer_id: state.customer?.id || null,
      warehouse_id: terminal.default_warehouse_id || null,
      doc_type: state.docType,
      held: false,
      hold_label: null,
      notes: state.notes || null,
      subtotal: totals.subtotal,
      cgst_amount: totals.cgst_amount,
      sgst_amount: totals.sgst_amount,
      igst_amount: totals.igst_amount,
      total_tax: totals.total_tax,
      grand_total: totals.grand_total_after_discount,
      lines: totals.lines.map((l, i) => ({
        product_id: l.product_id,
        description: l.description,
        qty: l.qty,
        unit: l.unit,
        rate: l.rate,
        discount_pct: l.discount_pct,
        discount_amt: l.discount_amt,
        hsn_code: l.hsn_code,
        gst_rate: l.gst_rate,
        taxable_amount: l.taxable_amount,
        cgst_amount: l.cgst_amount,
        sgst_amount: l.sgst_amount,
        igst_amount: l.igst_amount,
        line_total: l.line_total,
        sort_order: i,
      })),
      tenders: tenders.map(t => ({
        tender_type: t.tender_type,
        amount: Number(t.amount),
        reference: t.reference || null,
      })),
      outputs,
      print_payload: {
        // Front-end-derived snapshot for the print-bridge (Phase 10)
        customer_label: state.customer?.firm_name || 'Walk-in',
        line_count: totals.lines.length,
      },
    }

    const { data: invoiceId, error: rpcError } = await createSale(payload, idempotencyKey)
    setSubmitting(false)
    if (rpcError) {
      setError(String(rpcError.message || rpcError))
      return
    }
    onSuccess?.(invoiceId)
  }

  return (
    <Modal isOpen={open} onClose={onClose} title="Checkout" size="lg">
      <div className="grid grid-cols-2 gap-6">
        {/* LEFT — tenders */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-[12px] font-semibold text-slate-700">Tenders</div>
            <div className="flex items-center gap-1">
              {TENDER_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => addTender(t.key)}
                  disabled={t.key === 'account' && !state.customer?.id}
                  className="text-[10px] px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-600 inline-flex items-center gap-1 disabled:opacity-30"
                  title={t.key === 'account' && !state.customer?.id ? 'Walk-in cannot be billed on-account' : ''}
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
                  <input
                    type="number"
                    value={t.amount}
                    onChange={e => updateTender(idx, { amount: parseFloat(e.target.value) || 0 })}
                    placeholder="₹"
                    step="0.01"
                    className="flex-1 px-2 py-1 text-[12px] border border-slate-200 rounded"
                  />
                  {(t.tender_type === 'upi' || t.tender_type === 'card') && (
                    <input
                      type="text"
                      value={t.reference}
                      onChange={e => updateTender(idx, { reference: e.target.value })}
                      placeholder={t.tender_type === 'upi' ? 'UPI ref' : 'Last 4'}
                      className="w-24 px-2 py-1 text-[11px] border border-slate-200 rounded"
                    />
                  )}
                  <button onClick={() => removeTender(idx)} className="p-1 text-slate-300 hover:text-red-500">
                    <X size={12} />
                  </button>
                </div>
              )
            })}
            {tenders.length === 0 && <div className="text-[11px] text-slate-400 italic py-3 text-center">Pick a tender above</div>}
          </div>

          <div className="mt-3 p-2 bg-white border border-slate-200 rounded-lg text-[11px] space-y-0.5">
            <div className="flex items-center justify-between text-slate-500"><span>Bill total</span><span>₹{Number(billTotal).toFixed(2)}</span></div>
            <div className="flex items-center justify-between text-slate-500"><span>Tendered</span><span>₹{validation.paidTotal.toFixed(2)}</span></div>
            <div className={`flex items-center justify-between font-semibold ${Math.abs(validation.delta) < 0.01 ? 'text-emerald-600' : validation.delta < 0 ? 'text-red-600' : 'text-amber-600'}`}>
              <span>{validation.delta < 0 ? 'Short' : validation.delta > 0 ? 'Over' : 'OK'}</span>
              <span>₹{Math.abs(validation.delta).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* RIGHT — outputs + confirm */}
        <div>
          <div className="text-[12px] font-semibold text-slate-700 mb-2">Send / print</div>
          <div className="space-y-1.5">
            <OutputBox checked={outputs.includes('thermal')} onChange={() => toggleOutput('thermal')} label="Thermal 80mm receipt" sub="USB printer at counter" />
            <OutputBox checked={outputs.includes('a4')} onChange={() => toggleOutput('a4')} label="A4 GST tax invoice" sub="PDF + browser print" />
            <OutputBox
              checked={outputs.includes('whatsapp')}
              onChange={() => toggleOutput('whatsapp')}
              label="WhatsApp link"
              sub={state.customer?.phone ? `→ ${state.customer.phone}` : 'requires customer phone'}
              disabled={!state.customer?.phone}
            />
            <OutputBox
              checked={outputs.includes('email')}
              onChange={() => toggleOutput('email')}
              label="Email PDF"
              sub={state.customer?.email ? `→ ${state.customer.email}` : 'requires customer email'}
              disabled={!state.customer?.email}
            />
          </div>

          <div className="mt-4 p-3 bg-slate-50 rounded-lg text-[11px] space-y-1">
            <div className="flex items-center justify-between text-slate-500"><span>Doc type</span><span className="font-semibold">{state.docType === 'tax_invoice' ? 'Tax Invoice' : 'Bill of Supply'}</span></div>
            <div className="flex items-center justify-between text-slate-500"><span>Customer</span><span className="font-semibold">{state.customer?.firm_name || 'Walk-in'}</span></div>
            <div className="flex items-center justify-between text-slate-500"><span>Lines</span><span className="font-semibold">{totals.lines.length}</span></div>
          </div>

          {error && <div className="mt-3 text-[11px] text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">{error}</div>}
          {!validation.ok && tenders.length > 0 && !error && (
            <div className="mt-3 text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5">{validation.errors[0]}</div>
          )}

          <div className="mt-4 flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="md" onClick={onConfirm} loading={submitting} disabled={!validation.ok || tenders.length === 0}>
              Confirm ₹{Number(billTotal).toFixed(2)}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function OutputBox({ checked, onChange, label, sub, disabled }) {
  return (
    <label className={`flex items-start gap-2 p-2 rounded-lg border ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-slate-50'} ${checked ? 'bg-indigo-50/50 border-indigo-200' : 'bg-white border-slate-100'}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="mt-0.5 rounded text-indigo-600" />
      <div className="flex-1">
        <div className="text-[12px] font-semibold text-slate-700">{label}</div>
        <div className="text-[10px] text-slate-400">{sub}</div>
      </div>
    </label>
  )
}
