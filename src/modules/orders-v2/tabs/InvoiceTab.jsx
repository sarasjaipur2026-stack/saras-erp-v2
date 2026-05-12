/**
 * <InvoiceTab> — invoices linked to this order.
 *
 * Direct Supabase query (no dedicated `invoices.listByOrder` helper exists
 * yet). Local to orders-v2 so we don't have to touch the shared finance
 * DAL until the API is finalised.
 */

import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Plus, Loader2 } from 'lucide-react'
import { Button, Badge, Currency } from '../../../components/ui'
import { useSWRList } from '../../../hooks/useSWRList'
import { useRealtimeTable } from '../../../hooks/useRealtimeTable'
import { supabase } from '../../../lib/supabase'

const STATUS_VARIANT = {
  draft: 'default',
  issued: 'warning',
  partially_paid: 'warning',
  paid: 'success',
  cancelled: 'danger',
  overdue: 'danger',
}

const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/**
 * @param {object} props
 * @param {object} props.order
 */
export default function InvoiceTab({ order }) {
  const navigate = useNavigate()

  const key = order?.id ? `order-invoices:${order.id}` : 'order-invoices:none'

  const fetcher = useCallback(async () => {
    if (!order?.id) return []
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, due_date, grand_total, amount_paid, balance_due, status')
      .eq('order_id', order.id)
      .order('invoice_date', { ascending: false })
      .limit(50)
    if (error) throw error
    return data || []
  }, [order])

  const { data: invoices = [], loading, refetch } = useSWRList(key, fetcher, {
    enabled: Boolean(order?.id),
    staleAfterMs: 30_000,
  })

  useRealtimeTable('invoices',
    () => { refetch() },
    { filter: order?.id ? `order_id=eq.${order.id}` : undefined, enabled: Boolean(order?.id) },
  )

  if (!order) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[14px] font-semibold text-slate-900">Invoice</h2>
        <Button size="sm" onClick={() => navigate(`/invoicing/new?order_id=${order.id}`)}>
          <Plus size={14} /> Generate invoice
        </Button>
      </div>

      {loading && invoices.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-slate-400">
          <Loader2 size={14} className="animate-spin" /> Loading invoices…
        </div>
      ) : invoices.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <FileText size={18} />
          </div>
          <h3 className="mt-3 text-[13px] font-semibold text-slate-700">No invoices yet</h3>
          <p className="mt-1.5 text-[12px] text-slate-500 leading-snug max-w-md mx-auto">
            Once production is complete and dispatched, generate an invoice via
            the button above. Linked invoices will appear here with paid /
            balance / status.
          </p>
        </div>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 text-left">Invoice #</th>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Due</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">Paid</th>
                  <th className="px-4 py-2 text-right">Balance</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {invoices.map((inv) => {
                  const balance = Number(inv.balance_due) || 0
                  return (
                    <tr
                      key={inv.id}
                      onClick={() => navigate(`/invoicing/${inv.id}`)}
                      className="hover:bg-slate-50 cursor-pointer"
                    >
                      <td className="px-4 py-2 font-mono text-indigo-700">{inv.invoice_number || inv.id?.slice(0, 8)}</td>
                      <td className="px-4 py-2 text-slate-700">{fmtDate(inv.invoice_date)}</td>
                      <td className="px-4 py-2 text-slate-500">{fmtDate(inv.due_date)}</td>
                      <td className="px-4 py-2 text-right tabular-nums"><Currency amount={Number(inv.grand_total) || 0} /></td>
                      <td className="px-4 py-2 text-right text-emerald-700 tabular-nums"><Currency amount={Number(inv.amount_paid) || 0} /></td>
                      <td className={`px-4 py-2 text-right font-semibold tabular-nums ${balance > 0 ? 'text-amber-700' : 'text-slate-400'}`}>
                        {balance > 0 ? <Currency amount={balance} /> : '—'}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={STATUS_VARIANT[inv.status] || 'default'}>{inv.status || 'draft'}</Badge>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}
