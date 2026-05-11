/**
 * <PaymentsTab> — list of payments recorded against this order.
 *
 * Reads from `order.payments` (already fetched by useOrderDetail). "+ Record
 * payment" navigates to the finance module's payment-form with order_id
 * pre-filled. Inline add-payment form will land in a follow-up pass — the
 * affordance ships now via the navigation button.
 */

import { useNavigate } from 'react-router-dom'
import { Banknote, Plus } from 'lucide-react'
import { Currency, Button, Badge } from '../../../components/ui'

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

const MODE_LABEL = {
  cash: 'Cash',
  upi: 'UPI',
  bank_transfer: 'Bank transfer',
  cheque: 'Cheque',
  card: 'Card',
  on_account: 'On account',
}

/**
 * @param {object} props
 * @param {object} props.order
 * @param {object} props.summary
 */
export default function PaymentsTab({ order, summary }) {
  const navigate = useNavigate()
  if (!order) return null

  const payments = Array.isArray(order.payments) ? order.payments : []
  const totalPaid = payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0)
  const balance = Number(summary?.balance ?? order.balance_due) || 0

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-slate-900">Payments</h2>
        <Button
          size="sm"
          onClick={() => navigate(`/finance/payments/new?order_id=${order.id}`)}
        >
          <Plus size={14} /> Record payment
        </Button>
      </div>

      {/* Summary stripe */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Total</div>
          <div className="mt-1 text-[16px] font-bold text-slate-900"><Currency amount={Number(summary?.grand) || 0} /></div>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-emerald-600">Paid</div>
          <div className="mt-1 text-[16px] font-bold text-emerald-700"><Currency amount={totalPaid} /></div>
        </div>
        <div className={`rounded-2xl border p-3 ${balance > 0 ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-white'}`}>
          <div className={`text-[10px] uppercase tracking-wider font-semibold ${balance > 0 ? 'text-amber-700' : 'text-slate-400'}`}>Balance</div>
          <div className={`mt-1 text-[16px] font-bold ${balance > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
            {balance > 0 ? <Currency amount={balance} /> : '—'}
          </div>
        </div>
      </section>

      {payments.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <Banknote size={18} />
          </div>
          <h3 className="mt-3 text-[13px] font-semibold text-slate-700">No payments recorded</h3>
          <p className="mt-1.5 text-[12px] text-slate-500 leading-snug max-w-md mx-auto">
            Use <strong>Record payment</strong> above to log a customer payment.
          </p>
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Mode</th>
                  <th className="px-4 py-2 text-left">Reference</th>
                  <th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {payments.map((p, idx) => (
                  <tr key={p.id || idx}>
                    <td className="px-4 py-2 text-slate-700">{fmtDate(p.payment_date || p.created_at)}</td>
                    <td className="px-4 py-2 text-slate-700">{MODE_LABEL[p.payment_mode] || p.payment_mode || '—'}</td>
                    <td className="px-4 py-2 text-slate-500 truncate max-w-[18ch]">{p.reference_number || p.transaction_id || '—'}</td>
                    <td className="px-4 py-2 text-right font-semibold tabular-nums"><Currency amount={Number(p.amount) || 0} /></td>
                    <td className="px-4 py-2">
                      <Badge variant={p.status === 'completed' ? 'success' : p.status === 'failed' ? 'danger' : 'warning'}>
                        {p.status || 'pending'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
