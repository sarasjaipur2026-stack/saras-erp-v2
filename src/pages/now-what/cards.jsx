/**
 * NowWhat cards — eight live action cards rendered on the home page.
 *
 * Each card is its own named export. Wired into the home in NowWhatHome.jsx
 * via the visibility predicate (cardsForRole).
 *
 * Pattern: each card calls useSWRList with a unique SWR key, derives a
 * count + caption, and returns <NowWhatCard ... /> with the right colour.
 *
 * Spec: docs/specs/2026-05-09-erp-shell-design.md §5.2
 * Plan: docs/specs/2026-05-09-erp-shell-plan.md §Phase 6
 */

import { useMemo } from 'react'
import {
  AlertCircle,
  Inbox,
  PackageX,
  ClipboardCheck,
  Truck,
  PauseCircle,
  Wallet,
  MessageSquare,
} from 'lucide-react'
import { useSWRList } from '../../hooks/useSWRList'
import { useAuth } from '../../contexts/AuthContext'
import { supabase } from '../../lib/supabase'
import NowWhatCard from './NowWhatCard'

const fmtMoney = (n) => {
  const num = Number(n) || 0
  return '₹' + num.toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

const todayISO = () => new Date().toISOString().slice(0, 10)

/* ---------------------------------------------------------------------- */
/* 1. Overdue payments                                                     */
/* ---------------------------------------------------------------------- */
export function OverduePaymentsCard() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useSWRList(
    `nowwhat.overdue:${user?.id || 'anon'}`,
    async () => {
      // Net debt per customer + overdue threshold. customer_ledger debit=invoice,
      // credit=payment. Net positive = customer owes us. Filter by
      // overdue_days_allowed exceeded since the oldest unpaid invoice.
      const { data, error } = await supabase
        .from('invoices')
        .select('customer_id, balance_due, invoice_date, customers(firm_name, overdue_days_allowed)')
        .gt('balance_due', 0)
      if (error) throw error
      const out = []
      const today = new Date()
      for (const inv of data || []) {
        const allowed = Number(inv.customers?.overdue_days_allowed ?? 0)
        const ageDays = Math.floor((today - new Date(inv.invoice_date)) / (1000 * 60 * 60 * 24))
        if (ageDays > allowed) out.push(inv)
      }
      return out
    },
    { enabled: !!user?.id },
  )
  const totals = useMemo(() => {
    const list = data || []
    const total = list.reduce((sum, i) => sum + Number(i.balance_due || 0), 0)
    const customerSet = new Set(list.map(i => i.customer_id).filter(Boolean))
    return { count: list.length, total, customers: customerSet.size }
  }, [data])

  return (
    <NowWhatCard
      icon={AlertCircle}
      label="Overdue payments"
      value={fmtMoney(totals.total)}
      caption={`${totals.count} invoice${totals.count === 1 ? '' : 's'} · ${totals.customers} customer${totals.customers === 1 ? '' : 's'}`}
      color="red"
      to="/payments?filter=overdue"
      loading={loading}
      error={error}
      onRetry={refetch}
    />
  )
}

/* ---------------------------------------------------------------------- */
/* 2. Orders pending approval                                              */
/* ---------------------------------------------------------------------- */
export function OrdersPendingCard() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useSWRList(
    `nowwhat.orders_pending:${user?.id || 'anon'}`,
    async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, grand_total, status')
        .in('status', ['booking', 'draft'])
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data || []
    },
    { enabled: !!user?.id },
  )
  const count = data?.length ?? 0
  const value = fmtMoney((data || []).reduce((s, o) => s + Number(o.grand_total || 0), 0))
  return (
    <NowWhatCard
      icon={Inbox}
      label="Orders pending approval"
      value={count}
      caption={value !== '₹0' ? value : 'no value to approve'}
      color="amber"
      to="/orders?filter=pending"
      loading={loading}
      error={error}
      onRetry={refetch}
    />
  )
}

/* ---------------------------------------------------------------------- */
/* 3. Low stock                                                            */
/* ---------------------------------------------------------------------- */
export function LowStockCard() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useSWRList(
    `nowwhat.low_stock:${user?.id || 'anon'}`,
    async () => {
      const { data, error } = await supabase
        .from('stock')
        .select('product_id, quantity, min_stock_level, products(name)')
        .not('min_stock_level', 'is', null)
      if (error) throw error
      return (data || []).filter(r => Number(r.quantity || 0) < Number(r.min_stock_level || 0))
    },
    { enabled: !!user?.id },
  )
  const count = data?.length ?? 0
  return (
    <NowWhatCard
      icon={PackageX}
      label="Low stock"
      value={count}
      caption={count > 0 ? `${count} SKU${count === 1 ? '' : 's'} below min · tap to review` : null}
      color="red"
      to="/stock?filter=low"
      loading={loading}
      error={error}
      onRetry={refetch}
    />
  )
}

/* ---------------------------------------------------------------------- */
/* 4. Jobs ready for QC                                                    */
/* ---------------------------------------------------------------------- */
export function QcPendingCard() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useSWRList(
    `nowwhat.qc_pending:${user?.id || 'anon'}`,
    async () => {
      const { data, error } = await supabase
        .from('production_plans')
        .select('id, status')
        .eq('status', 'qc_pending')
        .limit(50)
      if (error) throw error
      return data || []
    },
    { enabled: !!user?.id },
  )
  const count = data?.length ?? 0
  return (
    <NowWhatCard
      icon={ClipboardCheck}
      label="Jobs ready for QC"
      value={count}
      caption={count > 0 ? 'tap to inspect' : null}
      color="amber"
      to="/quality?filter=pending"
      loading={loading}
      error={error}
      onRetry={refetch}
    />
  )
}

/* ---------------------------------------------------------------------- */
/* 5. Dispatches scheduled today                                           */
/* ---------------------------------------------------------------------- */
export function DispatchTodayCard() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useSWRList(
    `nowwhat.dispatch_today:${user?.id || 'anon'}`,
    async () => {
      const today = todayISO()
      const { data, error } = await supabase
        .from('deliveries')
        .select('id, delivery_date, status')
        .eq('delivery_date', today)
        .neq('status', 'completed')
      if (error) throw error
      return data || []
    },
    { enabled: !!user?.id },
  )
  const count = data?.length ?? 0
  return (
    <NowWhatCard
      icon={Truck}
      label="Dispatches scheduled today"
      value={count}
      caption={count > 0 ? 'tap to see routes' : null}
      color="green"
      to="/dispatch?filter=today"
      loading={loading}
      error={error}
      onRetry={refetch}
    />
  )
}

/* ---------------------------------------------------------------------- */
/* 6. Held bills in POS                                                    */
/* ---------------------------------------------------------------------- */
export function HeldBillsCard() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useSWRList(
    `nowwhat.held_bills:${user?.id || 'anon'}`,
    async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, grand_total, hold_label')
        .eq('held', true)
      if (error) throw error
      return data || []
    },
    { enabled: !!user?.id },
  )
  const count = data?.length ?? 0
  const total = fmtMoney((data || []).reduce((s, b) => s + Number(b.grand_total || 0), 0))
  return (
    <NowWhatCard
      icon={PauseCircle}
      label="Held POS bills"
      value={count}
      caption={count > 0 ? `${total} parked · tap to recall` : null}
      color="amber"
      to="/pos"
      loading={loading}
      error={error}
      onRetry={refetch}
    />
  )
}

/* ---------------------------------------------------------------------- */
/* 7. Today's sales (informational — always renders)                       */
/* ---------------------------------------------------------------------- */
export function TodaySalesCard() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useSWRList(
    `nowwhat.today_sales:${user?.id || 'anon'}`,
    async () => {
      const today = todayISO()
      const { data, error } = await supabase
        .from('invoices')
        .select('id, grand_total')
        .gte('invoice_date', today)
        .eq('source', 'pos')
        .eq('held', false)
      if (error) throw error
      return data || []
    },
    { enabled: !!user?.id },
  )
  const count = data?.length ?? 0
  const total = fmtMoney((data || []).reduce((s, i) => s + Number(i.grand_total || 0), 0))
  return (
    <NowWhatCard
      icon={Wallet}
      label="POS sales today"
      value={total}
      caption={`${count} bill${count === 1 ? '' : 's'}`}
      color="blue"
      to="/pos/history"
      loading={loading}
      error={error}
      onRetry={refetch}
      hideWhenEmpty={false}
    />
  )
}

/* ---------------------------------------------------------------------- */
/* 8. New enquiries today                                                  */
/* ---------------------------------------------------------------------- */
export function NewEnquiriesCard() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useSWRList(
    `nowwhat.enquiries_today:${user?.id || 'anon'}`,
    async () => {
      const today = todayISO()
      const { data, error } = await supabase
        .from('enquiries')
        .select('id')
        .gte('created_at', today + 'T00:00:00')
      if (error) throw error
      return data || []
    },
    { enabled: !!user?.id },
  )
  const count = data?.length ?? 0
  return (
    <NowWhatCard
      icon={MessageSquare}
      label="New enquiries today"
      value={count}
      caption={count > 0 ? 'tap to triage' : null}
      color="blue"
      to="/enquiries"
      loading={loading}
      error={error}
      onRetry={refetch}
    />
  )
}

/* ---------------------------------------------------------------------- */
/* Registry — maps card id → component (consumed by NowWhatHome).          */
/* ---------------------------------------------------------------------- */
// CARD_REGISTRY lives in ./cards-registry.js — this file only exports
// components (satisfies react-refresh/only-export-components).
