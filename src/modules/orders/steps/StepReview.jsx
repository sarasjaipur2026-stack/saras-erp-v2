import { Badge, Currency } from '../../../components/ui';

export function StepReview({
  formData,
  selectedCustomer,
  orderTypes,
  paymentTerms,
  chargeTypes,
  currencies,
}) {
  const getTypeLabel = (typeId, list) => list?.find((item) => item.id === typeId)?.name || 'N/A';

  return (
    <div className="space-y-8">
      {/* Customer Summary */}
      {selectedCustomer && (
        <div>
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Customer</h3>
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm text-slate-600">Name</p>
              <p className="font-semibold text-slate-900">{selectedCustomer.name}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Email</p>
              <p className="font-semibold text-slate-900">{selectedCustomer.email}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">Phone</p>
              <p className="font-semibold text-slate-900">{selectedCustomer.phone}</p>
            </div>
            <div>
              <p className="text-sm text-slate-600">GST Registration</p>
              <p className="font-semibold text-slate-900">{selectedCustomer.gst_no || 'N/A'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Order Details Summary */}
      <div className="border-t border-slate-200 pt-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Order Details</h3>
        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-lg">
          <div>
            <p className="text-sm text-slate-600">Order Type</p>
            <p className="font-semibold text-slate-900">{getTypeLabel(formData.order_type_id, orderTypes)}</p>
          </div>
          <div>
            <p className="text-sm text-slate-600">Order Nature</p>
            <Badge variant="info">{formData.nature}</Badge>
          </div>
          <div>
            <p className="text-sm text-slate-600">Priority</p>
            <Badge variant={formData.priority === 'urgent' ? 'error' : formData.priority === 'high' ? 'warning' : 'success'}>
              {formData.priority}
            </Badge>
          </div>
          <div>
            <p className="text-sm text-slate-600">Payment Terms</p>
            <p className="font-semibold text-slate-900">{getTypeLabel(formData.payment_terms_id, paymentTerms)}</p>
          </div>
          <div className="col-span-2">
            <p className="text-sm text-slate-600 mb-2">Delivery Dates</p>
            <div className="flex gap-4">
              {formData.delivery_date_1 && <Badge>{formData.delivery_date_1}</Badge>}
              {formData.delivery_date_2 && <Badge>{formData.delivery_date_2}</Badge>}
              {formData.delivery_date_3 && <Badge>{formData.delivery_date_3}</Badge>}
            </div>
          </div>
        </div>
      </div>

      {/* Line Items Summary */}
      <div className="border-t border-slate-200 pt-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Line Items ({formData.line_items?.length || 0})</h3>
        <div className="space-y-3">
          {(formData.line_items || []).map((item, idx) => (
            <div key={item.id} className="p-4 bg-slate-50 rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <p className="font-semibold text-slate-900">Item {idx + 1}</p>
                <Currency amount={item.amount} />
              </div>
              <p className="text-sm text-slate-600">
                {item.meters} meters @ {item.rate_per_unit}/unit
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing Summary */}
      <div className="border-t border-slate-200 pt-8">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Pricing Summary</h3>
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
            <span className="text-slate-700">Advance Paid</span>
            <Currency amount={formData.advance_paid} />
          </div>
          <div className="border-t border-indigo-300 pt-3 flex justify-between text-sm font-semibold">
            <span className="text-slate-900">Balance Due</span>
            <Currency amount={formData.balance_due} />
          </div>
        </div>
      </div>

      {/* Notes */}
      {(formData.customer_notes || formData.internal_notes || formData.production_notes) && (
        <div className="border-t border-slate-200 pt-8">
          <h3 className="text-lg font-semibold text-slate-900 mb-4">Notes</h3>
          <div className="space-y-4">
            {formData.customer_notes && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm font-semibold text-blue-900 mb-2">Customer Notes</p>
                <p className="text-sm text-blue-800">{formData.customer_notes}</p>
              </div>
            )}
            {formData.internal_notes && (
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm font-semibold text-amber-900 mb-2">Internal Notes</p>
                <p className="text-sm text-amber-800">{formData.internal_notes}</p>
              </div>
            )}
            {formData.production_notes && (
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <p className="text-sm font-semibold text-green-900 mb-2">Production Notes</p>
                <p className="text-sm text-green-800">{formData.production_notes}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
