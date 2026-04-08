import React, { useState, useEffect } from 'react';
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
  const [filteredOrders, setFilteredOrders] = useState([]);
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
        console.error('Error loading orders:', error);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      loadOrders();
    }
  }, [user?.id, toast]);

  // Filter orders based on active filters
  useEffect(() => {
    let filtered = [...ordersList];

    // Tab filter
    if (activeTab !== 'All') {
      filtered = filtered.filter((order) => order.status === activeTab);
    }

    // Status pipeline filter
    if (selectedStatus) {
      filtered = filtered.filter((order) => order.status === selectedStatus);
    }

    // Date range filter
    if (dateRange && dateRange !== 'custom') {
      const { start, end } = getDateRange(dateRange);
      if (start && end) {
        filtered = filtered.filter((order) => {
          const orderDate = new Date(order.created_at);
          return orderDate >= start && orderDate <= end;
        });
      }
    }

    // Customer filter
    if (customerFilter) {
      filtered = filtered.filter(
        (order) =>
          order.customers?.contact_name
            ?.toLowerCase()
            .includes(customerFilter.toLowerCase()) ||
          order.customers?.firm_name
            ?.toLowerCase()
            .includes(customerFilter.toLowerCase())
      );
    }

    setFilteredOrders(filtered);
  }, [ordersList, activeTab, selectedStatus, dateRange, customerFilter]);

  // Calculate statistics
  const calculateStats = () => {
    const stats = {
      totalOrders: ordersList.length,
      activeOrders: ordersList.filter((o) =>
        ['Production', 'QC', 'Dispatch'].includes(o.status)
      ).length,
      totalRevenue: ordersList.reduce((sum, o) => sum + (o.grand_total || 0), 0),
      outstandingBalance: ordersList.reduce(
        (sum, o) => sum + (o.balance_due || 0),
        0
      ),
      overdue: ordersList.filter((o) => {
        const dueDate = new Date(o.delivery_date_1);
        return dueDate < new Date() && o.status !== 'Completed';
      }).length,
    };
    return stats;
  };

  const stats = calculateStats();

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
      console.error('Error:', error);
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
      console.error('Error:', error);
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

  const handleRowClick = (orderId) => {
    navigate(`/orders/${orderId}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  // Table columns based on view mode
  const getTableColumns = () => {
    const baseColumns = [
      {
        header: (
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
        accessorKey: 'checkbox',
        cell: (row) => (
          <input
            type="checkbox"
            checked={selectedOrders.has(row.original.id)}
            onChange={() => handleSelectOrder(row.original.id)}
            className="w-4 h-4"
          />
        ),
      },
      {
        header: 'Order #',
        accessorKey: 'order_number',
        cell: (value) => <span className="font-semibold">{value}</span>,
      },
      {
        header: 'Customer',
        accessorKey: 'customers.firm_name',
        cell: (value, row) =>
          value || row.original.customers?.contact_name || '-',
      },
    ];

    if (viewMode === 'allInfo' || viewMode === 'finance') {
      baseColumns.push({
        header: 'Amount',
        accessorKey: 'grand_total',
        cell: (value) => <Currency value={value || 0} />,
      });
    }

    if (viewMode === 'allInfo') {
      baseColumns.push(
        {
          header: 'Priority',
          accessorKey: 'priority',
          cell: (value) => (
            <Badge
              variant={
                value === 'High'
                  ? 'destructive'
                  : value === 'Medium'
                  ? 'warning'
                  : 'secondary'
              }
            >
              {value || 'Normal'}
            </Badge>
          ),
        },
        {
          header: 'Status',
          accessorKey: 'status',
          cell: (value) => <StatusBadge status={value} />,
        },
        {
          header: 'Created',
          accessorKey: 'created_at',
          cell: (value) =>
            value ? new Date(value).toLocaleDateString() : '-',
        },
        {
          header: 'Delivery',
          accessorKey: 'delivery_date_1',
          cell: (value) =>
            value ? new Date(value).toLocaleDateString() : '-',
        },
        {
          header: 'Items',
          accessorKey: 'order_line_items',
          cell: (value) => (
            <span className="text-sm text-gray-600">
              {Array.isArray(value) ? value.length : 0}
            </span>
          ),
        }
      );
    }

    if (viewMode === 'simple') {
      baseColumns.push({
        header: 'Status',
        accessorKey: 'status',
        cell: (value) => <StatusBadge status={value} />,
      });
    }

    if (viewMode === 'finance') {
      baseColumns.push(
        {
          header: 'Balance Due',
          accessorKey: 'balance_due',
          cell: (value) => <Currency value={value || 0} />,
        },
        {
          header: 'Advance Paid',
          accessorKey: 'advance_paid',
          cell: (value) => <Currency value={value || 0} />,
        },
        {
          header: 'Status',
          accessorKey: 'status',
          cell: (value) => <StatusBadge status={value} />,
        }
      );
    }

    // Actions column
    baseColumns.push({
      header: 'Actions',
      accessorKey: 'actions',
      cell: (_, row) => (
        <div className="relative">
          <button
            onClick={() =>
              setOpenMenuId(openMenuId === row.original.id ? null : row.original.id)
            }
            className="p-1 hover:bg-gray-200 rounded"
          >
            <MoreVertical size={18} />
          </button>

          {openMenuId === row.original.id && (
            <div className="absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-lg z-10">
              <button
                onClick={() => {
                  navigate(`/orders/${row.original.id}`);
                  setOpenMenuId(null);
                }}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2"
              >
                <Eye size={16} /> View
              </button>
              <button
                onClick={() => {
                  navigate(`/orders/${row.original.id}/edit`);
                  setOpenMenuId(null);
                }}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2"
              >
                <Edit size={16} /> Edit
              </button>
              <button
                onClick={() => {
                  navigate(`/orders/${row.original.id}/duplicate`);
                  setOpenMenuId(null);
                }}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2"
              >
                <Copy size={16} /> Duplicate
              </button>
              <button
                onClick={() => {
                  // TODO: Implement print
                  toast.success('Print started');
                  setOpenMenuId(null);
                }}
                className="block w-full text-left px-4 py-2 hover:bg-gray-100 flex items-center gap-2"
              >
                <Printer size={16} /> Print
              </button>
              <button
                onClick={() => {
                  setDeleteTarget(row.original.id);
                  setShowDeleteModal(true);
                  setOpenMenuId(null);
                }}
                className="block w-full text-left px-4 py-2 hover:bg-red-100 text-red-600 flex items-center gap-2"
              >
                <Trash2 size={16} /> Delete
              </button>
            </div>
          )}
        </div>
      ),
    });

    return baseColumns;
  };

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
          title="Total Orders"
          value={stats.totalOrders}
          icon={<ShoppingCart size={24} />}
        />
        <StatCard
          title="Active"
          value={stats.activeOrders}
          icon={<TrendingUp size={24} />}
        />
        <StatCard
          title="Revenue"
          value={<Currency value={stats.totalRevenue} />}
          icon={<ShoppingCart size={24} />}
        />
        <StatCard
          title="Outstanding"
          value={<Currency value={stats.outstandingBalance} />}
          icon={<AlertCircle size={24} />}
        />
        <StatCard
          title="Overdue"
          value={stats.overdue}
          icon={<Calendar size={24} />}
          variant={stats.overdue > 0 ? 'warning' : 'default'}
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
          icon={<Search size={16} />}
        />
        <Select
          label="View Mode"
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          options={viewModes}
        />
      </div>

      {/* Bulk Actions */}
      {selectedOrders.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-center justify-between">
          <span className="text-sm font-medium">
            {selectedOrders.size} order{selectedOrders.size !== 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setBulkStatusModal(true)}
            >
              Change Status
            </Button>
            <Button variant="outline" onClick={handleBulkPrint}>
              Print
            </Button>
            <Button variant="outline" onClick={handleBulkExport}>
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
        description="Are you sure you want to delete this order? This action cannot be undone."
        onConfirm={handleDeleteOrder}
        confirmText="Delete"
        confirmVariant="destructive"
      />

      {/* Bulk Status Change Modal */}
      <Modal
        isOpen={bulkStatusModal}
        onClose={() => setBulkStatusModal(false)}
        title="Change Status"
        description={`Change status for ${selectedOrders.size} order${selectedOrders.size !== 1 ? 's' : ''}`}
      >
        <Select
          label="New Status"
          value={bulkNewStatus}
          onChange={(e) => setBulkNewStatus(e.target.value)}
          options={statuses.map((status) => ({
            value: status,
            label: status,
          }))}
        />
        <div className="mt-4 flex gap-2">
          <Button onClick={handleBulkStatusChange}>Apply</Button>
          <Button
            variant="outline"
            onClick={() => setBulkStatusModal(false)}
          >
            Cancel
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default OrdersPage;
