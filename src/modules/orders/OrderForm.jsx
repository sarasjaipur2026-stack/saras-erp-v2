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
import { orders, lineItems, orderCharges, checkCustomerCredit, logCreditOverride } from '../../lib/db';
import { toPaise, toRupees } from '../../lib/money';
import { Button, Spinner, Modal } from '../../components/ui';
import { StepCustomer } from './steps/StepCustomer';
import { StepLineItems } from './steps/StepLineItems';
import { StepPricingCharges } from './steps/StepPricingCharges';
import { StepReview } from './steps/StepReview';

const STEPS = [
  { id: 1, name: 'Customer', icon: Users },
  { id: 2, name: 'Line Items', icon: Package },
  { id: 3, name: 'Pricing & Charges', icon: IndianRupee },
  { id: 4, name: 'Review & Save', icon: CheckCircle },
];

// Rajasthan (Jaipur) default — read from app_settings in future
const COMPANY_STATE_CODE = '08';

// Draft auto-save — persist in-progress new orders to sessionStorage so a
// browser refresh / accidental navigation doesn't lose work. Scoped to the tab
// (sessionStorage, not localStorage) so multiple tabs can each hold their own
// draft without fighting. Edit mode doesn't use this — edits save back to DB.
const DRAFT_KEY = 'saras.draftOrder.v1';
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24h — stale drafts auto-expire

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

// Columns that belong on `order_line_items` row in DB. Anything else is UI-only.
const DB_LINE_COLS = new Set([
  'sort_order', 'line_type', 'product_id', 'machine_id', 'material_id', 'color_id',
  'width_cm', 'meters', 'weight_kg', 'rate_per_unit', 'amount',
  'discount_percent', 'discount_amount', 'gst_rate', 'gst_amount',
  'hsn_code', 'net_amount', 'total_qty', 'instructions', 'calculator_profile_id',
]);

const DB_CHARGE_COLS = new Set([
  'charge_type_id', 'scope', 'amount', 'is_taxable', 'notes',
]);

const sanitizeForDb = (row, allowed) => {
  const out = {};
  for (const k of Object.keys(row || {})) {
    if (allowed.has(k)) out[k] = row[k];
  }
  return out;
};

export default function OrderForm() {
  const navigate = useNavigate();
  const { id: orderId } = useParams();
  // Need role gate for credit-override workflow
  const { canManage } = useAuth();
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

  // Credit-hold override modal state. When a block fires and the user is a
  // manager+, we surface this modal so they can document the reason. Staff see
  // a plain toast error and are bounced back to finish collections first.
  const [creditBlock, setCreditBlock] = useState(null); // { reason, details, holdType }
  const [overrideReason, setOverrideReason] = useState('');
  const [overriding, setOverriding] = useState(false);

  // Load order if editing
  useEffect(() => {
    if (isEdit && loading) {
      const loadOrder = async () => {
        try {
          const { data: order, error } = await orders.get(orderId);
          if (error) throw error;
          if (order) {
            // Bring DB-side line items + charges into form state
            const loaded = {
              ...order,
              line_items: order.order_line_items || [],
              charges: order.order_charges || [],
            };
            setFormData(loaded);
            setSelectedCustomer(order.customers || null);
          }
        } catch {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, orderId]);

  // Offer to restore a saved draft on mount for new orders. Runs exactly once.
  useEffect(() => {
    if (isEdit) return;
    let raw = null;
    try { raw = sessionStorage.getItem(DRAFT_KEY); } catch { return; }
    if (!raw) return;
    let parsed = null;
    try { parsed = JSON.parse(raw); } catch { try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } return; }
    const age = Date.now() - (parsed?.savedAt || 0);
    if (age > DRAFT_TTL_MS || !parsed?.formData) {
      try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
      return;
    }
    const itemCount = parsed.formData.line_items?.length || 0;
    const when = new Date(parsed.savedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    toast.action(`Draft from ${when} · ${itemCount} item${itemCount === 1 ? '' : 's'}`, {
      label: 'Restore',
      duration: 12000,
      onClick: () => {
        setFormData(parsed.formData || DEFAULT_ORDER);
        setSelectedCustomer(parsed.selectedCustomer || null);
        setCurrentStep(parsed.currentStep || 1);
        setExpandedItems(parsed.expandedItems || {});
        toast.success('Draft restored');
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save draft to sessionStorage — debounced 10s after last change.
  // Only for new orders with meaningful content (customer or line items).
  useEffect(() => {
    if (isEdit || loading) return;
    const hasContent = formData.customer_id || (formData.line_items?.length || 0) > 0;
    if (!hasContent) return;
    const t = setTimeout(() => {
      try {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
          formData,
          selectedCustomer,
          currentStep,
          expandedItems,
          savedAt: Date.now(),
        }));
      } catch { /* quota or serialization — silently skip */ }
    }, 10000);
    return () => clearTimeout(t);
  }, [formData, selectedCustomer, currentStep, expandedItems, isEdit, loading]);

  const clearDraft = () => {
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
  };

  const handleCustomerSelect = (customer) => {
    if (!customer) {
      setSelectedCustomer(null);
      setFormData((prev) => ({ ...prev, customer_id: null, shipping_address: null }));
      return;
    }
    setSelectedCustomer(customer);
    const intra = customer.state_code && customer.state_code === COMPANY_STATE_CODE;
    // Cascade defaults from customer master — payment terms, broker, currency —
    // but only if the operator hasn't already chosen something different. This
    // means "frequent customer → zero typing" without clobbering in-progress edits.
    setFormData((prev) => ({
      ...prev,
      customer_id: customer.id,
      shipping_address: customer.shipping_addresses?.[0] || null,
      gst_type: intra ? 'intra_state' : 'inter_state',
      payment_terms_id: prev.payment_terms_id || customer.payment_term_id || null,
      broker_id: prev.broker_id || customer.broker_id || null,
      currency_code: prev.currency_code || customer.currency_code || 'INR',
    }));
  };

  // Duplicate the selected customer's most recent order into this draft.
  // Keeps customer metadata, copies line items with fresh temp IDs, resets
  // status/order_number so a new order number is generated on save.
  const handleDuplicateLastOrder = useCallback(async () => {
    if (!selectedCustomer?.id) {
      toast.error('Select a customer first');
      return;
    }
    try {
      const { data, error } = await orders.list({ customer_id: selectedCustomer.id, status: null });
      if (error) throw error;
      const list = Array.isArray(data) ? data : [];
      const lastOrder = list
        .filter((o) => o.id !== orderId && o.status !== 'cancelled')
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))[0];
      if (!lastOrder) {
        toast.error('No previous order found for this customer');
        return;
      }
      const { data: full, error: getErr } = await orders.get(lastOrder.id);
      if (getErr) throw getErr;
      if (!full) return;

      const freshLines = (full.order_line_items || []).map((li, idx) => ({
        ...li,
        id: `temp_${Date.now()}_${idx}`,
        sort_order: idx + 1,
      }));
      const freshCharges = (full.order_charges || []).map((ch, idx) => ({
        ...ch,
        id: `temp_${Date.now()}_ch_${idx}`,
      }));

      setFormData((prev) => ({
        ...prev,
        order_type_id: full.order_type_id || prev.order_type_id,
        payment_terms_id: full.payment_terms_id || prev.payment_terms_id,
        broker_id: full.broker_id || prev.broker_id,
        priority: full.priority || prev.priority,
        nature: full.nature || prev.nature,
        currency_code: full.currency_code || prev.currency_code,
        line_items: freshLines,
        charges: freshCharges,
        order_discount_type: full.order_discount_type || 'flat',
        order_discount_value: full.order_discount_value || 0,
      }));
      queueMicrotask(recalculatePricing);
      toast.success(`Copied from ${full.order_number || 'last order'}`);
    } catch (err) {
      toast.error('Failed to copy: ' + (err?.message || 'unknown'));
    }
  }, [selectedCustomer, orderId, toast]);

  const handleAddLineItem = useCallback(() => {
    const newItem = {
      id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
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
      discount_percent: 0,
      discount_amount: 0,
      gst_rate: 18,
      gst_amount: 0,
      hsn_code: null,
      instructions: '',
    };
    setFormData((prev) => ({
      ...prev,
      line_items: [...(prev.line_items || []), newItem],
    }));
    setExpandedItems((prev) => ({ ...prev, [newItem.id]: true }));
  }, [formData.line_items]);

  // Quick-add from the "recent products" chip row. Pre-fills product + GST
  // from the product master so the operator only has to type qty + rate.
  const handleAddLineItemWithProduct = useCallback((product) => {
    if (!product) return;
    const newItem = {
      id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      sort_order: (formData.line_items?.length || 0) + 1,
      line_type: 'production',
      product_id: product.id,
      products: product,
      material_id: null,
      machine_id: null,
      color_id: null,
      width_cm: 0,
      meters: 0,
      weight_kg: 0,
      rate_per_unit: 0,
      amount: 0,
      discount_percent: 0,
      discount_amount: 0,
      gst_rate: Number.isFinite(product.gst_rate) ? product.gst_rate : 18,
      gst_amount: 0,
      hsn_code: product.hsn_code || null,
      instructions: '',
    };
    setFormData((prev) => ({
      ...prev,
      line_items: [...(prev.line_items || []), newItem],
    }));
    setExpandedItems((prev) => ({ ...prev, [newItem.id]: true }));
  }, [formData.line_items]);

  // Duplicate an existing line with a fresh id — same product/rate/specs,
  // so repeat-order builds go fast.
  const handleCopyLineItem = useCallback((itemId) => {
    setFormData((prev) => {
      const src = prev.line_items.find((x) => x.id === itemId);
      if (!src) return prev;
      const copy = {
        ...src,
        id: `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        sort_order: prev.line_items.length + 1,
      };
      return { ...prev, line_items: [...prev.line_items, copy] };
    });
    queueMicrotask(recalculatePricing);
  }, []);

  const handleUpdateLineItem = (itemId, updates) => {
    setFormData((prev) => {
      const nextLines = prev.line_items.map((item) => {
        if (item.id !== itemId) return item;
        const merged = { ...item, ...updates };
        // When product selected, cascade gst_rate + hsn_code from product master
        if (updates.product_id && updates.products) {
          const p = updates.products;
          merged.gst_rate = Number.isFinite(p.gst_rate) ? p.gst_rate : merged.gst_rate;
          merged.hsn_code = p.hsn_code || merged.hsn_code;
        }
        return merged;
      });
      return { ...prev, line_items: nextLines };
    });
    // Defer recalc to next microtask so the setState above commits first
    queueMicrotask(recalculatePricing);
  };

  const handleRemoveLineItem = (itemId) => {
    setFormData((prev) => ({
      ...prev,
      line_items: prev.line_items.filter((item) => item.id !== itemId),
    }));
    setExpandedItems((prev) => {
      const { [itemId]: _removed, ...rest } = prev;
      return rest;
    });
    queueMicrotask(recalculatePricing);
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
    setFormData((prev) => ({
      ...prev,
      charges: prev.charges.map((charge) =>
        charge.id === chargeId ? { ...charge, ...updates } : charge
      ),
    }));
    queueMicrotask(recalculatePricing);
  };

  const handleRemoveCharge = (chargeId) => {
    setFormData((prev) => ({
      ...prev,
      charges: prev.charges.filter((charge) => charge.id !== chargeId),
    }));
    queueMicrotask(recalculatePricing);
  };

  const recalculatePricing = () => {
    setFormData((prev) => {
      const isIntra = prev.gst_type === 'intra_state';
      const isExempt = prev.gst_type === 'exempt';

      // All money math runs through the integer-paise helpers so totals land
      // exactly on the rupee→paise grid. No .toFixed workarounds, no drift
      // when the grand total spans a hundred line items.

      let subtotalPaise = 0;
      let totalItemDiscountPaise = 0;

      // Normalize each line: compute amount from qty*rate and line-level discount.
      // Done on the paise grid to keep line totals ↔ grand total reconciled.
      const normalizedLines = (prev.line_items || []).map((item) => {
        const qty = item.meters || item.weight_kg || item.total_qty || 0;
        const grossPaise = toPaise(qty * (item.rate_per_unit || 0));
        const pct = Math.min(Math.max(item.discount_percent || 0, 0), 100);
        const discountPaise = Math.round((grossPaise * pct) / 100);
        const amountPaise = grossPaise - discountPaise;
        subtotalPaise += amountPaise;
        totalItemDiscountPaise += discountPaise;
        return {
          ...item,
          amount: toRupees(amountPaise),
          discount_amount: toRupees(discountPaise),
          _amount_paise: amountPaise, // keep for downstream GST share calc
        };
      });

      // Charges — bucket taxable vs non-taxable on the paise grid.
      let taxableChargePaise = 0;
      let nonTaxChargePaise = 0;
      (prev.charges || []).forEach((c) => {
        const p = toPaise(c.amount || 0);
        if (c.is_taxable) taxableChargePaise += p;
        else nonTaxChargePaise += p;
      });
      const totalChargesPaise = taxableChargePaise + nonTaxChargePaise;

      // Order-level discount (flat or percent, clamped).
      let orderDiscountPaise = 0;
      if (prev.order_discount_type === 'percent') {
        const pct = Math.min(Math.max(prev.order_discount_value || 0, 0), 100);
        orderDiscountPaise = Math.round((subtotalPaise * pct) / 100);
      } else {
        orderDiscountPaise = Math.min(
          Math.max(toPaise(prev.order_discount_value || 0), 0),
          subtotalPaise,
        );
      }

      const netLinesPaise = subtotalPaise - orderDiscountPaise;

      // Per-line GST — each line uses its own product gst_rate.
      // Residual distribution: Math.round() per line can leave a ±N paise
      // drift vs netLinesPaise. We compute each line net, sum them, and push
      // the leftover into the last line so line nets sum exactly to netLinesPaise.
      const lineNetsPaise = normalizedLines.map((item) => {
        const share = subtotalPaise > 0 ? item._amount_paise / subtotalPaise : 0;
        return Math.round(netLinesPaise * share);
      });
      const lineNetsSum = lineNetsPaise.reduce((s, v) => s + v, 0);
      const residual = netLinesPaise - lineNetsSum;
      if (lineNetsPaise.length > 0 && residual !== 0) {
        lineNetsPaise[lineNetsPaise.length - 1] += residual;
      }

      let totalGstPaise = 0;
      const linesWithGst = normalizedLines.map((item, idx) => {
        const lineNetPaise = lineNetsPaise[idx];
        const rate = isExempt ? 0 : (item.gst_rate || 0);
        const gstPaise = Math.round((lineNetPaise * rate) / 100);
        totalGstPaise += gstPaise;
        const { _amount_paise: _drop, ...cleanItem } = item;
        return {
          ...cleanItem,
          gst_amount: toRupees(gstPaise),
          net_amount: toRupees(lineNetPaise + gstPaise),
        };
      });

      // Taxable charges — GST at weighted avg of line rates, fallback 18.
      if (taxableChargePaise > 0 && !isExempt) {
        const weightedRate = subtotalPaise > 0
          ? normalizedLines.reduce(
              (sum, li) =>
                sum + (li.gst_rate || 0) * (li._amount_paise / subtotalPaise),
              0,
            )
          : 18;
        totalGstPaise += Math.round((taxableChargePaise * weightedRate) / 100);
      }

      let cgstPaise = 0;
      let sgstPaise = 0;
      let igstPaise = 0;
      if (isIntra) {
        // Split evenly, ensuring cgst + sgst === totalGst to the paise.
        cgstPaise = Math.floor(totalGstPaise / 2);
        sgstPaise = totalGstPaise - cgstPaise;
      } else if (!isExempt) {
        igstPaise = totalGstPaise;
      }

      const taxableAmountPaise = netLinesPaise + taxableChargePaise;
      const grandTotalPaise = taxableAmountPaise + totalGstPaise + nonTaxChargePaise;
      const advancePaise = toPaise(prev.advance_paid || 0);
      // Over-advance is now surfaced as customer_credit instead of silently
      // clamped at balance=0. The submit path blocks over-advance unless the
      // user acknowledges it; if they do, the extra goes to customer_credit.
      const balancePaise = Math.max(grandTotalPaise - advancePaise, 0);
      const customerCreditPaise = Math.max(advancePaise - grandTotalPaise, 0);

      return {
        ...prev,
        line_items: linesWithGst,
        subtotal: toRupees(subtotalPaise),
        total_item_discount: toRupees(totalItemDiscountPaise),
        total_charges: toRupees(totalChargesPaise),
        order_discount_amount: toRupees(orderDiscountPaise),
        taxable_amount: toRupees(taxableAmountPaise),
        cgst_amount: toRupees(cgstPaise),
        sgst_amount: toRupees(sgstPaise),
        igst_amount: toRupees(igstPaise),
        grand_total: toRupees(grandTotalPaise),
        balance_due: toRupees(balancePaise),
        _customer_credit_preview: toRupees(customerCreditPaise),
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
        const needsProduct = ['production', 'trading', 'jobwork'].includes(item.line_type);
        const needsMaterial = item.line_type === 'stock';
        if (needsProduct && !item.product_id) {
          errors[`line_${idx}_product`] = `Line ${idx + 1}: Product is required`;
        }
        if (needsMaterial && !item.material_id) {
          errors[`line_${idx}_material`] = `Line ${idx + 1}: Material is required`;
        }
        const hasQty = (item.meters || 0) > 0 || (item.weight_kg || 0) > 0 || (item.total_qty || 0) > 0;
        if (!hasQty) {
          errors[`line_${idx}_qty`] = `Line ${idx + 1}: Enter meters, weight, or quantity`;
        }
        if ((item.rate_per_unit || 0) <= 0) {
          errors[`line_${idx}_rate`] = `Line ${idx + 1}: Rate must be greater than 0`;
        }
      });
    }

    if (step === 3) {
      if (formData.order_discount_type === 'percent' && (formData.order_discount_value || 0) > 100) {
        errors.orderDiscount = 'Order discount cannot exceed 100%';
      }
      if ((formData.advance_paid || 0) < 0) {
        errors.advancePaid = 'Advance cannot be negative';
      }
      if ((formData.advance_paid || 0) > (formData.grand_total || 0) + 0.01) {
        // Hard block: previous version silently clamped balance_due to 0 and
        // swallowed the excess. Manager must either reduce the advance or
        // record a standalone customer_ledger credit after order save.
        errors.advancePaid = `Advance ₹${Number(formData.advance_paid).toLocaleString('en-IN')} exceeds order grand total ₹${Number(formData.grand_total).toLocaleString('en-IN')} — reduce advance or post the surplus as a customer credit after saving the order.`;
      }
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

  // Upsert line items and charges for a given order_id.
  // Strategy: for edit, replace all existing lines (delete-then-insert) to handle reorder/remove cleanly.
  const upsertChildren = async (targetOrderId, { replaceExisting }) => {
    if (replaceExisting) {
      await lineItems.remove?.({ order_id: targetOrderId }).catch(() => {});
    }
    const linesToCreate = (formData.line_items || []).map((item, idx) => {
      const clean = sanitizeForDb(item, DB_LINE_COLS);
      clean.order_id = targetOrderId;
      clean.sort_order = idx + 1;
      return clean;
    });
    if (linesToCreate.length > 0) {
      const { error } = await lineItems.createMany(linesToCreate);
      if (error) throw error;
    }
    const chargesToCreate = (formData.charges || []).map((charge) => {
      const clean = sanitizeForDb(charge, DB_CHARGE_COLS);
      clean.order_id = targetOrderId;
      return clean;
    });
    if (chargesToCreate.length > 0) {
      const { error } = await orderCharges.createMany(chargesToCreate);
      if (error) throw error;
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      if (!formData.customer_id) {
        toast.error('Please select a customer first');
        setSaving(false);
        return;
      }

      const { line_items: _li, charges: _ch, customers: _cust, order_line_items: _oli, order_charges: _och, deliveries: _d, payments: _p, order_types: _ot, brokers: _b, payment_terms: _pt, _customer_credit_preview: _ccp, ...orderFields } = formData;
      const draftData = { ...orderFields, status: 'draft' };

      let targetId = orderId;
      if (isEdit) {
        const { error } = await orders.update(orderId, draftData);
        if (error) throw error;
      } else {
        const { data: newOrder, error } = await orders.create(draftData);
        if (error) throw error;
        targetId = newOrder.id;
      }

      // Persist children — draft should not lose entered line items / charges
      await upsertChildren(targetId, { replaceExisting: isEdit });

      // Draft persisted to DB — discard sessionStorage copy
      clearDraft();

      if (!isEdit) {
        toast.success('Draft saved');
        navigate(`/orders/${targetId}/edit`);
      } else {
        toast.success('Order updated as draft');
      }
    } catch (error) {
      toast.error('Failed to save draft: ' + (error?.message || 'unknown'));
    } finally {
      setSaving(false);
    }
  };

  // Core save — extracted so both the normal path and the override path can reuse it.
  const performSave = useCallback(async ({ overrideSnapshot, overrideReason: reasonArg } = {}) => {
    setSaving(true);
    try {
      const { line_items: _li, charges: _ch, customers: _cust, order_line_items: _oli, order_charges: _och, deliveries: _d, payments: _p, order_types: _ot, brokers: _b, payment_terms: _pt, _customer_credit_preview: _ccp, ...orderFields } = formData;
      // 'booking' is the canonical first-active status after draft (order_status enum)
      const orderData = { ...orderFields, status: 'booking' };

      let finalOrderId = orderId;
      if (isEdit) {
        const { error } = await orders.update(orderId, orderData);
        if (error) throw error;
        try {
          await upsertChildren(finalOrderId, { replaceExisting: true });
        } catch {
          await orders.update(finalOrderId, { status: 'draft' }).catch(() => {});
          toast.error('Order saved but line items/charges failed — reverted to draft. Please edit and retry.');
          navigate(`/orders/${finalOrderId}/edit`);
          return;
        }
      } else {
        // Atomic create — orders + line items + charges in a single transaction.
        // No more orphan-header risk if the child inserts fail midway.
        const sanitizedLines = (formData.line_items || []).map((item, idx) => {
          const clean = sanitizeForDb(item, DB_LINE_COLS);
          clean.sort_order = idx + 1;
          return clean;
        });
        const sanitizedCharges = (formData.charges || []).map((charge) => sanitizeForDb(charge, DB_CHARGE_COLS));
        const { data: newOrder, error } = await orders.createAtomic(orderData, sanitizedLines, sanitizedCharges);
        if (error) throw error;
        finalOrderId = newOrder.id;
      }

      // If this save was approved by manager override, log the audit event
      // and stamp the order so list views can badge it without a join.
      if (overrideSnapshot && reasonArg) {
        try {
          await logCreditOverride({
            customerId: formData.customer_id,
            orderId: finalOrderId,
            reason: reasonArg,
            snapshot: overrideSnapshot,
          });
          await orders.update(finalOrderId, {
            credit_override_reason: reasonArg,
            credit_override_at: new Date().toISOString(),
          }).catch(() => {});
        } catch (err) {
          if (import.meta.env.DEV) console.warn('[credit-override-log]', err);
        }
      }

      // Order committed — discard sessionStorage draft
      clearDraft();

      toast.success(isEdit ? 'Order updated' : 'Order created');
      navigate('/orders');
    } catch (error) {
      toast.error('Failed to create order: ' + (error?.message || 'unknown'));
    } finally {
      setSaving(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData, isEdit, orderId]);

  const handleCreateOrder = async () => {
    if (!validateStep(2) || !validateStep(3) || !validateStep(4)) {
      toast.error('Please fix validation errors');
      return;
    }

    // Credit gate — block or open override modal based on role
    try {
      const grandTotal = Number(formData.grand_total || 0);
      const orderIdForSelfSkip = isEdit ? orderId : null;
      const check = await checkCustomerCredit(formData.customer_id, grandTotal);
      if (!check.allowed) {
        // If editing an existing order, subtract its contribution before failing
        let shouldBlock = true;
        if (orderIdForSelfSkip && check.details && check.holdType !== 'manual') {
          const { currentOutstanding, creditLimit } = check.details;
          const { data: existing } = await orders.get(orderIdForSelfSkip);
          const existingContribution = Number(existing?.balance_due || 0);
          const projectedMinusSelf = currentOutstanding - existingContribution + grandTotal;
          if (creditLimit > 0 && projectedMinusSelf <= creditLimit && check.details.overdueCount === 0) {
            shouldBlock = false;
          }
        }
        if (shouldBlock) {
          if (canManage) {
            // Manager path: surface override modal; save blocked until modal confirmed
            setCreditBlock({
              reason: check.reason,
              details: check.details || null,
              holdType: check.holdType || null,
            });
            setOverrideReason('');
            return;
          }
          toast.error(check.reason + ' — contact a manager to override.');
          return;
        }
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[credit-check]', err);
    }

    await performSave();
  };

  const handleCreditOverrideConfirm = async () => {
    if (!creditBlock || !overrideReason.trim() || overriding) return;
    setOverriding(true);
    try {
      await performSave({
        overrideSnapshot: {
          reason: creditBlock.reason,
          details: creditBlock.details,
          holdType: creditBlock.holdType,
          grand_total: Number(formData.grand_total || 0),
        },
        overrideReason: overrideReason.trim(),
      });
      setCreditBlock(null);
      setOverrideReason('');
    } finally {
      setOverriding(false);
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
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 mb-2">
            {isEdit ? 'Edit Order' : 'Create New Order'}
          </h1>
          <p className="text-slate-600">
            {isEdit ? `Order #${formData.order_number}` : 'Follow the steps to create a new order'}
          </p>
        </div>

        {/* Step Indicator */}
        <div className="mb-8 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[520px]">
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
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 md:p-8 mb-8">
          {currentStep === 1 && (
            <StepCustomer
              formData={formData}
              setFormData={setFormData}
              selectedCustomer={selectedCustomer}
              onCustomerSelect={handleCustomerSelect}
              onDuplicateLastOrder={handleDuplicateLastOrder}
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
              onAddItemWithProduct={handleAddLineItemWithProduct}
              onUpdateItem={handleUpdateLineItem}
              onRemoveItem={handleRemoveLineItem}
              onCopyItem={handleCopyLineItem}
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
        <div className="flex justify-between flex-wrap gap-4">
          <Button
            onClick={handlePrevStep}
            disabled={currentStep === 1}
            variant="secondary"
          >
            <ChevronLeft size={16} />
            Previous
          </Button>

          <div className="flex gap-4 flex-wrap">
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

      {/* Credit override modal — manager-only path to bypass a credit block */}
      <Modal
        isOpen={!!creditBlock}
        onClose={() => { if (!overriding) { setCreditBlock(null); setOverrideReason(''); } }}
        title="Credit block — override required"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => { setCreditBlock(null); setOverrideReason(''); }} disabled={overriding}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={handleCreditOverrideConfirm}
              disabled={!overrideReason.trim() || overriding}
            >
              {overriding ? 'Overriding…' : 'Override & save'}
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-800">
            {creditBlock?.reason}
          </div>
          {creditBlock?.details && (
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
              {creditBlock.details.customerName && (
                <div className="col-span-2"><span className="font-semibold">Customer:</span> {creditBlock.details.customerName}</div>
              )}
              {creditBlock.details.creditLimit > 0 && (
                <div><span className="font-semibold">Limit:</span> ₹{Number(creditBlock.details.creditLimit).toLocaleString('en-IN')}</div>
              )}
              {creditBlock.details.currentOutstanding !== undefined && (
                <div><span className="font-semibold">Outstanding:</span> ₹{Number(creditBlock.details.currentOutstanding).toLocaleString('en-IN')}</div>
              )}
              {creditBlock.details.projectedOutstanding !== undefined && (
                <div><span className="font-semibold">After this order:</span> ₹{Number(creditBlock.details.projectedOutstanding).toLocaleString('en-IN')}</div>
              )}
              {creditBlock.details.overdueCount > 0 && (
                <div><span className="font-semibold">Overdue orders:</span> {creditBlock.details.overdueCount}</div>
              )}
            </div>
          )}
          <label className="block">
            <span className="block text-xs font-semibold text-slate-700 mb-1">Override reason (required)</span>
            <textarea
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              placeholder="e.g. cheque cleared this morning, advance received off-system, approved by owner verbally…"
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm min-h-[90px] focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={overriding}
            />
          </label>
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            This override will be logged against your account with the reason above. It cannot be edited or deleted.
          </p>
        </div>
      </Modal>
    </div>
  );
}
