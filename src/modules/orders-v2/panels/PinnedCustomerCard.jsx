/**
 * <PinnedCustomerCard> — right-rail customer summary for OrderDetailV2.
 *
 * Fetches the customer row via SWR keyed `customer:<id>` — separate cache
 * slot from the order itself so visiting two orders with the same customer
 * shares the customer fetch.
 *
 * Shows: firm + contact · phone (tel:) · WhatsApp (wa.me) · email (mailto)
 *        · GSTIN · credit limit · payment terms · "View customer →" link.
 *
 * Deep enrichment (live outstanding balance, recent-order count, overdue
 * days) lands once the customers DAL exposes a richer aggregate fetch —
 * for now we show what's already on the customers row.
 */

import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight, Phone, Mail, MessageCircle, User, Loader2,
} from 'lucide-react'
import { Currency, Badge } from '../../../components/ui'
import { useSWRList } from '../../../hooks/useSWRList'
import { customers as customersDb } from '../../../lib/db/masters'

/**
 * Normalise an Indian phone for wa.me / tel: links. Strips spaces, leading
 * zero, leading "+91". Returns null if the result isn't a 10-digit number.
 */
function normalisePhone(raw) {
  if (!raw || typeof raw !== 'string') return null
  let n = raw.replace(/[\s-]/g, '')
  if (n.startsWith('+91')) n = n.slice(3)
  else if (n.startsWith('91') && n.length > 10) n = n.slice(2)
  else if (n.startsWith('0')) n = n.slice(1)
  return /^\d{10}$/.test(n) ? n : null
}

/**
 * @param {object} props
 * @param {string} props.customerId
 */
export default function PinnedCustomerCard({ customerId }) {
  const navigate = useNavigate()

  const key = customerId ? `customer:${customerId}` : 'customer:none'

  const fetcher = useCallback(async () => {
    if (!customerId) return null
    const res = await customersDb.get(customerId)
    if (res?.error) throw res.error
    return res?.data || null
  }, [customerId])

  const { data: customer, loading } = useSWRList(key, fetcher, {
    enabled: Boolean(customerId),
    staleAfterMs: 60_000, // customer rows don't change as often as orders
  })

  const phone10 = useMemo(() => normalisePhone(customer?.phone), [customer?.phone])
  const wa10 = useMemo(() => normalisePhone(customer?.whatsapp || customer?.phone), [customer?.whatsapp, customer?.phone])

  if (!customerId) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-4 text-center text-[11px] text-slate-400">
        Order has no linked customer.
      </div>
    )
  }

  if (loading && !customer) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Loader2 size={12} className="animate-spin" /> Loading customer…
        </div>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white/50 p-4 text-center text-[11px] text-slate-400">
        Customer not found.
      </div>
    )
  }

  const firm = customer.firm_name || customer.contact_person || 'Unknown'
  const contact = customer.contact_person && customer.contact_person !== customer.firm_name ? customer.contact_person : null

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Customer</div>
        <button
          type="button"
          onClick={() => navigate(`/customers/${customer.id}`)}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 transition"
        >
          View <ArrowUpRight size={11} />
        </button>
      </div>

      {/* Identity */}
      <div className="mt-2 flex items-start gap-2">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <User size={14} />
        </div>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-slate-900">{firm}</div>
          {contact && <div className="truncate text-[11px] text-slate-500">{contact}</div>}
          {customer.customer_group && (
            <div className="mt-1"><Badge variant="default">{customer.customer_group}</Badge></div>
          )}
        </div>
      </div>

      {/* Contact actions */}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {phone10 ? (
          <a
            href={`tel:+91${phone10}`}
            title="Call"
            className="inline-flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 transition"
          >
            <Phone size={13} /><span>Call</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="No phone"
            className="inline-flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-slate-300 bg-slate-50 cursor-not-allowed"
          >
            <Phone size={13} /><span>Call</span>
          </button>
        )}
        {wa10 ? (
          <a
            href={`https://wa.me/91${wa10}`}
            target="_blank"
            rel="noopener noreferrer"
            title="WhatsApp"
            className="inline-flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 transition"
          >
            <MessageCircle size={13} /><span>WhatsApp</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="No WhatsApp"
            className="inline-flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-slate-300 bg-slate-50 cursor-not-allowed"
          >
            <MessageCircle size={13} /><span>WhatsApp</span>
          </button>
        )}
        {customer.email ? (
          <a
            href={`mailto:${customer.email}`}
            title="Email"
            className="inline-flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-slate-700 bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 transition"
          >
            <Mail size={13} /><span>Email</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            title="No email"
            className="inline-flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-[10px] font-medium text-slate-300 bg-slate-50 cursor-not-allowed"
          >
            <Mail size={13} /><span>Email</span>
          </button>
        )}
      </div>

      {/* Account snapshot */}
      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        {customer.gstin && (<><dt className="text-slate-500">GSTIN</dt><dd className="text-right font-mono truncate">{customer.gstin}</dd></>)}
        {customer.state_code && (<><dt className="text-slate-500">State</dt><dd className="text-right font-mono">{customer.state_code}</dd></>)}
        {customer.payment_terms?.name && (<><dt className="text-slate-500">Terms</dt><dd className="text-right truncate">{customer.payment_terms.name}</dd></>)}
        {Number(customer.credit_limit) > 0 && (
          <><dt className="text-slate-500">Credit limit</dt>
            <dd className="text-right font-semibold text-slate-900"><Currency amount={Number(customer.credit_limit)} /></dd></>
        )}
        {Number(customer.overdue_days_allowed) > 0 && (
          <><dt className="text-slate-500">Overdue allowed</dt>
            <dd className="text-right">{customer.overdue_days_allowed} days</dd></>
        )}
      </dl>

      <p className="mt-2 text-[10px] text-slate-400 leading-snug">
        Live outstanding balance + recent orders land once the customers DAL
        exposes an aggregate fetch.
      </p>
    </div>
  )
}

