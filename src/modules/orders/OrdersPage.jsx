import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShoppingCart,
  TrendingUp,
  AlertCircle,
  Calendar,
  Plus,
  ChevronDown,
  MoreVertical,
  Eye,
  Edit,
  Copy,
  Printer,
  Trash2,
  Search,
  Loader,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { orders as ordersDb } from '../../lib/db';
import {
  StatCard,
  DataTable,
  StatusBadge,
  Badge,
  Currency,
  Button,
  Input,
  Select,
  Spinner,
  Modal,
} from '../../components/ui';

const OrdersPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  // State management
  const [ordersList, setOrdersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [activeTab, setActiveTab] = useState('All');
  const [dateRange, setDateRange] = useState('thisMonth');
  const [customerFilter, setCustomerFilter] = useState('');
  const [viewMode, setViewMode] = useState('allInfo');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [statusPipeline, setStatusPipeline] = useState({});
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkStatusModal, setBulkStatusModal] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState('');

  const statuses = [
    'Draft',
    'Booking',
    'Approved',
    'Production',
    'QC',
    'Dispatch',
    'Completed',
    'Cancelled',
  ];

  const viewModes = [
    { id: 'allInfo', label: 'All Info' },
    { id: 'simple', label: 'Simple' },
    { id: 'finance', label: 'Finance' },
  ];

  // Calculate date range
  const getDateRange = (range) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfYear = new Date(today.getFullYear(), 0, 1);

    switch (range) {
      case 'today':
        return { start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
      case 'thisWeek': {
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        return { start: startOfWeek, end: new Date() };
      }
      case 'thisMonth':
        return {
          start: new Date(today.getFullYear(), today.getMonth(), 1),
          end: new Date(),
        };
      case 'thisFY':
        return { start: startOfYear, end: new Date() };
      default:
        return { start: null, end: null };
    }
  };

  // Load orders on mount
  useEffect(() => {
    const loadOrders = async () => {
      try {
        setLoading(true);
        const { data, error } = await ordersDb.list(user.id);
        if (error) throw error;

        setOrdersList(data || []);

        // Build status pipeline
        const pipeline = {};
        (data || []).forEach((order) => {
          const status = order.status || 'Draft';
          pipeline[status] = (pipeline[status] || 0) + 1;
        });
        setStatusPipeline(pipeline);
      } catch (error) {
        toast.error('Failed to load orders');
        if (import.meta.env.DEV) console.error('Error loading orders:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      loadOrders();
    }
  }, [user?.id, toast]);

  // Derived: filtered orders (computed, not stored in state)
  const filteredOrders = useMemo(() => {
    let filtered = ordersList;

    if (activeTab !== 'All') {
      filtered = filtered.filter((order) => order.status === activeTab);
    }
    if (selectedStatus) {
      filtered = filtered.filter((order) => order.status === selectedStatus);
    }
    if (dateRange && dateRange !== 'custom') {
      const { start, end } = getDateRange(dateRange);
      if (start && end) {
        filtered = filtered.filter((order) => {
          const orderDate = new Date(order.created_at);
          return orderDate >= start && orderDate <= end;
        });
      }
    }
    if (customerFilter) {
      const term = customerFilter.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          order.customers?.contact_name?.toLowerCase().includes(term) ||
          order.customers?.firm_name?.toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [ordersList, activeTab, selectedStatus, dateRange, customerFilter]);

  // Derived: statistics (computed from ordersList)
  const stats = useMemo(() => {
    const now = new Date();
    const activeStatuses = new Set(['Production', 'QC', 'Dispatch']);
    let activeOrders = 0, totalRevenue = 0, outstandingBalance = 0, overdue = 0;

    for (const o of ordersList) {
      if (activeStatuses.has(o.status)) activeOrders++;
      totalRevenue += o.grand_total || 0;
      outstandingBalance += o.balance_due || 0;
      if (o.delivery_date_1 && new Date(o.delivery_date_1) < now && o.status !== 'Completed') overdue++;
    }
    return { totalOrders: ordersList.length, activeOrders, totalRevenue, outstandingBalance, overdue };
  }, [ordersList]);

  // Handle bulk actions
  const handleBulkStatusChange = async () => {
    if (!bulkNewStatus || selectedOrders.size === 0) return;

    try {
      // Call API to update multiple orders
      const orderIds = Array.from(selectedOrders);
      for (const orderId of orderIds) {
        await ordersDb.updateStatus(orderId, bulkNewStatus);
      }
      toast.success(`Updated ${orderIds.length} orders`);
      setSelectedOrders(new Set());
      setBulkStatusModal(false);
      // Reload orders
      const { data } = await ordersDb.list(user.id);
      setOrdersList(data || []);
    } catch (error) {
      toast.error('Failed to update orders');
      if (import.meta.env.DEV) console.error('Error:', error);
    }
  };

  const handleBulkPrint = () => {
    const orderIds = Array.from(selectedOrders);
    if (orderIds.length === 0) {
      toast.error('Select orders to print');
      return;
    }
    // TODO: Implement bulk print
    toast.success('Print job started');
  };

  const handleBulkExport = () => {
    const orderIds = Array.from(selectedOrders);
    if (orderIds.length === 0) {
      toast.error('Select orders to export');
      return;
    }
    // TODO: Implement bulk export
    toast.success('Export started');
  };

  const handleDeleteOrder = async () => {
    if (!deleteTarget) return;

    try {
      await ordersDb.delete(deleteTarget);
      toast.success('Order deleted');
      setShowDeleteModal(false);
      setDeleteTarget(null);
      const { data } = await ordersDb.list(user.id);
      setOrdersList(data || []);
    } catch (error) {
      toast.error('Failed to delete order');
      if (import.meta.env.DEV) console.error('Error:', error);
    }
  };

  const handleSelectAll = () => {
    if (selectedOrders.size === filteredOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(filteredOrders.map((o) => o.id)));
    }
  };

  const handleSelectOrder = (orderId) => {
    const newSelected = new Set(selectedOrders);
    if (newSelected.has(orderId)) {
      newSelected.delete(orderId);
    } else {
      newSelected.add(orderId);
    }
    setSelectedOrders(newSelected);
  };

  const handleRowClick = useCallback((row) => {
    navigate(`/orders/${row.id}`);
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  // Table columns based on view mode — uses the project's DataTable API:
  //   { key: string, label: ReactNode, render?: (value, row) => ReactNode }
  const getTableColumns = () => {
    const baseColumns = [
      {
        key: 'checkbox',
        label: (
          <input
            type="checkbox"
            checked={
              filteredOrders.length > 0 &&
              selectedOrders.size === filteredOrders.length
            }
            onChange={handleSelectAll}
            className="w-4 h-4"
          />
        ),
        render: (_value, row) => (
          <input
            type="checkbox"
            checked={selectedOrders.has(row.id)}
            onChange={(e) => {
              e.stopPropagation()
              handleSelectOrder(row.id)
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4"
          />
        ),
      },
      {
        key: 'order_number',
        label: 'Order #',
        render: (value) => <span className="font-mono font-semibold text-indigo-700">{value || '—'}</span>,
      },
      {
        key: 'customers',
        label: 'Customer',
        render: (_value, row) =>
          row.customers?.firm_name || row.customers?.contact_name || '—',
      },
    ];

    if (viewMode === 'allInfo' || viewMode === 'finance') {
      baseColumns.push({
        key: 'grand_total',
        label: 'Amount',
        render: (value) => <Currency amount={value || 0} />,
      });
    }

    if (viewMode === 'allInfo') {
      baseColumns.push(
        {
          key: 'priority',
          label: 'Priority',
          render: (value) => (
            <Badge
              variant={
                value === 'High'
                  ? 'danger'
                  : value === 'Medium'
                  ? 'warning'
                  : 'default'
              }
            >
              {value || 'Normal'}
            </Badge>
          ),
        },
        {
          key: 'status',
          label: 'Status',
          render: (value) => <StatusBadge status={value} />,
        },
        {
          key: 'created_at',
          label: 'Created',
          render: (value) =>
            value ? new Date(value).toLocaleDateString('en-IN') : '—',
        },
        {
          key: 'delivery_date_1',
          label: 'Delivery',
          render: (value) =>
            value ? new Date(value).toLocaleDateString('en-IN') : '—',
        },
        {
          key: 'order_line_items',
          label: 'Items',
          render: (value) => (
            <span className="text-sm text-slate-600 font-mono">
              {Array.isArray(value) ? value.length : 0}
            </span>
          ),
        }
      );
    }

    if (viewMode === 'simple') {
      baseColumns.push({
        key: 'status',
        label: 'Status',
        render: (value) => <StatusBadge status={value} />,
      });
    }

    if (viewMode === 'finance') {
      baseColumns.push(
        {
          key: 'balance_due',
          label: 'Balance Due',
          render: (value) => <Currency amount={value || 0} />,
        },
        {
          key: 'advance_paid',
          label: 'Advance Paid',
          render: (value) => <Currency amount={value || 0} />,
        },
        {
          key: 'status',
          label: 'Status',
          render: (value) => <StatusBadge status={value} />,
        }
      );
    }

    // Actions column
    baseColumns.push({
      key: 'actions',
      label: 'Actions',
      render: (_value, row) => (
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() =>
              setOpenMenuId(openMenuId === row.id ? null : row.id)
            }
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
          >
            <MoreVertical size={16} />
          </button>

          {openMenuId === row.id && (
            <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/50 z-10 overflow-hidden">
              <button
                onClick={() => {
                  navigate(`/orders/${row.id}`)
                  setOpenMenuId(null)
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-[13px]"
              >
                <Eye size={14} /> View
              </button>
              <button
                onClick={() => {
                  navigate(`/orders/${row.id}/edit`)
                  setOpenMenuId(null)
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-[13px]"
              >
                <Edit size={14} /> Edit
              </button>
              <button
                onClick={() => {
                  navigate(`/orders/${row.id}/duplicate`)
                  setOpenMenuId(null)
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-[13px]"
              >
                <Copy size={14} /> Duplicate
              </button>
              <button
                onClick={() => {
                  toast.success('Print started')
                  setOpenMenuId(null)
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-[13px]"
              >
                <Printer size={14} /> Print
              </button>
              <button
                onClick={() => {
                  setDeleteTarget(row.id)
                  setShowDeleteModal(true)
                  setOpenMenuId(null)
                }}
                className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2 text-[13px] border-t border-slate-100"
              >
                <Trash2 size={14} /> Delete
              </button>
            </div>
          )}
        </div>
      ),
    })

    return baseColumns
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Orders</h1>
        <Button onClick={() => navigate('/orders/new')}>
          <Plus size={16} /> New Order
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <StatCard
          label="Total Orders"
          value={stats.totalOrders}
          icon={ShoppingCart}
          color="indigo"
        />
        <StatCard
          label="Active"
          value={stats.activeOrders}
          icon={TrendingUp}
          color="blue"
        />
        <StatCard
          label="Revenue"
          value={<Currency amount={stats.totalRevenue} />}
          icon={ShoppingCart}
          color="green"
        />
        <StatCard
          label="Outstanding"
          value={<Currency amount={stats.outstandingBalance} />}
          icon={AlertCircle}
          color="amber"
        />
        <StatCard
          label="Overdue"
          value={stats.overdue}
          icon={Calendar}
          color={stats.overdue > 0 ? 'red' : 'indigo'}
        />
      </div>

      {/* Status Pipeline Bar */}
      <div className="bg-white p-4 rounded-lg border">
        <h3 className="text-sm font-semibold mb-3">Status Pipeline</h3>
        <div className="flex gap-2 flex-wrap">
          {statuses.map((status) => (
            <button
              key={status}
              onClick={() =>
                setSelectedStatus(selectedStatus === status ? null : status)
              }
              className={`px-3 py-1 rounded text-sm font-medium transition ${
                selectedStatus === status
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {status} ({statusPipeline[status] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {['All', ...statuses].map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setSelectedStatus(null);
              }}
              className={`px-2 py-3 border-b-2 font-medium text-sm transition ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Select
          label="Date Range"
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'thisWeek', label: 'This Week' },
            { value: 'thisMonth', label: 'This Month' },
            { value: 'thisFY', label: 'This Fiscal Year' },
          ]}
        />
        <Input
          placeholder="Search customer..."
          value={customerFilter}
          onChange={(e) => setCustomerFilter(e.target.value)}
          icon={Search}
        />
        <Select
          label="View Mode"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          options={viewModes.map((v) => ({ value: v.id, label: v.label }))}
        />
      </div>

      {/* Bulk Actions */}
      {selectedOrders.size > 0 && (
        <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl flex items-center justify-between">
          <span className="text-sm font-medium text-indigo-900">
            {selectedOrders.size} order{selectedOrders.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setBulkStatusModal(true)}
            >
              Change Status
            </Button>
            <Button variant="secondary" size="sm" onClick={handleBulkPrint}>
              Print
            </Button>
            <Button variant="secondary" size="sm" onClick={handleBulkExport}>
              Export
            </Button>
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-lg border">
        <DataTable
          columns={getTableColumns()}
          data={filteredOrders}
          onRowClick={handleRowClick}
        />
      </div>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Order"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setShowDeleteModal(false)}>
              Cancel
            </Button>
            <Button variant="danger" size="sm" onClick={handleDeleteOrder}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete this order? This action cannot be undone.
        </p>
      </Modal>

      {/* Bulk Status Change Modal */}
      <Modal
        isOpen={bulkStatusModal}
        onClose={() => setBulkStatusModal(false)}
        title="Change Status"
        footer={
          <>
            <Button variant="secondary" size="sm" onClick={() => setBulkStatusModal(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleBulkStatusChange}>
              Apply
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 mb-4">
          Change status for {selectedOrders.size} order{selectedOrders.size !== 1 ? 's' : ''}
        </p>
        <Select
          label="New Status"
          value={bulkNewStatus}
          onChange={(e) => setBulkNewStatus(e.target.value)}
          options={statuses.map((status) => ({
            value: status,
            label: status,
          }))}
        />
      </Modal>
    </div>
  );
};

export default OrdersPage;
