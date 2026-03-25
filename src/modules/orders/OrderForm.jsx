import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { orders, lineItems } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Input, Select, Textarea, Modal, ConfirmDialog } from '../../components/ui';
import { Plus, X } from 'lucide-react';
import { CustomerSearch } from './components/CustomerSearch';
import { LineItemRow } from './components/LineItemRow';

const OrderForm = () => {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [order, setOrder] = useState({
    customer_id: null,
    nature: 'sample',
    order_type: 'standard',
    priority: 'normal',
    delivery_date: '',
    notes: '',
    line_items: [],
    advance_paid: 0,
    discount_amount: 0,
  });

  const [isLoading, setIsLoading] = useState(!!orderId);

  useEffect(() => {
    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  const fetchOrder = async () => {
    const { data, error } = await orders.get(orderId);
    if (error) {
      addToast('Failed to load order', 'error');
      navigate('/orders');
    } else {
      setOrder({
        ...data,
        line_items: data.order_line_items || [],
      });
    }
    setIsLoading(false);
  };

  const subtotal = useMemo(() => {
    return order.line_items.reduce((sum, item) => sum + (item.amount || 0), 0);
  }, [order.line_items]);

  const gstAmount = useMemo(() => {
    return subtotal * 0.18;
  }, [subtotal]);

  const grandTotal = useMemo(() => {
    return subtotal + gstAmount - (order.discount_amount || 0) + (order.advance_paid || 0);
  }, [subtotal, gstAmount, order.discount_amount, order.advance_paid]);

  const handleSave = async () => {
    try {
      if (!order.customer_id) {
        addToast('Please select a customer', 'error');
        return;
      }

      if (order.line_items.length === 0) {
        addToast('Please add at least one line item', 'error');
        return;
      }

      const orderData = {
        customer_id: order.customer_id,
        nature: order.nature,
        order_type: order.order_type,
        priority: order.priority,
        delivery_date: order.delivery_date,
        notes: order.notes,
        grand_total: grandTotal,
        advance_paid: order.advance_paid,
        discount_amount: order.discount_amount,
        gst_amount: gstAmount,
        user_id: user.id,
      };

      let savedOrder;
      if (orderId) {
        const { data, error } = await orders.update(orderId, orderData);
        if (error) throw error;
        savedOrder = data;
      } else {
        const { data, error } = await orders.create(orderData);
        if (error) throw error;
        savedOrder = data;
      }

      const lineItemsData = order.line_items
        .filter(item => !item.id)
        .map(item => ({
          ...item,
          order_id: savedOrder.id,
        }));

      if (lineItemsData.length > 0) {
        const { error } = await lineItems.create(lineItemsData);
        if (error) throw error;
      }

      addToast(`Order ${orderId ? 'updated' : 'created'} successfully`, 'success');
      navigate(`/orders/${savedOrder.id}`);
    } catch (error) {
      addToast('Failed to save order', 'error');
    }
  };

  const handleAddLineItem = () => {
    setOrder(prev => ({
      ...prev,
      line_items: [
        ...prev.line_items,
        {
          line_type: 'production',
          product_id: null,
          amount: 0,
        },
      ],
    }));
  };

  const handleUpdateLineItem = (index, updates) => {
    const newItems = [...order.line_items];
    newItems[index] = { ...newItems[index], ...updates };
    setOrder(prev => ({ ...prev, line_items: newItems }));
  };

  const handleRemoveLineItem = (index) => {
    setOrder(prev => ({
      ...prev,
      line_items: prev.line_items.filter((_, i) => i !== index),
    }));
  };

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">
        {orderId ? 'Edit Order' : 'Create New Order'}
      </h1>

      <form className="space-y-8 bg-white p-6 rounded-lg border border-gray-200">
        {/* Customer Section */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Customer Details</h2>
          <CustomerSearch
            value={order.customer_id}
            onChange={(customerId) => setOrder(prev => ({ ...prev, customer_id: customerId }))}
          />
        </section>

        {/* Order Details Section */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Order Details</h2>
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Nature"
              value={order.nature}
              onChange={(e) => setOrder(prev => ({ ...prev, nature: e.target.value }))}
              options={[
                { value: 'sample', label: 'Sample' },
                { value: 'full_production', label: 'Full Production' },
              ]}
            />
            <Select
              label="Order Type"
              value={order.order_type}
              onChange={(e) => setOrder(prev => ({ ...prev, order_type: e.target.value }))}
              options={[
                { value: 'standard', label: 'Standard' },
                { value: 'export', label: 'Export' },
              ]}
            />
            <Select
              label="Priority"
              value={order.priority}
              onChange={(e) => setOrder(prev => ({ ...prev, priority: e.target.value }))}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
            />
            <Input
              label="Delivery Date"
              type="date"
              value={order.delivery_date}
              onChange={(e) => setOrder(prev => ({ ...prev, delivery_date: e.target.value }))}
            />
          </div>
        </section>

        {/* Line Items Section */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Line Items</h2>
            <Button onClick={handleAddLineItem} size="sm">
              <Plus className="w-4 h-4" />
              Add Item
            </Button>
          </div>
          <div className="space-y-3">
            {order.line_items.map((item, idx) => (
              <LineItemRow
                key={idx}
                item={item}
                onUpdate={(updates) => handleUpdateLineItem(idx, updates)}
                onRemove={() => handleRemoveLineItem(idx)}
              />
            ))}
          </div>
        </section>

        {/* Pricing Section */}
        <section className="border-t pt-4">
          <h2 className="text-xl font-semibold mb-4">Pricing & Totals</h2>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Subtotal"
              type="number"
              disabled
              value={subtotal.toFixed(2)}
            />
            <Input
              label="GST (18%)"
              type="number"
              disabled
              value={gstAmount.toFixed(2)}
            />
            <Input
              label="Discount"
              type="number"
              value={order.discount_amount}
              onChange={(e) => setOrder(prev => ({ ...prev, discount_amount: parseFloat(e.target.value) }))}
            />
            <Input
              label="Grand Total"
              type="number"
              disabled
              value={grandTotal.toFixed(2)}
              className="font-bold text-lg"
            />
          </div>
        </section>

        {/* Advance Payment Section */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Advance Payment</h2>
          <Input
            label="Amount Paid"
            type="number"
            value={order.advance_paid}
            onChange={(e) => setOrder(prev => ({ ...prev, advance_paid: parseFloat(e.target.value) }))}
          />
        </section>

        {/* Notes Section */}
        <section>
          <Textarea
            label="Notes"
            placeholder="Add any notes about this order..."
            value={order.notes}
            onChange={(e) => setOrder(prev => ({ ...prev, notes: e.target.value }))}
            rows={4}
          />
        </section>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end border-t pt-6">
          <Button variant="secondary" onClick={() => navigate('/orders')}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {orderId ? 'Update Order' : 'Create Order'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default OrderForm;
