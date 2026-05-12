/**
 * <OrderEditV2> — edit-mode wrapper around OrderWizardV2.
 *
 * Mounted at `/orders/:id/edit-v2`. Fetches the order via useOrderDetail's
 * underlying hook, then passes it to the wizard hook as `existingOrder` so
 * the form pre-populates. Save dispatches through `ordersDb.updateWithChildren`
 * (header PATCH + replace child rows) — best-effort consistency until an
 * `update_order_atomic` RPC ships.
 *
 * Legacy /orders/:id/edit remains untouched as the fallback for complex
 * shapes the wizard doesn't yet handle (customer-spec cards, broker
 * commission, sample-order branching with parent links).
 */

import { useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Save, Loader2, Sparkles, AlertTriangle,
} from 'lucide-react'
import ShellShell from '../../components/shell/ShellShell'
import { Button, Currency, Textarea, Select, Input } from '../../components/ui'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { useOrderDetail } from './hooks/useOrderDetail'
import { useOrderWizard } from './hooks/useOrderWizard'
import { useCustomerOutstanding } from './hooks/useCustomerOutstanding'
import OptionalSection from './wizard/OptionalSection'
import CreditCheckBanner from './wizard/CreditCheckBanner'
import ChargesSection from './wizard/ChargesSection'
import ProductGrid from './wizard/ProductGrid'
import CartPanel from './wizard/CartPanel'
import CustomerSheet from './wizard/CustomerSheet'

export default function OrderEditV2() {
  const navigate = useNavigate()
  const toast = useToast()
  const { id } = useParams()

  const { order, loading: orderLoading, error: orderError } = useOrderDetail(id)

  const {
    customers = [], products = [], paymentTerms = [], orderTypes = [],
    chargeTypes = [], loading: mastersLoading, primeMasters,
  } = useApp()

  useEffect(() => { if (primeMasters) primeMasters() }, [primeMasters])

  const {
    form, patch, patchLine, addOrIncrementProduct, removeLine,
    totals, validation, saving, save, isEditMode,
  } = useOrderWizard({ existingOrder: order })

  const customersById = useMemo(() => {
    const m = new Map()
    for (const c of customers) m.set(c.id, c)
    return m
  }, [customers])

  const selectedCustomer = form.customerId ? customersById.get(form.customerId) || null : null

  const cartByProductId = useMemo(() => {
    const m = new Map()
    for (const l of form.lines) {
      if (!l.productId) continue
      const qty = Number(l.qty) || 0
      m.set(l.productId, (m.get(l.productId) || 0) + qty)
    }
    return m
  }, [form.lines])

  const { outstanding, loading: outstandingLoading } = useCustomerOutstanding(form.customerId)

  const handlePickCustomer = useCallback((c) => {
    patch({ customerId: c?.id || '' })
  }, [patch])

  const handlePickProduct = useCallback((product) => {
    addOrIncrementProduct(product)
  }, [addOrIncrementProduct])

  const isOverCredit = useMemo(() => {
    const limit = Number(selectedCustomer?.credit_limit) || 0
    if (limit <= 0) return false
    // Subtract THIS order's current balance from outstanding — we don't
    // want to double-count what's already on the books for this same order.
    const thisOrderExistingBalance = Number(order?.balance_due) || 0
    const adjustedOutstanding = Math.max(0, outstanding - thisOrderExistingBalance)
    return (adjustedOutstanding + totals.grand) > limit
  }, [selectedCustomer, outstanding, totals.grand, order])

  const handleSave = useCallback(async () => {
    if (isOverCredit) {
      const limit = Number(selectedCustomer?.credit_limit) || 0
      const projected = outstanding + totals.grand
      const excess = projected - limit
      const ok = window.confirm(
        `${selectedCustomer?.firm_name || 'Customer'} is over credit limit by ₹${excess.toLocaleString('en-IN')}.\n\n` +
        `Limit ₹${limit.toLocaleString('en-IN')} · projected ₹${projected.toLocaleString('en-IN')}.\n\n` +
        'Save changes anyway?',
      )
      if (!ok) return
    }
    const { data, error } = await save(customersById)
    if (error) {
      toast.error?.(error.message || 'Could not save order')
      return
    }
    if (data) {
      toast.success?.(`Order ${order?.order_number || ''} updated`)
      navigate(`/orders/${id}`)
    }
  }, [save, customersById, toast, navigate, id, order, isOverCredit, selectedCustomer, outstanding, totals.grand])

  const paymentTermsOptions = paymentTerms.map((pt) => ({ value: pt.id, label: pt.name }))
  const orderTypesOptions = orderTypes.map((ot) => ({ value: ot.id, label: ot.name }))

  const canSave = validation.isValid && !saving && isEditMode
  const stillLoading = orderLoading || (mastersLoading && products.length === 0)

  // 404-style state for bad order ID
  if (orderError && !order) {
    return (
      <ShellShell navRail={null} context={null}>
        <div className="p-6 max-w-md mx-auto mt-24 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
            <AlertTriangle size={22} />
          </div>
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Order not found</h1>
          <p className="mt-1.5 text-[13px] text-slate-500">
            {orderError?.message || 'This order may have been deleted or you do not have access to it.'}
          </p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => navigate('/orders')}>← Back to orders</Button>
          </div>
        </div>
      </ShellShell>
    )
  }

  return (
    <ShellShell navRail={null} context={null}>
      <div className="flex h-full flex-col">
        {/* Sticky top bar */}
        <header className="sticky top-0 z-10 bg-white/85 backdrop-blur-xl border-b border-slate-200 px-4 py-2.5">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => navigate(`/orders/${id}`)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 transition"
              aria-label="Back to detail"
            >
              <ArrowLeft size={14} /> Cancel
            </button>

            <span className="font-mono text-[13px] font-bold text-indigo-700">
              {order?.order_number || '…'}
            </span>
            <span className="text-[11px] text-slate-500">Editing</span>

            <CustomerSheet
              customer={selectedCustomer}
              customers={customers}
              onChange={handlePickCustomer}
            />

            <button
              type="button"
              role="switch"
              aria-checked={form.nature === 'sample'}
              onClick={() => patch({ nature: form.nature === 'sample' ? 'regular' : 'sample' })}
              className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12px] font-semibold transition ${
                form.nature === 'sample'
                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                  : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Sparkles size={12} className={form.nature === 'sample' ? 'text-amber-500' : 'text-slate-400'} />
              Sample
            </button>

            <div className="ml-auto flex items-center gap-3">
              <div className="hidden sm:flex flex-col items-end text-[11px] leading-tight">
                <span className="text-slate-400">Total</span>
                <span className="font-bold text-slate-900 tabular-nums"><Currency amount={totals.grand} /></span>
              </div>
              <Button onClick={handleSave} disabled={!canSave}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save changes</>}
              </Button>
            </div>
          </div>

          {!validation.isValid && (
            <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
              {validation.errors.customerId && <span className="text-amber-700">⚠ pick a customer</span>}
              {validation.errors.lines && <span className="text-amber-700">⚠ add at least one line</span>}
            </div>
          )}
        </header>

        {stillLoading ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-[12px] text-slate-400">
            <Loader2 size={14} className="animate-spin" /> Loading order + masters…
          </div>
        ) : (
          <>
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3 p-3 min-h-0">
              <div className="min-h-0 rounded-2xl border border-slate-200 bg-slate-50/30 p-3">
                <ProductGrid
                  products={products}
                  cartByProductId={cartByProductId}
                  onPick={handlePickProduct}
                />
              </div>
              <div className="min-h-0 lg:max-h-[calc(100vh-12rem)]">
                <CartPanel
                  lines={form.lines}
                  products={products}
                  totals={totals}
                  onPatchLine={patchLine}
                  onRemoveLine={removeLine}
                />
              </div>
            </div>

            <div className="px-3 pb-6 space-y-3 max-w-4xl mx-auto w-full">
              <CreditCheckBanner
                customer={selectedCustomer}
                outstanding={outstanding}
                thisOrderTotal={totals.grand}
                loading={outstandingLoading}
              />

              <OptionalSection
                label="charges"
                helper="Freight · packing · labour"
                active={form.charges.length > 0}
                onActivate={() => patch({ charges: [{ chargeTypeId: chargeTypes[0]?.id || '', amount: chargeTypes[0]?.default_value ?? '' }] })}
                onClear={() => patch({ charges: [] })}
              >
                <ChargesSection
                  charges={form.charges}
                  chargeTypes={chargeTypes}
                  onChange={(next) => patch({ charges: next })}
                />
              </OptionalSection>

              <OptionalSection
                label="delivery date"
                helper="Promised delivery date"
                active={Boolean(form.deliveryDate)}
                onActivate={() => patch({ deliveryDate: new Date().toISOString().slice(0, 10) })}
                onClear={() => patch({ deliveryDate: '' })}
              >
                <Input
                  label="Delivery date"
                  type="date"
                  value={form.deliveryDate}
                  onChange={(e) => patch({ deliveryDate: e.target.value })}
                />
              </OptionalSection>

              <OptionalSection
                label="notes"
                helper="Internal notes"
                active={Boolean(form.notes)}
                onActivate={() => patch({ notes: ' ' })}
                onClear={() => patch({ notes: '' })}
              >
                <Textarea
                  label="Notes"
                  rows={3}
                  value={form.notes}
                  onChange={(e) => patch({ notes: e.target.value })}
                />
              </OptionalSection>

              <OptionalSection
                label="payment terms"
                active={Boolean(form.paymentTermsId)}
                onActivate={() => patch({ paymentTermsId: paymentTermsOptions[0]?.value || '' })}
                onClear={() => patch({ paymentTermsId: '' })}
              >
                <Select
                  label="Payment terms"
                  value={form.paymentTermsId}
                  onChange={(e) => patch({ paymentTermsId: e.target.value })}
                  options={paymentTermsOptions}
                />
              </OptionalSection>

              <OptionalSection
                label="order type"
                active={Boolean(form.orderTypeId)}
                onActivate={() => patch({ orderTypeId: orderTypesOptions[0]?.value || '' })}
                onClear={() => patch({ orderTypeId: '' })}
              >
                <Select
                  label="Order type"
                  value={form.orderTypeId}
                  onChange={(e) => patch({ orderTypeId: e.target.value })}
                  options={orderTypesOptions}
                />
              </OptionalSection>

              <OptionalSection
                label="GST override"
                active={form.gstType !== 'auto'}
                onActivate={() => patch({ gstType: 'intra_state' })}
                onClear={() => patch({ gstType: 'auto' })}
              >
                <Select
                  label="GST type"
                  value={form.gstType}
                  onChange={(e) => patch({ gstType: e.target.value })}
                  options={[
                    { value: 'intra_state', label: 'CGST + SGST (intra-state)' },
                    { value: 'inter_state', label: 'IGST (inter-state)' },
                  ]}
                />
              </OptionalSection>

              <p className="text-center text-[10px] text-slate-400 leading-snug">
                For sample branching · spec cards · broker commission, use the
                <a href={`/orders/${id}/edit`} className="ml-1 text-indigo-600 hover:underline">advanced form →</a>
              </p>
            </div>
          </>
        )}
      </div>
    </ShellShell>
  )
}
