import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
import { orders } from '../../lib/db';
import { Button, Spinner } from '../../components/ui';
import { StepCustomer } from './steps/StepCustomer';
import { StepLineItems } from './steps/StepLineItems';
import { StepPricingCharges } from './steps/StepPricingCharges';
import { StepReview } from './steps/StepReview';
import { useUnsavedChangesPrompt } from '../../hooks/useUnsavedChangesPrompt';
import {
  DEFAULT_ORDER,
  normalizeOrderForForm,
} from '../../lib/orderFormModel';

import { calculateOrderPricing } from '../../lib/orderPricing';

const STEPS = [
  { id: 1, name: 'Customer', icon: Users },
  { id: 2, name: 'Line Items', icon: Package },
  { id: 3, name: 'Pricing & Charges', icon: IndianRupee },
  { id: 4, name: 'Review & Save', icon: CheckCircle },
];

export default function OrderForm() {
  const navigate = useNavigate();
  const { id: orderId } = useParams();
  const [searchParams] = useSearchParams();
  const duplicateId = !orderId ? searchParams.get('duplicate') : null;
  const { profile } = useAuth();
  const { products, materials, machines, colors, orderTypes, paymentTerms, chargeTypes, currencies, brokers, hsnCodes } = useApp();
  const toast = useToast();
  const isEdit = !!orderId;
  const isDuplicate = !!duplicateId;
  const companyStateCode = profile?.gst_company_state_code || profile?.state_code || '08';

  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(isEdit || isDuplicate);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(DEFAULT_ORDER);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  const [validationErrors, setValidationErrors] = useState({});
  const [warnings, setWarnings] = useState([]);
  const [dirty, setDirty] = useState(false);
  const saveRequest = React.useRef(null);
  const savingRef = React.useRef(false);

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

  // Load an existing order for editing or pre-fill a safe, unsaved duplicate.
  useEffect(() => {
    const sourceId = orderId || duplicateId;
    if (!sourceId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    const loadOrder = async () => {
      setLoading(true);
      try {
        const { data: order, error } = await orders.get(sourceId);
        if (error) throw error;
        if (order && !cancelled) {
          if (isEdit && !['draft', 'booking'].includes(order.status)) {
            toast.error('This order has progressed. Use its production, dispatch and payment actions.');
            navigate(`/orders/${order.id}`);
            return;
          }
          const normalized = normalizeOrderForForm(order, { duplicate: isDuplicate });
          initialFormRef.current = isDuplicate
            ? JSON.stringify(DEFAULT_ORDER)
            : JSON.stringify(normalized);
          setFormData(normalized);
          setSelectedCustomer(order.customers || null);
          setDirty(isDuplicate);
        }
      } catch {
        if (!cancelled) {
          toast.error(isDuplicate ? 'Failed to load order to duplicate' : 'Failed to load order');
          navigate('/orders');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadOrder();
    return () => { cancelled = true; };
  }, [duplicateId, isDuplicate, isEdit, navigate, orderId, toast]);

  const handleCustomerSelect = async (customer) => {
    if (!customer) {
      setSelectedCustomer(null);
      setFormData((prev) => ({ ...prev, customer_id: null, shipping_address: null }));
      return;
    }
    const customerStateCode = customer.state_code || customer.gstin?.substring(0, 2);
    setSelectedCustomer(customer);
    setFormData((prev) => calculateOrderPricing({
      ...prev,
      customer_id: customer.id,
      shipping_address: customer.shipping_addresses?.[0] || null,
      gst_type: customerStateCode && customerStateCode !== companyStateCode ? 'inter_state' : 'intra_state',
    }, products, hsnCodes));

    // Smart defaults — pre-fill order_type / payment_terms / broker /
    // currency / priority / nature from this customer's most recent order,
    // but ONLY when those fields are still empty (never overwrite user input).
    // Silent on failure; user can edit anything manually.
    if (!isEdit && customer.id) {
      try {
        const { data: last } = await orders.getLastForCustomer(customer.id);
        if (last) {
          setFormData((prev) => prev.customer_id !== customer.id ? prev : ({
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
      gst_rate: 18,
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
    setFormData(prev => calculateOrderPricing({
      ...prev,
      line_items: lineItemsOverride || prev.line_items,
      charges: chargesOverride || prev.charges,
    }, products, hsnCodes));
  }, [products, hsnCodes]);

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
        if (item.line_type === 'stock') {
          if (!item.material_id) errors[`lineItemProduct${idx}`] = `Line item ${idx + 1}: Material is required`;
        } else if (!item.product_id) {
          errors[`lineItemProduct${idx}`] = `Line item ${idx + 1}: Product is required`;
        }

        const quantityFieldCount = [item.quantity, item.meters, item.weight_kg]
          .filter((value) => Number(value) > 0).length;
        if (quantityFieldCount !== 1) {
          errors[`lineItemQuantity${idx}`] = `Line item ${idx + 1}: Enter exactly one quantity — meters, weight or pieces`;
        }
        if (!item.rate_per_unit || item.rate_per_unit <= 0) {
          newWarnings.push(`Line item ${idx + 1}: Rate must be greater than 0`);
        }
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

  const saveOrder = async (draft) => {
    if (savingRef.current) return;
    if (!formData.customer_id) { toast.error('Please select a customer first'); return; }
    if (!draft && ![1, 2, 4].every(step => validateStep(step))) {
      toast.error('Please complete the customer and line item details'); return;
    }
    const status = isEdit && formData.status !== 'draft'
      ? formData.status : draft ? 'draft' : 'booking';
    const priced = calculateOrderPricing(formData, products, hsnCodes);
    // Preserve the request ID after an ambiguous network failure so retry cannot duplicate an order.
    const fingerprint = JSON.stringify({ orderId, priced, status });
    if (!saveRequest.current || saveRequest.current.fingerprint !== fingerprint) {
      saveRequest.current = { fingerprint, id: crypto.randomUUID() };
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const { data, error } = await orders.save(priced, status, orderId, saveRequest.current.id);
      if (error) throw error;
      setDirty(false);
      toast.success(draft ? 'Order saved' : isEdit ? 'Order updated' : 'Order created');
      navigate('/orders/' + data.id);
    } catch (error) {
      toast.error('Could not save order: ' + error.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const handleSaveDraft = () => saveOrder(true);
  const handleCreateOrder = () => saveOrder(false);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[55vh]" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3 text-sm font-medium text-slate-500">
          <Spinner />
          Preparing order workspace…
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in max-w-6xl mx-auto pb-20 sm:pb-24">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600 mb-2">Order workspace</div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">
              {isEdit ? 'Edit Order' : isDuplicate ? 'Duplicate Order' : 'Create New Order'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {isEdit
                ? `Order #${formData.order_number || ''}`
                : isDuplicate
                  ? 'Review the copied details, then save this as a new order'
                  : 'Add the customer, line items and pricing in four guided steps.'}
            </p>
          </div>
          <div className="inline-flex self-start sm:self-auto items-center gap-2 px-3 py-2 rounded-xl bg-white border border-slate-200/80 shadow-sm text-xs font-semibold text-slate-600">
            <span className="w-2 h-2 rounded-full bg-indigo-500" /> Step {currentStep} of {STEPS.length}
          </div>
        </div>

        {/* Step Indicator — scrollable on narrow screens so phone users can see all 4 steps */}
        <nav aria-label="Order creation progress" className="mb-6 sm:mb-8 bg-white border border-slate-200/80 rounded-2xl p-3 sm:p-4 shadow-sm shadow-slate-100 overflow-x-auto">
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden mb-4 min-w-[500px]" aria-hidden="true">
            <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full transition-all duration-300" style={{ width: `${(currentStep / STEPS.length) * 100}%` }} />
          </div>
          <div className="flex items-center justify-between min-w-[500px]">
            {STEPS.map((step, idx) => {
              const Icon = step.icon;
              const isActive = step.id === currentStep;
              const isCompleted = step.id < currentStep;

              return (
                <React.Fragment key={step.id}>
                  <button
                    type="button"
                    disabled={!isCompleted}
                    aria-current={isActive ? 'step' : undefined}
                    aria-label={`${step.name}${isActive ? ', current step' : isCompleted ? ', completed' : ', upcoming'}`}
                    className={`flex flex-col items-center rounded-xl px-2 py-1 focus-ring transition-opacity ${
                      isActive ? 'opacity-100' : isCompleted ? 'opacity-100 cursor-pointer' : 'opacity-50 cursor-default'
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
                  </button>

                  {idx < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-2 sm:mx-4 mb-6 sm:mb-8 rounded-full transition-all ${
                        isCompleted ? 'bg-emerald-500' : 'bg-slate-200'
                      }`}
                    />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </nav>

        {/* Validation Errors */}
        {Object.keys(validationErrors).length > 0 && (
          <div role="alert" className="mb-6 p-4 bg-red-50 border border-red-200 rounded-2xl">
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
          <div role="status" className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
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
        <div className="bg-white rounded-2xl shadow-soft border border-slate-200/80 p-4 sm:p-6 lg:p-8 mb-6 sm:mb-8">
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
        <div className="sticky bottom-3 z-10 -mx-2 sm:mx-0 px-3 sm:px-4 py-3 bg-white/90 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-soft-lg flex flex-col-reverse sm:flex-row gap-3 sm:items-center sm:justify-between">
          <Button
            onClick={handlePrevStep}
            disabled={currentStep === 1}
            variant="secondary"
          >
            <ChevronLeft size={16} />
            Previous
          </Button>

          <div className="flex flex-col-reverse sm:flex-row gap-2 sm:gap-3">
            {currentStep < STEPS.length && (
              <Button
                onClick={handleSaveDraft}
                variant="secondary"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save draft'}
              </Button>
            )}

            {currentStep === STEPS.length ? (
              <Button
                onClick={handleCreateOrder}
                disabled={saving}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {saving ? 'Saving…' : isEdit ? 'Update order' : 'Create order'}
              </Button>
            ) : (
              <Button
                onClick={handleNextStep}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                Continue to {STEPS[currentStep].name}
                <ChevronRight size={16} />
              </Button>
            )}
          </div>
        </div>
    </div>
  );
}
