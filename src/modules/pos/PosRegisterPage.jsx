/**
 * PosRegisterPage — Petpooja-style 3-panel register.
 * Mode 'counter' (desktop, dense tiles) or 'field' (tablet, larger tiles).
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §7
 * Plan: docs/specs/2026-04-28-pos-system-plan.md §Phase 6
 */

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { useSWRList } from '../../hooks/useSWRList'
import { supabase } from '../../lib/supabase'
import { defaultTerminal, currentSession, holdSale } from './lib/posDb'
import { usePosCart } from './hooks/usePosCart'
import { usePosShortcuts } from './hooks/usePosShortcuts'
import { usePrintBridge } from './hooks/usePrintBridge'

import CategoryRail from './components/CategoryRail'
import ProductGrid from './components/ProductGrid'
import SearchBar from './components/SearchBar'
import BillPanel from './components/BillPanel'
import CheckoutDrawer from './components/CheckoutDrawer'
import HoldRecallSheet from './components/HoldRecallSheet'

import { LogOut, History as HistoryIcon, DollarSign } from 'lucide-react'

export default function PosRegisterPage({ mode = 'counter' }) {
  const { user, profile } = useAuth()
  const app = useApp()
  const { primeMasters } = app
  const toast = useToast()

  // Prime masters once for products/customers — cheap if already primed
  useEffect(() => { primeMasters?.() }, [primeMasters])

  // Terminal + session
  const [terminal, setTerminal] = useState(null)
  const [session, setSession] = useState(null)
  const [bootstrapping, setBootstrapping] = useState(true)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: t } = await defaultTerminal()
      if (!alive) return
      setTerminal(t)
      if (t) {
        const { data: s } = await currentSession(t.id)
        if (alive) setSession(s)
      }
      if (alive) setBootstrapping(false)
    })()
    return () => { alive = false }
  }, [])

  // Cart — keyed by session_id (or 'no_session' so the cart still works for
  // browsing before drawer is opened, but persists separately)
  const cart = usePosCart({ sessionId: session?.id || 'no_session' })

  // Print bridge health (green dot if local thermal printer service is up)
  const { status: bridgeStatus } = usePrintBridge()

  // Product images — primary only, all SKUs (one query)
  const { data: imagesRaw } = useSWRList(
    'pos.product_images.primary',
    async () => {
      const { data, error } = await supabase
        .from('product_images')
        .select('product_id, storage_path, thumb_path')
        .eq('is_primary', true)
      if (error) throw error
      return data || []
    },
  )
  const primaryImagesByProductId = useMemo(() => {
    const m = new Map()
    for (const img of imagesRaw ?? []) m.set(img.product_id, img)
    return m
  }, [imagesRaw])

  // Stock — for the terminal's default warehouse
  const { data: stockRaw } = useSWRList(
    `pos.stock:${terminal?.default_warehouse_id || 'none'}`,
    async () => {
      if (!terminal?.default_warehouse_id) return []
      const { data, error } = await supabase
        .from('stock')
        .select('product_id, quantity')
        .eq('warehouse_id', terminal.default_warehouse_id)
      if (error) throw error
      return data || []
    },
    { enabled: !!terminal?.default_warehouse_id },
  )
  const stockByProductId = useMemo(() => {
    const m = new Map()
    for (const s of stockRaw ?? []) m.set(s.product_id, Number(s.quantity || 0))
    return m
  }, [stockRaw])

  // Filtering
  const [category, setCategory] = useState(null)
  const products = app?.products ?? []
  const customers = app?.customers ?? []
  const filtered = useMemo(() => {
    if (!category) return products
    return products.filter(p => (p.category || 'other').toLowerCase() === category)
  }, [products, category])

  const onAddProduct = (product) => {
    cart.addProduct(product)
  }

  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [recallOpen, setRecallOpen] = useState(false)

  const onCheckout = () => {
    if (!session) { toast.info('Open a drawer session first'); return }
    if (cart.totals.lines.length === 0) return
    setCheckoutOpen(true)
  }

  const onCheckoutSuccess = (invoiceId) => {
    toast.success('Bill created')
    setCheckoutOpen(false)
    cart.clear()
    if (import.meta.env.DEV) console.log('Created invoice', invoiceId)
  }

  const onHold = async () => {
    if (!session) { toast.info('Open a drawer session first'); return }
    if (cart.totals.lines.length === 0) return
    const label = window.prompt('Hold label (optional, e.g. "Sharma walk-in 11:42"):') || ''
    const idem = crypto.randomUUID()
    const payload = {
      session_id: session.id,
      terminal_id: terminal?.id,
      customer_id: cart.state.customer?.id || null,
      warehouse_id: terminal?.default_warehouse_id || null,
      doc_type: cart.state.docType,
      hold_label: label,
      notes: cart.state.notes || null,
      subtotal: cart.totals.subtotal,
      cgst_amount: cart.totals.cgst_amount,
      sgst_amount: cart.totals.sgst_amount,
      igst_amount: cart.totals.igst_amount,
      total_tax: cart.totals.total_tax,
      grand_total: cart.totals.grand_total_after_discount,
      lines: cart.totals.lines.map((l, i) => ({
        product_id: l.product_id, description: l.description, qty: l.qty, unit: l.unit, rate: l.rate,
        discount_pct: l.discount_pct, discount_amt: l.discount_amt, hsn_code: l.hsn_code, gst_rate: l.gst_rate,
        taxable_amount: l.taxable_amount, cgst_amount: l.cgst_amount, sgst_amount: l.sgst_amount,
        igst_amount: l.igst_amount, line_total: l.line_total, sort_order: i,
      })),
    }
    const { error } = await holdSale(payload, idem)
    if (error) { toast.error(String(error.message || error)); return }
    toast.success('Bill held — F5 to recall')
    cart.clear()
  }

  const onRecallOpen = () => {
    if (!session) { toast.info('Open a drawer session first'); return }
    setRecallOpen(true)
  }

  const onRecallApply = (held) => {
    // held = { invoice: {...}, lines: [...] }
    cart.clear()
    // Hydrate cart from held bill
    const customer = customers.find(c => c.id === held.invoice.customer_id) || null
    if (customer) cart.setCustomer(customer)
    cart.setDocType(held.invoice.doc_type || 'tax_invoice')
    for (const ln of held.lines || []) {
      const product = products.find(p => p.id === ln.product_id)
      if (product) cart.addProduct(product, { qty: Number(ln.qty), rate: Number(ln.rate) })
    }
    toast.success('Recalled')
  }

  // Keyboard shortcuts
  usePosShortcuts({
    onCheckout,
    onHold,
    onRecall: onRecallOpen,
    onReprint: () => toast.info('Reprint ships in Phase 10'),
  })

  if (bootstrapping) {
    return <div className="flex-1 flex items-center justify-center text-slate-400">Loading POS…</div>
  }

  if (!terminal) {
    return (
      <div className="flex-1 flex items-center justify-center text-center p-8">
        <div>
          <div className="text-4xl mb-3">🛒</div>
          <h2 className="text-lg font-bold text-slate-700 mb-2">No POS terminal configured</h2>
          <p className="text-[12px] text-slate-500 mb-4">An admin needs to create a terminal in Settings → POS Terminals.</p>
          <Link to="/dashboard" className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700">Back to dashboard</Link>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Topbar */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-[12px] font-bold">SARAS POS</div>
          <div className="text-[11px] text-slate-500 flex items-center gap-2">
            <span><b>{profile?.full_name || user?.email}</b> · {terminal.name}</span>
            {session ? (
              <span className="text-emerald-600 font-semibold">· Drawer open ₹{Number(session.opened_with).toFixed(0)}</span>
            ) : (
              <span className="text-amber-600 font-semibold">· No drawer open</span>
            )}
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold ${
                bridgeStatus === 'online' ? 'bg-emerald-50 text-emerald-700' :
                bridgeStatus === 'offline' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'
              }`}
              title={bridgeStatus === 'online' ? 'Thermal printer ready' : bridgeStatus === 'offline' ? 'Print bridge offline — bills will queue' : 'Checking…'}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${bridgeStatus === 'online' ? 'bg-emerald-500' : bridgeStatus === 'offline' ? 'bg-red-500' : 'bg-slate-400'}`} />
              Printer
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SearchBar products={products} onAdd={onAddProduct} />
          <Link to="/pos/session" className="px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5">
            <DollarSign size={13} /> {session ? 'Close drawer' : 'Open drawer'}
          </Link>
          <Link to="/pos/history" className="px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5">
            <HistoryIcon size={13} /> History
          </Link>
          <Link to="/dashboard" className="px-2.5 py-2 bg-white border border-slate-200 rounded-xl text-[11px] font-semibold text-slate-600 hover:bg-slate-50 inline-flex items-center gap-1.5" title="Esc">
            <LogOut size={13} /> Exit
          </Link>
        </div>
      </div>

      {/* 3-panel body */}
      <div
        className="flex-1 grid overflow-hidden"
        style={{ gridTemplateColumns: mode === 'field' ? '180px 1fr 380px' : '160px 1fr 360px' }}
      >
        <CategoryRail products={products} selected={category} onSelect={setCategory} />
        <ProductGrid
          products={filtered}
          primaryImagesByProductId={primaryImagesByProductId}
          stockByProductId={stockByProductId}
          onAdd={onAddProduct}
          mode={mode}
        />
        <BillPanel
          cart={cart}
          customers={customers}
          stockByProductId={stockByProductId}
          onCheckout={onCheckout}
          onHold={onHold}
          onCustomerChange={cart.setCustomer}
          onDocTypeChange={cart.setDocType}
          onClear={cart.clear}
        />
      </div>

      <CheckoutDrawer
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        cart={cart}
        terminal={terminal}
        session={session}
        onSuccess={onCheckoutSuccess}
      />

      <HoldRecallSheet
        open={recallOpen}
        onClose={() => setRecallOpen(false)}
        sessionId={session?.id}
        onRecall={onRecallApply}
      />
    </>
  )
}
