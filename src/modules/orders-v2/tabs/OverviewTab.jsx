/**
 * <OverviewTab> — first tab of OrderDetailV2.
 *
 * Phase 6 ships a minimal-but-useful read-only view: customer + GST type +
 * payment terms + delivery + line-item count + pricing breakdown. Phase 7
 * replaces this with a full editable line-items table + charges + per-line
 * GST display.
 *
 * Lives in `tabs/` so React.lazy() can split each tab into its own chunk —
 * the chunk boundary keeps the initial detail-page paint fast.
 */

import { Currency, StatusBadge, Badge } from '../../../components/ui'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

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

      {/* Line items teaser */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Line items</h2>
          <span className="text-[11px] text-slate-500">{summary?.lineCount || 0} item{(summary?.lineCount || 0) === 1 ? '' : 's'}</span>
        </div>
        <p className="mt-2 text-[12px] text-slate-500 leading-snug">
          Editable line-items table with per-line GST landing in Phase 7. Open
          via legacy form for now using the <strong>Edit</strong> button above
          if you need to change quantities or rates.
        </p>
      </section>

      {/* Pricing */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Pricing</h2>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
          <dt className="text-slate-500">Total</dt>
          <dd className="text-right font-semibold text-slate-900"><Currency amount={summary?.grand || 0} /></dd>
          <dt className="text-slate-500">Advance paid</dt>
          <dd className="text-right text-emerald-700"><Currency amount={summary?.advance || 0} /></dd>
          <dt className="text-slate-500">Balance due</dt>
          <dd className={`text-right font-semibold ${(summary?.balance || 0) > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
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
