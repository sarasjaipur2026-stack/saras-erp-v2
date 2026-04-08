import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Users,
  Package,
  IndianRupee,
  CheckCircle,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useApp } from '../../contexts/AppContext';
import { useToast } from '../../contexts/ToastContext';
import { orders, lineItems, orderCharges } from '../../lib/db';
import { Button, Input, Select, Textarea, Modal, Badge, Currency, Spinner } from '../../components/ui';
import { CustomerSearch } from './components/CustomerSearch';
import { LineItemRow } from './components/LineItemRow';

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
  order_nature: 'sample',
  currency_id: null,
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
  const { user } = useAuth();
  const { products, materials, machines, colors, orderTypes, paymentTerms, chargeTypes, currencies, brokers } = useApp();
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

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setFormData((prev) => ({
      ...prev,
      customer_id: customer.id,
      shipping_address: customer.shipping_addresses?.[0] || null,
      gst_type: customer.state_code === prev.state_code ? 'intra_state' : 'inter_state',
    }));
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
    setFormData((prev) => ({
      ...prev,
      line_items: prev.line_items.map((item) =>
        item.id === itemId ? { ...item, ...updates } : item
      ),
    }));
    recalculatePricing();
  };

  const handleRemoveLineItem = (itemId) => {
    setFormData((prev) => ({
      ...prev,
      line_items: prev.line_items.filter((item) => item.id !== itemId),
    }));
    setExpandedItems((prev) => {
      const { [itemId]: _, ...rest } = prev;
      return rest;
    });
    recalculatePricing();
  };

  const handleReorderLineItems = (itemId, direction) => {
    setFormData((prev) => {
      const items = [...prev.line_items];
      const currentIdx = items.findIndex((item) => item.id === itemId);
      if (currentIdx === -1) return prev;

      const targetIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
      if (targetIdx < 0 || targetIdx >= items.length) return prev;

      [items[currentIdx], items[targetIdx]] = [items[targetIdx], items[currentIdx]];
      items.forEach((item, idx) => {
        item.sort_order = idx + 1;
      });

      return { ...prev, line_items: items };
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
    setFormData((prev) => ({
      ...prev,
      charges: prev.charges.map((charge) =>
        charge.id === chargeId ? { ...charge, ...updates } : charge
      ),
    }));
    recalculatePricing();
  };

  const handleRemoveCharge = (chargeId) => {
    setFormData((prev) => ({
      ...prev,
      charges: prev.charges.filter((charge) => charge.id !== chargeId),
    }));
    recalculatePricing();
  };

  const recalculatePricing = () => {
    setFormData((prev) => {
      let subtotal = 0;
      let totalItemDiscount = 0;
      let totalTaxable = 0;
      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      // Calculate line items totals
      (prev.line_items || []).forEach((item) => {
        subtotal += item.amount || 0;
        totalItemDiscount += item.item_discount_amount || 0;
      });

      // Calculate charges
      const totalCharges = (prev.charges || []).reduce((sum, charge) => sum + (charge.amount || 0), 0);

      // Apply order discount
      let orderDiscountAmount = prev.order_discount_amount || 0;
      if (prev.order_discount_type === 'percent') {
        orderDiscountAmount = (subtotal * (prev.order_discount_value || 0)) / 100;
      }

      // Calculate taxable amount
      totalTaxable = subtotal - totalItemDiscount - orderDiscountAmount + totalCharges;

      // Calculate GST
      const gstRate = prev.gst_type === 'intra_state' ? 9 : 0; // 9% CGST + 9% SGST for intra, 0 for inter (18% IGST)
      if (prev.gst_type === 'intra_state') {
        cgst = (totalTaxable * gstRate) / 100;
        sgst = (totalTaxable * gstRate) / 100;
      } else {
        igst = (totalTaxable * 18) / 100;
      }

      const grandTotal = totalTaxable + cgst + sgst + igst;

      return {
        ...prev,
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
  };

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
      const draftData = {
        ...formData,
        status: 'draft',
      };

      if (isEdit) {
        const { error } = await orders.update(orderId, draftData);
        if (error) throw error;
        toast.success('Order updated as draft');
      } else {
        const { data: newOrder, error } = await orders.create(draftData);
        if (error) throw error;
        navigate(`/orders/${newOrder.id}`);
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
      const orderData = {
        ...formData,
        status: 'confirmed',
      };

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

      // Create line items
      const linesToCreate = (formData.line_items || []).filter((item) => item.id?.toString().startsWith('temp_'));
      if (linesToCreate.length > 0) {
        const { error } = await lineItems.createMany(
          linesToCreate.map((item) => ({
            order_id: finalOrderId,
            ...item,
            id: undefined, // Remove temp ID
          }))
        );
        if (error) throw error;
      }

      // Create charges
      const chargesToCreate = (formData.charges || []).filter((charge) => charge.id?.toString().startsWith('temp_'));
      if (chargesToCreate.length > 0) {
        const { error } = await orderCharges.createMany(
          chargesToCreate.map((charge) => ({
            order_id: finalOrderId,
            ...charge,
            id: undefined, // Remove temp ID
          }))
        );
        if (error) throw error;
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
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {isEdit ? 'Edit Order' : 'Create New Order'}
          </h1>
          <p className="text-slate-600">
            {isEdit ? `Order #${formData.order_number}` : 'Follow the steps to create a new order'}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
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
                      className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : isCompleted
                          ? 'bg-green-100 text-green-600'
                          : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {isCompleted ? <CheckCircle size={24} /> : <Icon size={24} />}
                    </div>
                    <span className="text-sm font-medium text-slate-900">{step.name}</span>
                  </div>

                  {idx < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-4 mb-8 rounded-full transition-all ${
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

// Step 1: Customer
function StepCustomer({
  formData,
  setFormData,
  selectedCustomer,
  onCustomerSelect,
  orderTypes,
  paymentTerms,
  brokers,
  currencies,
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-2">Customer</label>
        <CustomerSearch onSelect={onCustomerSelect} value={selectedCustomer} />
      </div>

      {selectedCustomer && (
        <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-200">
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Order Type</label>
            <Select
              value={formData.order_type_id || ''}
              onChange={(e) => setFormData({ ...formData, order_type_id: e.target.value })}
            >
              <option value="">Select order type</option>
              {orderTypes?.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Order Nature</label>
            <Select
              value={formData.order_nature}
              onChange={(e) => setFormData({ ...formData, order_nature: e.target.value })}
            >
              <option value="sample">Sample</option>
              <option value="production">Production</option>
              <option value="export">Export</option>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Priority</label>
            <Select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
            >
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Payment Terms</label>
            <Select
              value={formData.payment_terms_id || ''}
              onChange={(e) => setFormData({ ...formData, payment_terms_id: e.target.value })}
            >
              <option value="">Select payment terms</option>
              {paymentTerms?.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Broker</label>
            <Select
              value={formData.broker_id || ''}
              onChange={(e) => setFormData({ ...formData, broker_id: e.target.value })}
            >
              <option value="">Select broker (optional)</option>
              {brokers?.map((broker) => (
                <option key={broker.id} value={broker.id}>
                  {broker.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">Currency</label>
            <Select
              value={formData.currency_id || ''}
              onChange={(e) => setFormData({ ...formData, currency_id: e.target.value })}
            >
              <option value="">Select currency</option>
              {currencies?.map((currency) => (
                <option key={currency.id} value={currency.id}>
                  {currency.code}
                </option>
              ))}
            </Select>
          </div>

          <div className="col-span-2 pt-6 border-t border-slate-200">
            <label className="block text-sm font-semibold text-slate-900 mb-4">Delivery Dates</label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Input
                  type="date"
                  value={formData.delivery_date_1 || ''}
                  onChange={(e) => setFormData({ ...formData, delivery_date_1: e.target.value })}
                  placeholder="Delivery Date 1"
                />
              </div>
              <div>
                <Input
                  type="date"
                  value={formData.delivery_date_2 || ''}
                  onChange={(e) => setFormData({ ...formData, delivery_date_2: e.target.value })}
                  placeholder="Delivery Date 2 (optional)"
                />
              </div>
              <div>
                <Input
                  type="date"
                  value={formData.delivery_date_3 || ''}
                  onChange={(e) => setFormData({ ...formData, delivery_date_3: e.target.value })}
                  placeholder="Delivery Date 3 (optional)"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Step 2: Line Items
function StepLineItems({
  formData,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onReorder,
  expandedItems,
  setExpandedItems,
  products,
  materials,
  machines,
  colors,
}) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-900">Order Line Items</h3>
        <Button onClick={onAddItem} className="bg-indigo-600 text-white hover:bg-indigo-700">
          <Plus size={16} />
          Add Item
        </Button>
      </div>

      {(!formData.line_items || formData.line_items.length === 0) ? (
        <div className="text-center py-8 text-slate-500">
          <Package size={32} className="mx-auto mb-2 opacity-50" />
          <p>No line items added yet. Click "Add Item" to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {formData.line_items.map((item, idx) => (
            <LineItemRow
              key={item.id}
              item={item}
              index={idx}
              isExpanded={expandedItems[item.id]}
              onToggle={() =>
                setExpandedItems((prev) => ({
                  ...prev,
                  [item.id]: !prev[item.id],
                }))
              }
              onUpdate={(updates) => onUpdateItem(item.id, updates)}
              onRemove={() => onRemoveItem(item.id)}
              onMoveUp={() => onReorder(item.id, 'up')}
              onMoveDown={() => onReorder(item.id, 'down')}
              canMoveUp={idx > 0}
              canMoveDown={idx < formData.line_items.length - 1}
              products={products}
              materials={materials}
              machines={machines}
              colors={colors}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Step 3: Pricing & Charges
function StepPricingCharges({
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Charge Type</label>
                  <Select
                    value={charge.charge_type_id || ''}
                    onChange={(e) => onUpdateCharge(charge.id, { charge_type_id: e.target.value })}
                  >
                    <option value="">Select charge type</option>
                    {chargeTypes?.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </Select>
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
                  <label className="block text-sm font-medium text-slate-700 mb-1">Scope</label>
                  <Select
                    value={charge.scope}
                    onChange={(e) => onUpdateCharge(charge.id, { scope: e.target.value })}
                  >
                    <option value="per_order">Per Order</option>
                    <option value="per_item">Per Item</option>
                  </Select>
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Discount Type</label>
            <Select
              value={formData.order_discount_type}
              onChange={(e) => {
                setFormData({ ...formData, order_discount_type: e.target.value });
                recalculatePricing();
              }}
            >
              <option value="flat">Flat Amount</option>
              <option value="percent">Percentage</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              {formData.order_discount_type === 'percent' ? 'Percentage (%)' : 'Amount'}
            </label>
            <Input
              type="number"
              value={formData.order_discount_value || 0}
              onChange={(e) => {
                setFormData({ ...formData, order_discount_value: parseFloat(e.target.value) });
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">GST Type</label>
            <Select
              value={formData.gst_type}
              onChange={(e) => {
                setFormData({ ...formData, gst_type: e.target.value });
                recalculatePricing();
              }}
            >
              <option value="intra_state">Intra-State (CGST + SGST)</option>
              <option value="inter_state">Inter-State (IGST)</option>
            </Select>
          </div>
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
                setFormData({ ...formData, advance_paid: parseFloat(e.target.value) });
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
            onChange={(e) => setFormData({ ...formData, customer_notes: e.target.value })}
            placeholder="Notes to be shared with customer..."
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Internal Notes</label>
          <Textarea
            value={formData.internal_notes}
            onChange={(e) => setFormData({ ...formData, internal_notes: e.target.value })}
            placeholder="Internal notes only..."
            rows={3}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Production Notes</label>
          <Textarea
            value={formData.production_notes}
            onChange={(e) => setFormData({ ...formData, production_notes: e.target.value })}
            placeholder="Special instructions for production..."
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}

// Step 4: Review
function StepReview({
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
            <Badge variant="info">{formData.order_nature}</Badge>
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
