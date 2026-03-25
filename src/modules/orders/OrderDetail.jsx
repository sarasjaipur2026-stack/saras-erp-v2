import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { orders, deliveries, jobwork } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Modal, Input, DataTable, Badge } from '../../components/ui';
import { ArrowLeft, Plus } from 'lucide-react';

export const OrderDetail = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [order, setOrder] = useState(null);
  const [deliveryList, setDeliveryList] = useState([]);
  const [jobworkList, setJobworkList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showJobworkModal, setShowJobworkModal] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({
    delivery_date: '',
    quantity_delivered: 0,
    delivery_note: '',
  });
  const [jobworkForm, setJobworkForm] = useState({
    material_inward_date: '',
    material_inward_qty: 0,
    material_return_date: '',
    material_return_qty: 0,
    notes: '',
  });

  useEffect(() => {
    fetchOrderDetails();
  }, [orderId]);

  const fetchOrderDetails = async () => {
    setIsLoading(true);
    const [orderRes, deliveryRes, jobworkRes] = await Promise.all([
      orders.get(orderId),
      deliveries.list(orderId),
      jobwork.list(orderId),
    ]);

    if (orderRes.error) {
      addToast('Failed to load order', 'error');
      navigate('/orders');
    } else {
      setOrder(orderRes.data);
      setDeliveryList(deliveryRes.data || []);
      setJobworkList(jobworkRes.data || []);
    }
    setIsLoading(false);
  };

  const handleAddDelivery = async () => {
    try {
      const { error } = await deliveries.create({
        order_id: orderId,
        ...deliveryForm,
      });
      if (error) throw error;

      addToast('Delivery added successfully', 'success');
      setShowDeliveryModal(false);
      setDeliveryForm({
        delivery_date: '',
        quantity_delivered: 0,
        delivery_note: '',
      });
      fetchOrderDetails();
    } catch (error) {
      addToast('Failed to add delivery', 'error');
    }
  };

  const handleAddJobwork = async () => {
    try {
      const { error } = await jobwork.create({
        order_id: orderId,
        ...jobworkForm,
      });
      if (error) throw error;

      addToast('Jobwork tracked successfully', 'success');
      setShowJobworkModal(false);
      setJobworkForm({
        material_inward_date: '',
        material_inward_qty: 0,
        material_return_date: '',
        material_return_qty: 0,
        notes: '',
      });
      fetchOrderDetails();
    } catch (error) {
      addToast('Failed to track jobwork', 'error');
    }
  };

  const handleConvertToFull = async () => {
    try {
      const { error } = await orders.convertSampleToFull(orderId);
      if (error) throw error;

      addToast('Order converted to full production', 'success');
      fetchOrderDetails();
    } catch (error) {
      addToast('Failed to convert order', 'error');
    }
  };

  if (isLoading) return <div className="p-6">Loading...</div>;
  if (!order) return <div className="p-6">Order not found</div>;

  const deliveryProgress = order.order_line_items
    ? (deliveryList.reduce((sum, d) => sum + d.quantity_delivered, 0) /
        order.order_line_items.reduce((sum, li) => sum + (li.meters || li.weight_kg || 0), 0)) *
      100
    : 0;

  const deliveryColumns = [
    { key: 'delivery_date', label: 'Date' },
    { key: 'quantity_delivered', label: 'Quantity' },
    { key: 'delivery_note', label: 'Notes' },
  ];

  const jobworkColumns = [
    { key: 'material_inward_date', label: 'Inward Date' },
    { key: 'material_inward_qty', label: 'Inward Qty' },
    { key: 'material_return_date', label: 'Return Date' },
    { key: 'material_return_qty', label: 'Return Qty' },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/orders')}
          className="text-blue-600 hover:text-blue-700"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-3xl font-bold">Order {order.order_number}</h1>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600 mb-1">Customer</p>
          <p className="font-semibold">{order.customers?.contact_name}</p>
          <p className="text-xs text-gray-500">{order.customers?.firm_name}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600 mb-1">Total Amount</p>
          <p className="font-semibold text-lg">{order.grand_total}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600 mb-1">Status</p>
          <Badge variant="default">{order.status}</Badge>
        </div>
        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <p className="text-sm text-gray-600 mb-1">Delivery Date</p>
          <p className="font-semibold">{order.delivery_date}</p>
        </div>
      </div>

      {/* Delivery Progress */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 mb-8">
        <h2 className="text-xl font-semibold mb-4">Delivery Progress</h2>
        <div className="mb-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(deliveryProgress, 100)}%` }}
            />
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-4">{deliveryProgress.toFixed(0)}% delivered</p>
        <Button onClick={() => setShowDeliveryModal(true)} size="sm">
          <Plus className="w-4 h-4" />
          Add Delivery
        </Button>
      </div>

      {/* Line Items */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 mb-8">
        <h2 className="text-xl font-semibold mb-4">Line Items</h2>
        {order.order_line_items && (
          <div className="space-y-4">
            {order.order_line_items.map(item => (
              <div key={item.id} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-medium">{item.products?.name || 'N/A'}</p>
                    <p className="text-sm text-gray-600">
                      {item.width_cm}cm × {item.meters || item.weight_kg}
                    </p>
                  </div>
                  <p className="font-semibold">{item.amount}</p>
                </div>
                {item.line_type === 'jobwork' && (
                  <p className="text-xs bg-yellow-100 text-yellow-800 p-2 rounded inline-block">
                    Jobwork Notice
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Deliveries */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 mb-8">
        <h2 className="text-xl font-semibold mb-4">Delivery History</h2>
        <DataTable
          columns={deliveryColumns}
          data={deliveryList}
          emptyMessage="No deliveries recorded"
        />
      </div>

      {/* Jobwork Tracking */}
      <div className="bg-white p-6 rounded-lg border border-gray-200 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold">Jobwork Tracking</h2>
          <Button onClick={() => setShowJobworkModal(true)} size="sm">
            <Plus className="w-4 h-4" />
            Track Material
          </Button>
        </div>
        <DataTable
          columns={jobworkColumns}
          data={jobworkList}
          emptyMessage="No jobwork tracked"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4">
        <Button onClick={() => navigate(`/orders/${orderId}/edit`)}>Edit Order</Button>
        {order.nature === 'sample' && (
          <Button onClick={handleConvertToFull} variant="secondary">
            Convert to Full Production
          </Button>
        )}
      </div>

      {/* Delivery Modal */}
      <Modal
        isOpen={showDeliveryModal}
        onClose={() => setShowDeliveryModal(false)}
        title="Add Delivery"
      >
        <div className="space-y-4">
          <Input
            label="Delivery Date"
            type="date"
            value={deliveryForm.delivery_date}
            onChange={(e) =>
              setDeliveryForm(prev => ({ ...prev, delivery_date: e.target.value }))
            }
          />
          <Input
            label="Quantity Delivered"
            type="number"
            value={deliveryForm.quantity_delivered}
            onChange={(e) =>
              setDeliveryForm(prev => ({ ...prev, quantity_delivered: parseFloat(e.target.value) }))
            }
          />
          <Input
            label="Delivery Note"
            value={deliveryForm.delivery_note}
            onChange={(e) =>
              setDeliveryForm(prev => ({ ...prev, delivery_note: e.target.value }))
            }
          />
          <div className="flex gap-2 justify-end pt-4">
            <Button variant="secondary" onClick={() => setShowDeliveryModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddDelivery}>Add Delivery</Button>
          </div>
        </div>
      </Modal>

      {/* Jobwork Modal */}
      <Modal
        isOpen={showJobworkModal}
        onClose={() => setShowJobworkModal(false)}
        title="Track Jobwork Material"
      >
        <div className="space-y-4">
          <Input
            label="Material Inward Date"
            type="date"
            value={jobworkForm.material_inward_date}
            onChange={(e) =>
              setJobworkForm(prev => ({ ...prev, material_inward_date: e.target.value }))
            }
          />
          <Input
            label="Material Inward Quantity"
            type="number"
            value={jobworkForm.material_inward_qty}
            onChange={(e) =>
              setJobworkForm(prev => ({ ...prev, material_inward_qty: parseFloat(e.target.value) }))
            }
          />
          <Input
            label="Material Return Date"
            type="date"
            value={jobworkForm.material_return_date}
            onChange={(e) =>
              setJobworkForm(prev => ({ ...prev, material_return_date: e.target.value }))
            }
          />
          <Input
            label="Material Return Quantity"
            type="number"
            value={jobworkForm.material_return_qty}
            onChange={(e) =>
              setJobworkForm(prev => ({ ...prev, material_return_qty: parseFloat(e.target.value) }))
            }
          />
          <div className="flex gap-2 justify-end pt-4">
            <Button variant="secondary" onClick={() => setShowJobworkModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddJobwork}>Save</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};