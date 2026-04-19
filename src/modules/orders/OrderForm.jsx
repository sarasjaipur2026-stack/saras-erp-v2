import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Users,
  Package,
  IndianRupee,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { orders, lineItems, orderCharges } from '../../lib/db';
import { Button, Spinner } from '../../components/ui';
import { StepCustomer } from './steps/StepCustomer';
import { StepLineItems } from './steps/StepLineItems';
import { StepPricingCharges } from './steps/StepPricingCharges';
import { StepReview } from './steps/StepReview';
import { useUnsavedChangesPrompt } from '../../hooks/useUnsavedChangesPrompt';

const STEPS = [
  { id: 1, name: 'Customer', icon: Users },
  { id: 2, name: 'Line Items', icon: Package },
  { id: 3, name: 'Pricing & Charges', icon: IndianRupee },
  { id: 4, name: 'Review & Save', icon: CheckCircle },
];

const DEFAULT_ORDER = {
  customer_id: null,
  order_type_id: null,
  broker_id: null,
  payment_terms_id: null,
  priority: 'normal',
  nature: 'sample',
  currency_code: 'INR',
  delivery_date_1: null,
  delivery_date_2: null,
  delivery_date_3: null,
  subtotal: 0,
  total_charges: 0,
  total_item_discount: 0,
  order_discount_type: 'flat',
  order_discount_value: 0,
  order_discount_amount: 0,
  taxable_amount: 0,
  cgst_amount: 0,
  sgst_amount: 0,
  igst_amount: 0,
  gst_type: 'intra_state',
  grand_total: 0,
  advance_paid: 0,
  balance_due: 0,
  customer_notes: '',
  internal_notes: '',
  production_notes: '',
  shipping_address: null,
  status: 'draft',
  line_items: [],
  charges: [],
};

export default function OrderForm() {
  const navigate = useNavigate();
  const { id: orderId } = useParams();
  // eslint-disable-next-line no-unused-vars
  const { user } = useAuth();
  const { products, materials, machines, colors, orderTypes, paymentTerms, chargeTypes, currencies, brokers, hsnCodes, ensureDeferred } = useApp();
  useEffect(() => { ensureDeferred() }, [ensureDeferred]);
  const toast = useToast();
  const isEdit = !!orderId;

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_ORDER);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [dirty, setDirty] = useState(false);

  // Warn on navigation away when form has unsaved changes
  useUnsavedChangesPrompt(dirty && !saving);

  // Mark dirty on any user change to form data. Skips the initial mount so
  // loading an existing order in edit mode doesn't flip dirty.
  const initialFormRef = React.useRef(null);
  useEffect(() => {
    if (initialFormRef.current === null) {
      initialFormRef.current = JSON.stringify(formData);
      return;
    }
    if (JSON.stringify(formData) !== initialFormRef.current) setDirty(true);
  }, [formData]);

  // Load order if editing
  useEffect(() => {
    if (isEdit && loading) {
      const loadOrder = async () => {
        try {
          const { data: order, error } = await orders.get(orderId);
          if (error) throw error;
          if (order) {
            setFormData(order);
            setSelectedCustomer(order.customer);
          }
        // eslint-disable-next-line no-unused-vars
        } catch (error) {
          toast.error('Failed to load order');
          navigate('/orders');
        } finally {
          setLoading(false);
        }
      };
      loadOrder();
    } else if (!isEdit) {
      setLoading(false);
    }
  }, [isEdit, orderId]);

  const handleCustomerSelect = async (customer) => {
    setSelectedCustomer(customer);
    setFormData((prev) => ({
      ...prev,
      customer_id: customer.id,
      shipping_address: customer.shipping_addresses?.[0] || null,
      gst_type: customer.state_code === prev.state_code ? 'intra_state' : 'inter_state',
    }));

    // Smart defaults — pre-fill order_type / payment_terms / broker /
    // currency / priority / nature from this customer's most recent order,
    // but ONLY when those fields are still empty (never overwrite user input).
    // Silent on failure; user can edit anything manually.
    if (!isEdit && customer.id) {
      try {
        const { data: last } = await orders.getLastForCustomer(customer.id);
        if (last) {
          setFormData((prev) => ({
            ...prev,
            order_type_id:   prev.order_type_id   || last.order_type_id   || prev.order_type_id,
            payment_terms_id: prev.payment_terms_id || last.payment_terms_id || prev.payment_terms_id,
            broker_id:       prev.broker_id       || last.broker_id       || prev.broker_id,
            currency_id:     prev.currency_id     || last.currency_id     || prev.currency_id,
            priority:        prev.priority && prev.priority !== 'normal' ? prev.priority : (last.priority || prev.priority),
            nature:          prev.nature && prev.nature !== 'production'  ? prev.nature  : (last.nature   || prev.nature),
          }));
        }
      } catch {
        // Silent — defaults are a nice-to-have, never block customer selection
      }
    }
  };

  const handleAddLineItem = useCallback(() => {
    const newItem = {
      id: `temp_${Date.now()}`,
      sort_order: (formData.line_items?.length || 0) + 1,
      line_type: 'production',
      product_id: null,
      material_id: null,
      machine_id: null,
      color_id: null,
      width_cm: 0,
      meters: 0,
      weight_kg: 0,
      rate_per_unit: 0,
      amount: 0,
      item_discount_type: 'flat',
      item_discount_value: 0,
      item_discount_amount: 0,
      gst_rate: 0,
      gst_amount: 0,
      instructions: '',
    };
    setFormData((prev) => ({
      ...prev,
      line_items: [...(prev.line_items || []), newItem],
    }));
    setExpandedItems((prev) => ({ ...prev, [newItem.id]: true }));
  }, [formData.line_items]);

  const handleUpdateLineItem = (itemId, updates) => {
    const updatedItems = (formData.line_items || []).map((item) =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    recalculatePricing(updatedItems);
  };

  const handleRemoveLineItem = (itemId) => {
    const updatedItems = (formData.line_items || []).filter((item) => item.id !== itemId);
    setExpandedItems((prev) => {
      const { [itemId]: _, ...rest } = prev;
      return rest;
    });
    recalculatePricing(updatedItems);
  };

  const handleReorderLineItems = (itemId, direction) => {
    setFormData((prev) => {
      const items = [...prev.line_items];
      const currentIdx = items.findIndex((item) => item.id === itemId);
      if (currentIdx === -1) return prev;

      const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
      if (targetIdx < 0 || targetIdx >= items.length) return prev;

      [items[currentIdx], items[targetIdx]] = [items[targetIdx], items[currentIdx]];
      const reordered = items.map((item, idx) => ({ ...item, sort_order: idx + 1 }));

      return { ...prev, line_items: reordered };
    });
  };

  const handleAddCharge = useCallback(() => {
    const newCharge = {
      id: `temp_${Date.now()}`,
      charge_type_id: null,
      scope: 'per_order',
      amount: 0,
      is_taxable: false,
    };
    setFormData((prev) => ({
      ...prev,
      charges: [...(prev.charges || []), newCharge],
    }));
  }, []);

  const handleUpdateCharge = (chargeId, updates) => {
    const updatedCharges = (formData.charges || []).map((charge) =>
      charge.id === chargeId ? { ...charge, ...updates } : charge
    );
    recalculatePricing(null, updatedCharges);
  };

  const handleRemoveCharge = (chargeId) => {
    const updatedCharges = (formData.charges || []).filter((charge) => charge.id !== chargeId);
    recalculatePricing(null, updatedCharges);
  };

  const recalculatePricing = useCallback((lineItemsOverride = null, chargesOverride = null) => {
    setFormData((prev) => {
      const items = lineItemsOverride || prev.line_items || [];
      const chargesList = chargesOverride || prev.charges || [];

      let subtotal = 0;
      let totalItemDiscount = 0;
      let totalTaxable = 0;
      let totalTax = 0;
      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      // Determine interstate vs intrastate from the locally-selected customer.
      // (Previously this did customers.find(...) on a 3,400-row preloaded array,
      //  which was the biggest page-load cost. Now selectedCustomer is populated
      //  by CustomerSearch / order load and carries state_code + gstin directly.)
      const customerState = selectedCustomer?.state_code || selectedCustomer?.gstin?.substring(0, 2);
      const companyState = '08'; // Rajasthan — pull from app_settings later
      const isInterstate = customerState && customerState !== companyState;

      // Calculate tax per line item using HSN-based GST rates
      items.forEach((item) => {
        subtotal += item.amount || 0;
        totalItemDiscount += item.item_discount_amount || 0;

        // Look up GST rate: product -> hsn_code -> hsnCodes table -> gst_rate
        const product = products?.find((p) => p.id === item.product_id);
        const hsnCode = hsnCodes?.find((h) => h.code === product?.hsn_code);
        const gstRate = hsnCode?.gst_rate ?? product?.gst_rate ?? 18; // default 18%

        const itemTaxable = (item.amount || 0) - (item.item_discount_amount || 0);
        const itemTax = itemTaxable * (gstRate / 100);
        totalTax += itemTax;
      });

      const totalCharges = chargesList.reduce((sum, charge) => sum + (charge.amount || 0), 0);

      let orderDiscountAmount = prev.order_discount_amount || 0;
      if (prev.order_discount_type === 'percent') {
        orderDiscountAmount = (subtotal * (prev.order_discount_value || 0)) / 100;
      }

      totalTaxable = subtotal - totalItemDiscount - orderDiscountAmount + totalCharges;

      // Tax on charges/order-level adjustments using weighted average rate
      const itemSubtotalNet = subtotal - totalItemDiscount;
      const avgGstRate = itemSubtotalNet > 0 ? (totalTax / itemSubtotalNet) : 0.18;
      const adjustmentTaxable = totalCharges - orderDiscountAmount;
      totalTax += adjustmentTaxable * avgGstRate;

      // Split tax into CGST/SGST or IGST based on interstate determination
      if (isInterstate) {
        cgst = 0;
        sgst = 0;
        igst = totalTax;
      } else {
        cgst = totalTax / 2;
        sgst = totalTax / 2;
        igst = 0;
      }

      const grandTotal = totalTaxable + cgst + sgst + igst;

      return {
        ...prev,
        line_items: items,
        charges: chargesList,
        gst_type: isInterstate ? 'inter_state' : 'intra_state',
        subtotal,
        total_item_discount: totalItemDiscount,
        total_charges: totalCharges,
        order_discount_amount: orderDiscountAmount,
        taxable_amount: totalTaxable,
        cgst_amount: cgst,
        sgst_amount: sgst,
        igst_amount: igst,
        grand_total: grandTotal,
        balance_due: grandTotal - (prev.advance_paid || 0),
      };
    });
  }, [selectedCustomer, products, hsnCodes]);

  const validateStep = (step) => {
    const errors = {};
    const newWarnings = [];

    if (step === 1) {
      if (!formData.customer_id) errors.customer = 'Customer is required';
      if (!formData.order_type_id) errors.orderType = 'Order type is required';
      if (!formData.payment_terms_id) errors.paymentTerms = 'Payment terms are required';
    }

    if (step === 2) {
      if (!formData.line_items || !formData.line_items.length) {
        errors.lineItems = 'At least one line item is required';
      }
      (formData.line_items || []).forEach((item, idx) => {
        if (!item.product_id) newWarnings.push(`Line item ${idx + 1}: Product not selected`);
        if (!item.meters || item.meters <= 0) newWarnings.push(`Line item ${idx + 1}: Meters must be greater than 0`);
      });
    }

    if (step === 4) {
      if (!formData.customer_id) errors.customer = 'Customer is required';
      if (!formData.line_items || !formData.line_items.length) errors.lineItems = 'At least one line item is required';
    }

    setValidationErrors(errors);
    setWarnings(newWarnings);
    return Object.keys(errors).length === 0;
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, STEPS.length));
    }
  };

  const handlePrevStep = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const { line_items: _li, charges: _ch, customer: _cust, ...orderFields } = formData;
      const draftData = { ...orderFields, status: 'draft' };

      let finalOrderId;
      if (isEdit) {
        const { error } = await orders.update(orderId, draftData);
        if (error) throw error;
        finalOrderId = orderId;
      } else {
        if (!draftData.customer_id) {
          toast.error('Please select a customer first');
          setSaving(false);
          return;
        }
        const { data: newOrder, error } = await orders.create(draftData);
        if (error) throw error;
        finalOrderId = newOrder.id;
      }

      // Save line items
      const linesToCreate = (formData.line_items || []).filter((item) => item.id?.toString().startsWith('temp_'));
      if (linesToCreate.length > 0) {
        const { error } = await lineItems.createMany(
          linesToCreate.map((item) => ({ order_id: finalOrderId, ...item, id: undefined }))
        );
        if (error) {
          toast.error('Draft saved but line items failed — please edit and retry.');
          navigate(`/orders/${finalOrderId}/edit`);
          return;
        }
      }

      // Save charges
      const chargesToCreate = (formData.charges || []).filter((charge) => charge.id?.toString().startsWith('temp_'));
      if (chargesToCreate.length > 0) {
        const { error } = await orderCharges.createMany(
          chargesToCreate.map((charge) => ({ order_id: finalOrderId, ...charge, id: undefined }))
        );
        if (error) {
          toast.error('Draft & items saved but charges failed — please re-add charges');
        }
      }

      if (isEdit) {
        toast.success('Order updated as draft');
      } else {
        navigate(`/orders/${finalOrderId}`);
        toast.success('Draft saved');
      }
    } catch (error) {
      toast.error('Failed to save draft: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!validateStep(4)) {
      toast.error('Please fix validation errors');
      return;
    }

    setSaving(true);
    try {
      const { line_items: _li, charges: _ch, customer: _cust, ...orderFields } = formData;
      // 'booking' is the first non-draft state per ALLOWED_TRANSITIONS in orders.js.
      // Previously used 'confirmed' which isn't in the state machine and stranded orders.
      const orderData = { ...orderFields, status: 'booking' };

      let finalOrderId;
      if (isEdit) {
        const { error } = await orders.update(orderId, orderData);
        if (error) throw error;
        finalOrderId = orderId;
        toast.success('Order updated');
      } else {
        const { data: newOrder, error } = await orders.create(orderData);
        if (error) throw error;
        finalOrderId = newOrder.id;
        toast.success('Order created');
      }

      // Insert line items and charges. If either fails, revert order to draft
      // so partial data is obvious and recoverable.
      const linesToCreate = (formData.line_items || []).filter((item) => item.id?.toString().startsWith('temp_'));
      if (linesToCreate.length > 0) {
        const { error } = await lineItems.createMany(
          linesToCreate.map((item) => ({ order_id: finalOrderId, ...item, id: undefined }))
        );
        if (error) {
          await orders.update(finalOrderId, { status: 'draft' });
          toast.error('Order saved but line items failed — saved as draft. Please edit and retry.');
          navigate(`/orders/${finalOrderId}/edit`);
          return;
        }
      }

      const chargesToCreate = (formData.charges || []).filter((charge) => charge.id?.toString().startsWith('temp_'));
      if (chargesToCreate.length > 0) {
        const { error } = await orderCharges.createMany(
          chargesToCreate.map((charge) => ({ order_id: finalOrderId, ...charge, id: undefined }))
        );
        if (error) {
          toast.error('Order & items saved but charges failed — please re-add charges');
        }
      }

      navigate('/orders');
    } catch (error) {
      toast.error('Failed to create order: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
            {isEdit ? 'Edit Order' : 'Create New Order'}
          </h1>
          <p className="text-sm sm:text-base text-slate-600">
            {isEdit ? `Order #${formData.order_number}` : 'Follow the steps to create a new order'}
          </p>
        </div>

        {/* Step Indicator — scrollable on narrow screens so phone users can see all 4 steps */}
        <div className="mb-6 sm:mb-8 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="flex items-center justify-between min-w-[500px]">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;

              return (
                <React.Fragment key={step.id}>
                  <div
                    className={`flex flex-col items-center cursor-pointer transition-all ${
                      isActive ? 'opacity-100' : isCompleted ? 'opacity-100' : 'opacity-50'
                    }`}
                    onClick={() => {
                      if (step.id < currentStep) {
                        setCurrentStep(step.id);
                      }
                    }}
                  >
                    <div
                      className={`w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center mb-1.5 sm:mb-2 transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : isCompleted
                          ? 'bg-green-100 text-green-600'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {isCompleted ? <CheckCircle size={20} /> : <Icon size={20} />}
                    </div>
                    <span className="text-[11px] sm:text-sm font-medium text-slate-900 whitespace-nowrap">{step.name}</span>
                  </div>

                  {idx < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-2 sm:mx-4 mb-6 sm:mb-8 rounded-full transition-all ${
                        isCompleted ? 'bg-green-600' : 'bg-slate-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Validation Errors */}
        {Object.keys(validationErrors).length > 0 && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl">
            <div className="flex gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-semibold text-red-900 mb-2">Validation Errors</h3>
                <ul className="text-sm text-red-700 space-y-1">
                  {Object.values(validationErrors).map((error, idx) => (
                    <li key={idx}>• {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
            <div className="flex gap-3">
              <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <h3 className="font-semibold text-amber-900 mb-2">Warnings</h3>
                <ul className="text-sm text-amber-700 space-y-1">
                  {warnings.map((warning, idx) => (
                    <li key={idx}>• {warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Step Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 mb-8">
          {currentStep === 1 && (
            <StepCustomer
              formData={formData}
              setFormData={setFormData}
              selectedCustomer={selectedCustomer}
              onCustomerSelect={handleCustomerSelect}
              orderTypes={orderTypes}
              paymentTerms={paymentTerms}
              brokers={brokers}
              currencies={currencies}
            />
          )}

          {currentStep === 2 && (
            <StepLineItems
              formData={formData}
              onAddItem={handleAddLineItem}
              onUpdateItem={handleUpdateLineItem}
              onRemoveItem={handleRemoveLineItem}
              onReorder={handleReorderLineItems}
              expandedItems={expandedItems}
              setExpandedItems={setExpandedItems}
              products={products}
              materials={materials}
              machines={machines}
              colors={colors}
            />
          )}

          {currentStep === 3 && (
            <StepPricingCharges
              formData={formData}
              setFormData={setFormData}
              onAddCharge={handleAddCharge}
              onUpdateCharge={handleUpdateCharge}
              onRemoveCharge={handleRemoveCharge}
              chargeTypes={chargeTypes}
              recalculatePricing={recalculatePricing}
            />
          )}

          {currentStep === 4 && (
            <StepReview
              formData={formData}
              selectedCustomer={selectedCustomer}
              orderTypes={orderTypes}
              paymentTerms={paymentTerms}
              chargeTypes={chargeTypes}
              currencies={currencies}
            />
          )}
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between">
          <Button
            onClick={handlePrevStep}
            disabled={currentStep === 1}
            variant="secondary"
          >
            <ChevronLeft size={16} />
            Previous
          </Button>

          <div className="flex gap-4">
            {currentStep < STEPS.length && (
              <Button
                onClick={handleSaveDraft}
                variant="secondary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save as Draft'}
              </Button>
            )}

            {currentStep === STEPS.length ? (
              <Button
                onClick={handleCreateOrder}
                disabled={saving}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {saving ? 'Creating...' : isEdit ? 'Update Order' : 'Create Order'}
              </Button>
            ) : (
              <Button
                onClick={handleNextStep}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Next
                <ChevronRight size={16} />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
