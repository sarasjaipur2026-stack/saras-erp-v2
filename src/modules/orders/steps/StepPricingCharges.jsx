import { Plus, Trash2 } from 'lucide-react';
import { Button, Input, Select, Textarea, Currency } from '../../../components/ui';

export function StepPricingCharges({
  formData,
  setFormData,
  onAddCharge,
  onUpdateCharge,
  onRemoveCharge,
  chargeTypes,
  recalculatePricing,
}) {
  return (
    <div className="space-y-8">
      {/* Charges */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Additional Charges</h3>
          <Button onClick={onAddCharge} className="bg-indigo-600 text-white hover:bg-indigo-700">
            <Plus size={16} />
            Add Charge
          </Button>
        </div>

        {(!formData.charges || formData.charges.length === 0) ? (
          <p className="text-slate-500 text-sm">No additional charges added.</p>
        ) : (
          <div className="space-y-3">
            {formData.charges.map((charge) => (
              <div key={charge.id} className="flex gap-4 items-end p-4 bg-slate-50 rounded-lg">
                <div className="flex-1">
                  <Select
                    label="Charge Type"
                    value={charge.charge_type_id || ''}
                    onChange={(e) => onUpdateCharge(charge.id, { charge_type_id: e.target.value })}
                    options={[
                      { value: '', label: 'Select charge type' },
                      ...(chargeTypes || []).map((type) => ({ value: type.id, label: type.name })),
                    ]}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount</label>
                  <Input
                    type="number"
                    value={charge.amount || 0}
                    onChange={(e) => {
                      onUpdateCharge(charge.id, { amount: parseFloat(e.target.value) });
                      recalculatePricing();
                    }}
                    placeholder="0.00"
                  />
                </div>
                <div className="flex-1">
                  <Select
                    label="Scope"
                    value={charge.scope}
                    onChange={(e) => onUpdateCharge(charge.id, { scope: e.target.value })}
                    options={[
                      { value: 'per_order', label: 'Per Order' },
                      { value: 'per_item', label: 'Per Item' },
                    ]}
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={charge.is_taxable}
                    onChange={(e) => {
                      onUpdateCharge(charge.id, { is_taxable: e.target.checked });
                      recalculatePricing();
                    }}
                    className="w-4 h-4 rounded"
                  />
                  <span className="text-sm text-slate-700">Taxable</span>
                </label>
                <Button
                  onClick={() => onRemoveCharge(charge.id)}
                  variant="secondary"
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 size={16} />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 pt-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-6">Order Discount</h3>
        <div className="grid grid-cols-2 gap-6">
          <Select
            label="Discount Type"
            value={formData.order_discount_type}
            onChange={(e) => {
              const val = e.target.value;
              setFormData((prev) => ({ ...prev, order_discount_type: val }));
              recalculatePricing();
            }}
            options={[
              { value: 'flat', label: 'Flat Amount' },
              { value: 'percent', label: 'Percentage' },
            ]}
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {formData.order_discount_type === 'percent' ? 'Percentage (%)' : 'Amount'}
            </label>
            <Input
              type="number"
              value={formData.order_discount_value || 0}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setFormData((prev) => ({ ...prev, order_discount_value: val }));
                recalculatePricing();
              }}
              placeholder="0"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 pt-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-6">GST Configuration</h3>
        <div className="grid grid-cols-2 gap-6">
          <Select
            label="GST Type"
            value={formData.gst_type}
            onChange={(e) => {
              const val = e.target.value;
              setFormData((prev) => ({ ...prev, gst_type: val }));
              recalculatePricing();
            }}
            options={[
              { value: 'intra_state', label: 'Intra-State (CGST + SGST)' },
              { value: 'inter_state', label: 'Inter-State (IGST)' },
            ]}
          />
        </div>
      </div>

      <div className="border-t border-slate-200 pt-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-6">Payment Details</h3>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Advance Paid</label>
            <Input
              type="number"
              value={formData.advance_paid || 0}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setFormData((prev) => ({ ...prev, advance_paid: val }));
                recalculatePricing();
              }}
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {/* Pricing Summary */}
      <div className="border-t border-slate-200 pt-8">
        <div className="bg-indigo-50 p-6 rounded-lg space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-700">Subtotal</span>
            <Currency amount={formData.subtotal} />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-700">Item Discounts</span>
            <Currency amount={-formData.total_item_discount} />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-700">Order Discount</span>
            <Currency amount={-formData.order_discount_amount} />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-700">Additional Charges</span>
            <Currency amount={formData.total_charges} />
          </div>
          <div className="border-t border-indigo-200 pt-3 flex justify-between text-sm font-semibold">
            <span className="text-slate-900">Taxable Amount</span>
            <Currency amount={formData.taxable_amount} />
          </div>

          {formData.gst_type === 'intra_state' ? (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">CGST (9%)</span>
                <Currency amount={formData.cgst_amount} />
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">SGST (9%)</span>
                <Currency amount={formData.sgst_amount} />
              </div>
            </>
          ) : (
            <div className="flex justify-between text-sm">
              <span className="text-slate-700">IGST (18%)</span>
              <Currency amount={formData.igst_amount} />
            </div>
          )}

          <div className="border-t border-indigo-300 pt-3 flex justify-between text-lg font-bold">
            <span className="text-slate-900">Grand Total</span>
            <Currency amount={formData.grand_total} />
          </div>
          <div className="border-t border-indigo-300 pt-3 flex justify-between text-sm">
            <span className="text-slate-700">Balance Due</span>
            <Currency amount={formData.balance_due} />
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="border-t border-slate-200 pt-8 space-y-4">
        <h3 className="text-lg font-semibold text-slate-900">Notes</h3>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Customer Notes</label>
          <Textarea
            value={formData.customer_notes}
            onChange={(e) => { const val = e.target.value; setFormData((prev) => ({ ...prev, customer_notes: val })); }}
            placeholder="Notes to be shared with customer..."
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Internal Notes</label>
          <Textarea
            value={formData.internal_notes}
            onChange={(e) => { const val = e.target.value; setFormData((prev) => ({ ...prev, internal_notes: val })); }}
            placeholder="Internal notes only..."
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Production Notes</label>
          <Textarea
            value={formData.production_notes}
            onChange={(e) => { const val = e.target.value; setFormData((prev) => ({ ...prev, production_notes: val })); }}
            placeholder="Special instructions for production..."
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}
