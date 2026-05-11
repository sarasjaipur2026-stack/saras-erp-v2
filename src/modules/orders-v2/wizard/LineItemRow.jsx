/**
 * <LineItemRow> — one line in the Order Wizard.
 *
 * Pure controlled component: receives the line + onPatch + onRemove from
 * the parent. Computes net inline so the user sees totals update as they
 * type.
 */

import { Trash2 } from 'lucide-react'
import { Currency, SearchSelect, Input } from '../../../components/ui'

/**
 * @param {object} props
 * @param {number} props.index
 * @param {{productId: string, qty: string|number, rate: string|number, gstRate: number}} props.line
 * @param {Array<{ id: string, name: string, code?: string, hsn_code?: string, gst_rate?: number }>} props.products
 * @param {(patch: object) => void} props.onPatch
 * @param {() => void} props.onRemove
 * @param {boolean} props.canRemove
 */
export default function LineItemRow({
  index, line, products, onPatch, onRemove, canRemove,
}) {
  const qty = Number(line.qty) || 0
  const rate = Number(line.rate) || 0
  const gross = qty * rate
  const discPct = Math.min(100, Math.max(0, Number(line.discountPct) || 0))
  const discAmt = (gross * discPct) / 100
  const taxable = gross - discAmt
  const gstAmt = (taxable * (Number(line.gstRate) || 0)) / 100
  const net = taxable + gstAmt

  const productOptions = (products || []).map((p) => ({
    value: p.id,
    label: p.code ? `${p.code} · ${p.name}` : p.name,
  }))

  const onProduct = (productId) => {
    // When the user picks a product, auto-fill gst_rate from the product
    // master if present (and the user hasn't already typed a custom rate).
    const product = (products || []).find((p) => p.id === productId)
    const patch = { productId }
    if (product && Number.isFinite(Number(product.gst_rate)) && !line.qty) {
      patch.gstRate = Number(product.gst_rate)
    }
    onPatch(patch)
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
          Line {index + 1}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
            title="Remove line"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
        <div className="md:col-span-5">
          <SearchSelect
            label="Product"
            required
            value={line.productId}
            options={productOptions}
            placeholder="Search product…"
            onChange={onProduct}
          />
        </div>
        <div className="md:col-span-1">
          <Input
            label="Qty"
            type="number"
            inputMode="decimal"
            value={line.qty}
            onChange={(e) => onPatch({ qty: e.target.value })}
            placeholder="0"
          />
        </div>
        <div className="md:col-span-2">
          <Input
            label="Rate"
            type="number"
            inputMode="decimal"
            value={line.rate}
            onChange={(e) => onPatch({ rate: e.target.value })}
            placeholder="0.00"
          />
        </div>
        <div className="md:col-span-1">
          <Input
            label="Disc %"
            type="number"
            inputMode="decimal"
            value={line.discountPct}
            onChange={(e) => onPatch({ discountPct: e.target.value })}
            placeholder="0"
          />
        </div>
        <div className="md:col-span-1">
          <Input
            label="GST %"
            type="number"
            inputMode="decimal"
            value={line.gstRate}
            onChange={(e) => onPatch({ gstRate: e.target.value })}
            placeholder="18"
          />
        </div>
        <div className="md:col-span-2 flex flex-col items-end justify-end">
          <span className="text-[11px] text-slate-400">Net</span>
          <span className="text-[14px] font-semibold text-slate-900 tabular-nums"><Currency amount={net} /></span>
          {discAmt > 0 && (
            <span className="text-[10px] text-amber-600 tabular-nums">−<Currency amount={discAmt} /> off</span>
          )}
        </div>
      </div>
    </div>
  )
}
