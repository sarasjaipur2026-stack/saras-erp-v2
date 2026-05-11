/**
 * <OverviewTab> — first tab of OrderDetailV2.
 *
 * Phase 7 fills this with the editable-via-legacy line items table + charges
 * breakdown. The data is already loaded by useOrderDetail (one fat select)
 * so this tab does zero extra fetches.
 *
 * "Editable inline" lands later — for now the user clicks the Edit button in
 * DetailHeader (Cmd/Ctrl+E shortcut) to drop into the legacy OrderForm.
 */

import { Currency, StatusBadge, Badge } from '../../../components/ui'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
const fmtNum = (n, frac = 2) => Number.isFinite(Number(n))
  ? Number(n).toLocaleString('en-IN', { minimumFractionDigits: frac, maximumFractionDigits: frac })
  : '—'

/**
 * @param {object} props
 * @param {object} props.order
 * @param {object} props.summary  — { advance, grand, balance, lineCount }
 */
export default function OverviewTab({ order, summary }) {
  if (!order) return null
  const c = order.customers || {}
  const otype = order.order_types?.name
  const pt = order.payment_terms?.name
  const broker = order.brokers?.name

  const lines = Array.isArray(order.order_line_items) ? order.order_line_items : []
  const charges = Array.isArray(order.order_charges) ? order.order_charges : []

  // Compute the subtotal across line items + sum of charges. Use net_amount
  // when present, falling back to amount, falling back to qty × rate.
  const subtotal = lines.reduce((acc, li) => {
    const amt = Number(li.net_amount ?? li.amount ?? (Number(li.total_qty || 0) * Number(li.rate_per_unit || 0))) || 0
    return acc + amt
  }, 0)
  const chargesTotal = charges.reduce((acc, ch) => acc + (Number(ch.amount) || 0), 0)
  const totalGst = lines.reduce((acc, li) => {
    const gstRate = Number(li.gst_rate) || 0
    const base = Number(li.net_amount ?? li.amount ?? 0) || 0
    return acc + (base * gstRate) / 100
  }, 0)

  return (
    <div className="space-y-5">
      {/* Customer + meta */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Customer</h2>
          <div className="mt-1.5 text-[14px] font-semibold text-slate-900">{c.firm_name || c.contact_name || '—'}</div>
          {c.firm_name && c.contact_name && c.contact_name !== c.firm_name && (
            <div className="text-[12px] text-slate-500">{c.contact_name}</div>
          )}
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            {c.phone && (<><dt className="text-slate-500">Phone</dt><dd className="text-right">{c.phone}</dd></>)}
            {c.email && (<><dt className="text-slate-500">Email</dt><dd className="text-right truncate">{c.email}</dd></>)}
            {c.gstin && (<><dt className="text-slate-500">GSTIN</dt><dd className="text-right font-mono">{c.gstin}</dd></>)}
            {c.state_code && (<><dt className="text-slate-500">State</dt><dd className="text-right font-mono">{c.state_code}</dd></>)}
          </dl>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Order</h2>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={order.status} />
            {order.priority && order.priority !== 'Normal' && (
              <Badge variant={order.priority === 'High' ? 'danger' : 'warning'}>{order.priority}</Badge>
            )}
            {order.nature && order.nature !== 'regular' && (
              <Badge variant="default">{order.nature}</Badge>
            )}
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[12px]">
            {otype && (<><dt className="text-slate-500">Type</dt><dd className="text-right">{otype}</dd></>)}
            {pt && (<><dt className="text-slate-500">Payment terms</dt><dd className="text-right">{pt}</dd></>)}
            {broker && (<><dt className="text-slate-500">Broker</dt><dd className="text-right">{broker}</dd></>)}
            {order.gst_type && (<><dt className="text-slate-500">GST</dt><dd className="text-right">{order.gst_type === 'intra_state' ? 'CGST + SGST' : 'IGST'}</dd></>)}
            <dt className="text-slate-500">Delivery</dt>
            <dd className="text-right">{fmtDate(order.delivery_date_1)}</dd>
            <dt className="text-slate-500">Created</dt>
            <dd className="text-right">{fmtDate(order.created_at)}</dd>
          </dl>
        </div>
      </section>

      {/* Line items */}
      <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Line items</h2>
          <span className="text-[11px] text-slate-500">{lines.length} item{lines.length === 1 ? '' : 's'}</span>
        </div>
        {lines.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-slate-400">No line items yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 text-left">#</th>
                  <th className="px-4 py-2 text-left">Product</th>
                  <th className="px-4 py-2 text-right">Qty</th>
                  <th className="px-4 py-2 text-right">Rate</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-right">GST %</th>
                  <th className="px-4 py-2 text-right">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {lines.map((li, idx) => {
                  const qty = Number(li.total_qty ?? li.meters ?? li.weight_kg) || 0
                  const rate = Number(li.rate_per_unit) || 0
                  const amt = Number(li.amount ?? (qty * rate)) || 0
                  const net = Number(li.net_amount ?? amt) || 0
                  const productName = li.products?.name || li.product_name || '—'
                  const hsn = li.hsn_code ? ` · HSN ${li.hsn_code}` : ''
                  return (
                    <tr key={li.id || idx}>
                      <td className="px-4 py-2 text-slate-400 tabular-nums">{li.sort_order || idx + 1}</td>
                      <td className="px-4 py-2 text-slate-900">
                        <div className="font-medium">{productName}</div>
                        {(li.instructions || hsn) && (
                          <div className="text-[10px] text-slate-500">
                            {li.instructions || ''}{hsn}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtNum(qty, 3)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtNum(rate)}</td>
                      <td className="px-4 py-2 text-right tabular-nums"><Currency amount={amt} /></td>
                      <td className="px-4 py-2 text-right text-slate-500 tabular-nums">{fmtNum(li.gst_rate, 0)}%</td>
                      <td className="px-4 py-2 text-right font-semibold tabular-nums"><Currency amount={net} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Charges */}
      {charges.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Charges</h2>
            <span className="text-[11px] text-slate-500">{charges.length}</span>
          </div>
          <table className="w-full text-[12px]">
            <tbody className="divide-y divide-slate-50">
              {charges.map((ch, idx) => (
                <tr key={ch.id || idx}>
                  <td className="px-4 py-2 text-slate-700">{ch.charge_types?.name || ch.name || 'Charge'}</td>
                  <td className="px-4 py-2 text-right tabular-nums"><Currency amount={Number(ch.amount) || 0} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Pricing */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Pricing</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-slate-500">Subtotal (lines)</dt>
          <dd className="text-right tabular-nums"><Currency amount={subtotal} /></dd>
          {chargesTotal > 0 && (
            <>
              <dt className="text-slate-500">Charges</dt>
              <dd className="text-right tabular-nums"><Currency amount={chargesTotal} /></dd>
            </>
          )}
          {totalGst > 0 && (
            <>
              <dt className="text-slate-500">GST</dt>
              <dd className="text-right tabular-nums"><Currency amount={totalGst} /></dd>
            </>
          )}
          <dt className="text-slate-700 font-semibold border-t border-slate-100 pt-1.5">Total</dt>
          <dd className="text-right font-bold text-slate-900 border-t border-slate-100 pt-1.5"><Currency amount={summary?.grand || 0} /></dd>
          <dt className="text-slate-500">Advance paid</dt>
          <dd className="text-right text-emerald-700 tabular-nums"><Currency amount={summary?.advance || 0} /></dd>
          <dt className="text-slate-500">Balance due</dt>
          <dd className={`text-right font-semibold tabular-nums ${(summary?.balance || 0) > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
            {(summary?.balance || 0) > 0 ? <Currency amount={summary.balance} /> : '—'}
          </dd>
        </dl>
      </section>

      {/* Notes */}
      {order.notes && (
        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Notes</h2>
          <p className="mt-2 text-[13px] text-slate-700 whitespace-pre-wrap">{order.notes}</p>
        </section>
      )}
    </div>
  )
}
