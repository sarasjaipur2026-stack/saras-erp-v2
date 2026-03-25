import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { orders } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, DataTable, Tabs, Badge } from '../../components/ui';
import { Plus, Copy, Trash2 } from 'lucide-react';

const OrdersPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [ordersList, setOrdersList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchOrders();
  }, [user]);

  const fetchOrders = async () => {
    setIsLoading(true);
    const { data, error } = await orders.list(user.id);
    if (error) {
      addToast('Failed to load orders', 'error');
    } else {
      setOrdersList(data || []);
    }
    setIsLoading(false);
  };

  const handleDuplicate = async (order) => {
    const { data, error } = await orders.duplicate(order.id);
    if (error) {
      addToast('Failed to duplicate order', 'error');
    } else {
      addToast('Order duplicated successfully', 'success');
      fetchOrders();
      navigate(`/orders/${data.id}`);
    }
  };

  const handleCancel = async (orderId) => {
    const { data, error } = await orders.update(orderId, { status: 'cancelled' });
    if (error) {
      addToast('Failed to cancel order', 'error');
    } else {
      addToast('Order cancelled', 'success');
      fetchOrders();
    }
  };

  const filteredOrders = statusFilter === 'all'
    ? ordersList
    : ordersList.filter(o => o.status === statusFilter);

  const columns = [
    { key: 'order_number', label: 'Order #' },
    {
      key: 'customers',
      label: 'Customer',
      render: (_, row) => row.customers?.contact_name,
    },
    { key: 'grand_total', label: 'Amount' },
    { key: 'status', label: 'Status', render: (status) => <Badge variant="default">{status}</Badge> },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-2">
          <button onClick={() => navigate(`/orders/${row.id}`)} className="text-blue-600 hover:underline text-sm">
            View
          </button>
          <button onClick={() => handleDuplicate(row)} className="text-green-600 hover:underline text-sm">
            <Copy className="w-4 h-4" />
          </button>
          <button onClick={() => handleCancel(row.id)} className="text-red-600 hover:underline text-sm">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  const tabs = [
    { label: 'All Orders', content: null },
    { label: 'Pending', content: null },
    { label: 'Confirmed', content: null },
    { label: 'Delivered', content: null },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Orders</h1>
        <Button onClick={() => navigate('/orders/new')} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          New Order
        </Button>
      </div>

      <Tabs
        tabs={tabs}
        defaultTab={0}
        onChange={(idx) => {
          const statusMap = { 0: 'all', 1: 'pending', 2: 'confirmed', 3: 'delivered' };
          setStatusFilter(statusMap[idx]);
        }}
      />

      <div className="mt-6">
        <DataTable
          columns={columns}
          data={filteredOrders}
          onRowClick={(row) => navigate(`/orders/${row.id}`)}
          isLoading={isLoading}
          emptyMessage="No orders found"
        />
      </div>
    </div>
  );
};

export default OrdersPage;
