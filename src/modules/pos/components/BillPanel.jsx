/**
 * BillPanel — right-side cart panel.
 * Header: invoice draft #, customer chip, doc-type toggle.
 * Body: scrollable cart line items.
 * Footer: totals + tender buttons + CHARGE button.
 */

import BillLineItem from './BillLineItem'
import CustomerChip from './CustomerChip'
import DocTypeToggle from './DocTypeToggle'

export default function BillPanel({ cart, customers, stockByProductId, onCheckout, onHold, onCustomerChange, onDocTypeChange, onClear }) {
  const { state, totals, updateLine, removeLine } = cart
  const { lines } = totals
  const empty = lines.length === 0

  return (
    <div className="bg-white border-l border-slate-200 flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
        <CustomerChip customer={state.customer} customers={customers} onChange={onCustomerChange} />
        <DocTypeToggle value={state.docType} onChange={onDocTypeChange} customer={state.customer} />
      </div>

      {/* Lines */}
      <div className="flex-1 overflow-y-auto px-3">
        {empty ? (
          <div className="text-center py-12 text-slate-400 text-[12px]">
            <div className="text-3xl mb-2">🛒</div>
            Cart empty<br />
            <span className="text-[10px]">Search above or tap a tile</span>
          </div>
        ) : (
          lines.map(l => (
            <BillLineItem
              key={l.id}
              line={l}
              lineTotal={l.line_total}
              stockQty={stockByProductId.get(l.product_id)}
              onUpdate={updateLine}
              onRemove={removeLine}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 bg-slate-50 px-3 py-3">
        {!empty && (
          <>
            <div className="space-y-0.5">
              <Row label="Subtotal" value={totals.subtotal} />
              {totals.interState
                ? <Row label="IGST" value={totals.igst_amount} />
                : (
                  <>
                    <Row label="CGST" value={totals.cgst_amount} />
                    <Row label="SGST" value={totals.sgst_amount} />
                  </>
                )}
              {totals.bill_discount_amount > 0 && (
                <Row label="Bill discount" value={-totals.bill_discount_amount} className="text-emerald-600" />
              )}
            </div>
            <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-200 text-[16px] font-bold">
              <span>TOTAL</span>
              <span>₹{Number(totals.grand_total_after_discount).toFixed(2)}</span>
            </div>
          </>
        )}
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          <button disabled={empty} onClick={onHold} className="py-2 text-[11px] bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 font-semibold">Hold (F4)</button>
          <button disabled={empty} onClick={onClear} className="py-2 text-[11px] bg-white border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-50 font-semibold text-slate-500">Clear</button>
        </div>
        <button
          disabled={empty}
          onClick={onCheckout}
          className="w-full mt-2 py-3 text-[14px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-bold rounded-xl shadow-sm shadow-indigo-600/30"
        >
          CHARGE ₹{Number(totals.grand_total_after_discount || 0).toFixed(2)} → BILL  (F8)
        </button>
      </div>
    </div>
  )
}

function Row({ label, value, className = '' }) {
  return (
    <div className={`flex items-center justify-between text-[11px] text-slate-500 ${className}`}>
      <span>{label}</span>
      <span>₹{Number(value).toFixed(2)}</span>
    </div>
  )
}
