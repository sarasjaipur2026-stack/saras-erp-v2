/**
 * <OrderWizardV2> — smart-progressive single-page order creator.
 *
 * Spec: docs/specs/2026-05-11-orders-workspace-design.md (Q5 option D)
 * Plan: docs/specs/2026-05-11-orders-workspace-plan.md §Phase 9
 *
 * Phase 9 (this commit) — new-order path only. Mounted at the opt-in route
 * `/orders/new-v2`. The legacy 4-step OrderForm continues to handle
 * `/orders/new`, `/orders/:id/edit`, and `/orders/:id/duplicate` so we
 * don't regress the complex shapes (sample branching, customer-spec
 * cards, charges, broker commission) until the wizard catches up.
 *
 * Layout: always-visible Customer + Lines + Save · optional Delivery /
 * Notes / Payment Terms / GST override reveal as "+ Add" buttons.
 */

import { useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Plus, Save, AlertCircle, Loader2, Sparkles, Phone, Mail, MessageCircle,
} from 'lucide-react'
import ShellShell from '../../components/shell/ShellShell'
import { Button, Input, SearchSelect, Textarea, Select, Currency } from '../../components/ui'
import { useApp } from '../../contexts/AppContext'
import { useToast } from '../../contexts/ToastContext'
import { useOrderWizard } from './hooks/useOrderWizard'
import { useCustomerOutstanding } from './hooks/useCustomerOutstanding'
import LineItemRow from './wizard/LineItemRow'
import OptionalSection from './wizard/OptionalSection'
import CreditCheckBanner from './wizard/CreditCheckBanner'
import ChargesSection from './wizard/ChargesSection'

export default function OrderWizardV2() {
  const navigate = useNavigate()
  const toast = useToast()
  const {
    customers = [], products = [], paymentTerms = [], orderTypes = [],
    chargeTypes = [], loading: mastersLoading,
  } = useApp()

  const {
    form, patch, patchLine, addLine, removeLine,
    totals, validation, saving, save,
  } = useOrderWizard()

  // Selected customer (for phone preview + credit banner)
  const selectedCustomer = useMemo(
    () => (form.customerId ? customers.find((c) => c.id === form.customerId) : null),
    [customers, form.customerId],
  )

  const { outstanding, loading: outstandingLoading } = useCustomerOutstanding(form.customerId)

  // Map for save() to resolve GST type from customer.state_code without a refetch.
  const customersById = useMemo(() => {
    const m = new Map()
    for (const c of customers) m.set(c.id, c)
    return m
  }, [customers])

  const customerOptions = customers
    .filter((c) => c.active !== false)
    .map((c) => ({
      value: c.id,
      label: c.firm_name || c.contact_person || c.id,
    }))

  const paymentTermsOptions = paymentTerms.map((pt) => ({
    value: pt.id,
    label: pt.name,
  }))

  const orderTypesOptions = orderTypes.map((ot) => ({
    value: ot.id,
    label: ot.name,
  }))

  // Credit-block guard: when projected total exceeds the customer's credit
  // limit, confirm before saving. Phase 10 doesn't HARD-block (no permission
  // gate yet); a confirm prompt + warning banner is the safety net.
  const isOverCredit = useMemo(() => {
    const limit = Number(selectedCustomer?.credit_limit) || 0
    if (limit <= 0) return false
    return (outstanding + totals.grand) > limit
  }, [selectedCustomer, outstanding, totals.grand])

  const handleSave = useCallback(async () => {
    if (isOverCredit) {
      const limit = Number(selectedCustomer?.credit_limit) || 0
      const projected = outstanding + totals.grand
      const excess = projected - limit
      const ok = window.confirm(
        `${selectedCustomer?.firm_name || 'Customer'} is over credit limit by ₹${excess.toLocaleString('en-IN')}.\n\n` +
        `Limit ₹${limit.toLocaleString('en-IN')} · projected ₹${projected.toLocaleString('en-IN')}.\n\n` +
        'Save the order anyway?',
      )
      if (!ok) return
    }
    const { data, error } = await save(customersById)
    if (error) {
      toast.error?.(error.message || 'Could not create order')
      return
    }
    if (data) {
      const orderId = data?.id || (Array.isArray(data) ? data[0]?.id : null)
      const orderNumber = data?.order_number || (Array.isArray(data) ? data[0]?.order_number : null)
      toast.success?.(`Order ${orderNumber || 'created'}`)
      if (orderId) navigate(`/orders/${orderId}`)
      else navigate('/orders')
    }
  }, [save, customersById, toast, navigate, isOverCredit, selectedCustomer, outstanding, totals.grand])

  return (
    <ShellShell navRail={null} context={null}>
      <div className="max-w-4xl mx-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate('/orders')}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-medium text-slate-500 hover:bg-slate-100 transition"
          >
            <ArrowLeft size={14} /> Orders
          </button>
          <h1 className="text-xl font-bold text-slate-900">
            New {form.nature === 'sample' ? 'sample' : 'order'}
          </h1>
          <a
            href="/orders/new"
            className="text-[11px] text-slate-400 hover:text-slate-700 transition"
            title="Open the full 4-step form (spec cards, complex orders)"
          >
            Advanced form →
          </a>
        </div>

        {/* Sample toggle */}
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-2.5">
          <div className="inline-flex items-center gap-2 text-[12px] text-slate-700">
            <Sparkles size={14} className={form.nature === 'sample' ? 'text-amber-500' : 'text-slate-400'} />
            <span className="font-semibold">Sample order</span>
            <span className="text-slate-500">— smaller qty, often free or at cost</span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={form.nature === 'sample'}
            onClick={() => patch({ nature: form.nature === 'sample' ? 'regular' : 'sample' })}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${form.nature === 'sample' ? 'bg-amber-500' : 'bg-slate-200'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition ${form.nature === 'sample' ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>

        {mastersLoading && customers.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-12 text-[12px] text-slate-400">
            <Loader2 size={14} className="animate-spin" />
            Loading master data…
          </div>
        ) : (
          <>
            {/* Customer */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Customer</h2>
              <SearchSelect
                required
                value={form.customerId}
                onChange={(v) => patch({ customerId: v })}
                options={customerOptions}
                placeholder="Search by firm name…"
              />
              {validation.errors.customerId && (
                <p className="mt-1.5 text-[11px] text-red-600 inline-flex items-center gap-1">
                  <AlertCircle size={11} /> {validation.errors.customerId}
                </p>
              )}
              {/* Phone preview — appears once a customer is selected */}
              {selectedCustomer && (selectedCustomer.phone || selectedCustomer.whatsapp || selectedCustomer.email) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  {selectedCustomer.phone && (
                    <a href={`tel:${selectedCustomer.phone}`} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 hover:bg-indigo-50 hover:text-indigo-700 transition">
                      <Phone size={11} /> {selectedCustomer.phone}
                    </a>
                  )}
                  {selectedCustomer.whatsapp && selectedCustomer.whatsapp !== selectedCustomer.phone && (
                    <a href={`https://wa.me/91${String(selectedCustomer.whatsapp).replace(/[^0-9]/g, '').slice(-10)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 hover:bg-emerald-50 hover:text-emerald-700 transition">
                      <MessageCircle size={11} /> WhatsApp
                    </a>
                  )}
                  {selectedCustomer.email && (
                    <a href={`mailto:${selectedCustomer.email}`} className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 hover:bg-indigo-50 hover:text-indigo-700 transition">
                      <Mail size={11} /> {selectedCustomer.email}
                    </a>
                  )}
                  {selectedCustomer.gstin && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 font-mono">
                      GSTIN: {selectedCustomer.gstin}
                    </span>
                  )}
                </div>
              )}
            </section>

            {/* Credit-check banner */}
            <CreditCheckBanner
              customer={selectedCustomer}
              outstanding={outstanding}
              thisOrderTotal={totals.grand}
              loading={outstandingLoading}
            />

            {/* Line items */}
            <section className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">Lines</h2>
                <button
                  type="button"
                  onClick={addLine}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 transition"
                >
                  <Plus size={12} /> Add line
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {form.lines.map((line, idx) => (
                  <LineItemRow
                    key={idx}
                    index={idx}
                    line={line}
                    products={products}
                    onPatch={(p) => patchLine(idx, p)}
                    onRemove={() => removeLine(idx)}
                    canRemove={form.lines.length > 1}
                  />
                ))}
              </div>
              {validation.errors.lines && (
                <p className="mt-2 text-[11px] text-red-600 inline-flex items-center gap-1">
                  <AlertCircle size={11} /> {validation.errors.lines}
                </p>
              )}
            </section>

            {/* Totals */}
            <section className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[13px]">
                <dt className="text-slate-500">Subtotal</dt>
                <dd className="text-right tabular-nums"><Currency amount={totals.subtotal} /></dd>
                {totals.discount > 0 && (
                  <>
                    <dt className="text-slate-500">Discount</dt>
                    <dd className="text-right text-amber-700 tabular-nums">−<Currency amount={totals.discount} /></dd>
                    <dt className="text-slate-500">Taxable</dt>
                    <dd className="text-right tabular-nums"><Currency amount={totals.taxable} /></dd>
                  </>
                )}
                <dt className="text-slate-500">GST</dt>
                <dd className="text-right tabular-nums"><Currency amount={totals.gst} /></dd>
                {totals.charges > 0 && (
                  <>
                    <dt className="text-slate-500">Charges</dt>
                    <dd className="text-right tabular-nums"><Currency amount={totals.charges} /></dd>
                  </>
                )}
                <dt className="text-slate-700 font-semibold border-t border-slate-200 pt-1.5">Total</dt>
                <dd className="text-right font-bold text-slate-900 border-t border-slate-200 pt-1.5 tabular-nums">
                  <Currency amount={totals.grand} />
                </dd>
              </dl>
            </section>

            {/* Charges (optional) */}
            <OptionalSection
              label="charges"
              helper="Freight · packing · labour — flat extras added after GST"
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

            {/* Optional sections */}
            <OptionalSection
              label="delivery date"
              helper="Promised delivery — used for production scheduling"
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
              helper="Internal notes — visible to anyone with order access"
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
              helper="Override the customer default for this order"
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
              helper="Order numbering prefix — manufacturing / trading / sample / jobwork"
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
              helper="Auto-resolves from customer state code; override here if needed"
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

            {/* Save bar */}
            <div className="sticky bottom-4 flex items-center justify-end gap-2 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur-md px-4 py-3 shadow-md">
              <Button variant="secondary" onClick={() => navigate('/orders')} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving || !validation.isValid}>
                {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Create order</>}
              </Button>
            </div>

            <p className="text-center text-[10px] text-slate-400 leading-snug max-w-md mx-auto">
              Phase 9 ships the simple-order path. For sample-order branching,
              charges, customer spec cards, broker commission, and existing-order
              edits — use the <a href="/orders/new" className="text-indigo-600 hover:underline">advanced form</a>.
            </p>
          </>
        )}
      </div>
    </ShellShell>
  )
}
