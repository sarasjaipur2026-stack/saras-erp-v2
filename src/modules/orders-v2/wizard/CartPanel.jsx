/**
 * <CartPanel> — right-rail cart view for the wizard.
 *
 * Mirrors POS BillPanel's idea but adapted for orders:
 *   - each line shows product · qty (with -/+ steppers) · rate · disc · GST
 *   - tap the line to toggle the expanded editor (rate + disc + GST inline)
 *   - remove button per line
 *   - totals at bottom
 */

import { useState } from 'react'
import { Trash2, Minus, Plus, ChevronDown } from 'lucide-react'
import { Currency } from '../../../components/ui'
import { computeLineNet } from '../hooks/_wizardMath'

/**
 * @param {object} props
 * @param {Array} props.lines
 * @param {Array} props.products
 * @param {object} props.totals  — from useOrderWizard
 * @param {(idx: number, patch: object) => void} props.onPatchLine
 * @param {(idx: number) => void} props.onRemoveLine
 */
export default function CartPanel({ lines, products, totals, onPatchLine, onRemoveLine }) {
  const productsById = new Map((products || []).map((p) => [p.id, p]))
  const activeLines = lines.filter((l) => l.productId)

  return (
    <aside className="flex flex-col h-full">
      <div className="px-1 mb-2 flex items-center justify-between">
        <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">
          Cart
        </h2>
        <span className="text-[10px] text-slate-400">{activeLines.length} {activeLines.length === 1 ? 'line' : 'lines'}</span>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {activeLines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white/50 p-6 text-center">
            <div className="text-[12px] font-semibold text-slate-700">Empty cart</div>
            <p className="mt-1 text-[11px] text-slate-500 leading-snug">
              Tap a product tile to add it. Tap again to add more.
            </p>
          </div>
        ) : (
          activeLines.map((line) => {
            const realIdx = lines.indexOf(line)
            const product = productsById.get(line.productId)
            return (
              <CartLine
                key={realIdx}
                idx={realIdx}
                line={line}
                productName={product?.name || '—'}
                productCode={product?.code || ''}
                onPatch={(p) => onPatchLine(realIdx, p)}
                onRemove={() => onRemoveLine(realIdx)}
              />
            )
          })
        )}
      </div>

      {/* Totals */}
      <div className="mt-3 shrink-0 rounded-xl border border-slate-200 bg-white p-3">
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
          <dt className="text-slate-500">Subtotal</dt>
          <dd className="text-right tabular-nums"><Currency amount={totals.subtotal} /></dd>
          {totals.discount > 0 && (
            <>
              <dt className="text-slate-500">Discount</dt>
              <dd className="text-right text-amber-700 tabular-nums">−<Currency amount={totals.discount} /></dd>
            </>
          )}
          <dt className="text-slate-500">GST</dt>
          <dd className="text-right tabular-nums"><Currency amount={totals.gst} /></dd>
          {totals.charges > 0 && (
            <>
              <dt className="text-slate-500">Charges</dt>
              <dd className="text-right tabular-nums"><Currency amount={totals.charges} /></dd>
            </>
          )}
          <dt className="text-slate-700 font-semibold border-t border-slate-100 pt-1.5">Total</dt>
          <dd className="text-right font-bold text-slate-900 border-t border-slate-100 pt-1.5 tabular-nums">
            <Currency amount={totals.grand} />
          </dd>
        </dl>
      </div>
    </aside>
  )
}

function CartLine({ idx, line, productName, productCode, onPatch, onRemove }) {
  const [expanded, setExpanded] = useState(false)
  const net = computeLineNet(line)
  const qty = Number(line.qty) || 0

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start gap-2 p-2">
        <span className="mt-1 text-[10px] font-mono font-bold text-slate-400 w-4 text-right shrink-0">
          {idx + 1}
        </span>
        <div className="flex-1 min-w-0">
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="w-full text-left"
          >
            <div className="text-[12px] font-semibold text-slate-800 leading-tight truncate">{productName}</div>
            <div className="text-[9px] text-slate-400 font-mono">{productCode}</div>
          </button>

          {/* Qty stepper + net */}
          <div className="mt-1.5 flex items-center justify-between">
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => onPatch({ qty: Math.max(0, qty - 1) })}
                className="rounded-md p-1 hover:bg-white text-slate-600"
                aria-label="Decrease qty"
              >
                <Minus size={11} />
              </button>
              <input
                type="number"
                value={line.qty}
                onChange={(e) => onPatch({ qty: e.target.value })}
                onClick={(e) => e.stopPropagation()}
                className="w-12 bg-transparent text-center text-[12px] font-semibold tabular-nums focus:outline-none"
                min="0"
                step="any"
              />
              <button
                type="button"
                onClick={() => onPatch({ qty: qty + 1 })}
                className="rounded-md p-1 hover:bg-white text-slate-600"
                aria-label="Increase qty"
              >
                <Plus size={11} />
              </button>
            </div>
            <span className="text-[12px] font-semibold text-slate-900 tabular-nums">
              <Currency amount={net.net} />
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
            aria-label="Remove line"
            title="Remove line"
          >
            <Trash2 size={12} />
          </button>
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 transition"
            aria-label={expanded ? 'Collapse' : 'Edit rate / disc / GST'}
            title={expanded ? 'Collapse' : 'Edit rate / disc / GST'}
          >
            <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-100 px-2 pb-2 pt-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            <LabeledMini label="Rate">
              <input
                type="number"
                value={line.rate}
                onChange={(e) => onPatch({ rate: e.target.value })}
                placeholder="0.00"
                className="w-full bg-slate-50 rounded px-1.5 py-1 text-[12px] tabular-nums focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400"
              />
            </LabeledMini>
            <LabeledMini label="Disc %">
              <input
                type="number"
                value={line.discountPct}
                onChange={(e) => onPatch({ discountPct: e.target.value })}
                placeholder="0"
                className="w-full bg-slate-50 rounded px-1.5 py-1 text-[12px] tabular-nums focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400"
              />
            </LabeledMini>
            <LabeledMini label="GST %">
              <input
                type="number"
                value={line.gstRate}
                onChange={(e) => onPatch({ gstRate: e.target.value })}
                placeholder="18"
                className="w-full bg-slate-50 rounded px-1.5 py-1 text-[12px] tabular-nums focus:outline-none focus:bg-white focus:ring-1 focus:ring-indigo-400"
              />
            </LabeledMini>
          </div>
          {net.discount > 0 && (
            <div className="mt-1 text-right text-[10px] text-amber-700 tabular-nums">
              −<Currency amount={net.discount} /> discount applied
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LabeledMini({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[9px] uppercase tracking-wider text-slate-400 mb-0.5">{label}</span>
      {children}
    </label>
  )
}
