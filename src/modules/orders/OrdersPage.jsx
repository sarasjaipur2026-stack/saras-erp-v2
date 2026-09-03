import React, { useState, useMemo, useCallback } from 'react';
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
import { useSWRList } from '../../hooks/useSWRList';
import { useQueryState } from '../../hooks/useQueryState';
import { downloadOrdersCsv, printOrders } from '../../lib/orderExport';
import {
  allVisibleRowsSelected,
  selectedRows as getSelectedRows,
  toggleAllVisibleRows,
} from '../../lib/orderFormModel';

const OrdersPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id;
  const toast = useToast();

  // Single stale-while-revalidate data source. Cached data renders
  // synchronously on first paint, while every mount refreshes in the
  // background so create/edit navigation never leaves order status or line
  // counts stale.
  const fetcher = useCallback(
    () => userId ? ordersDb.list(userId) : Promise.resolve({ data: [] }),
    [userId],
  )
  const cacheKey = userId ? `saras_orders_v1_${userId}` : null
  const {
    data: ordersList,
    loading,
    refresh: reloadOrders,
  } = useSWRList(cacheKey, fetcher, { staleAfterMs: 0 })
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  // Filter state is URL-backed so sharing / bookmarking a view works.
  const [activeTab, setActiveTab] = useQueryState('tab', 'all');
  const [dateRange, setDateRange] = useQueryState('range', 'allTime');
  const [customerFilter, setCustomerFilter] = useQueryState('q', '');
  const [viewMode, setViewMode] = useQueryState('view', 'allInfo');
  const [openMenuId, setOpenMenuId] = useState(null);
  const statusPipeline = useMemo(() => {
    const pipeline = {};
    ordersList.forEach((order) => {
      const status = (order.status || 'draft').toLowerCase();
      pipeline[status] = (pipeline[status] || 0) + 1;
    });
    return pipeline;
  }, [ordersList]);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkStatusModal, setBulkStatusModal] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState('');

  const statuses = [
    'draft',
    'booking',
    'approved',
    'production',
    'qc',
    'dispatch',
    'completed',
    'cancelled',
  ];

  // Display-friendly status label
  const statusLabel = (s) => s === 'qc' ? 'QC' : s.charAt(0).toUpperCase() + s.slice(1);

  const viewModes = [
    { id: 'allInfo', label: 'All Info' },
    { id: 'simple', label: 'Simple' },
    { id: 'finance', label: 'Finance' },
  ];

  // Calculate date range
  const getDateRange = (range) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const fiscalYear = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
    const startOfFiscalYear = new Date(fiscalYear, 3, 1);

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
        return { start: startOfFiscalYear, end: new Date() };
      default:
        return { start: null, end: null };
    }
  };

  // Mount-time load and visibility-revalidate are handled inside useSWRList.
  // We only expose `reloadOrders` for explicit triggers (delete/update flows).

  // Derived: filtered orders (computed, not stored in state)
  const filteredOrders = useMemo(() => {
    let filtered = ordersList;

    if (activeTab !== 'all') {
      filtered = filtered.filter((order) => (order.status || 'draft').toLowerCase() === activeTab);
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
  }, [ordersList, activeTab, dateRange, customerFilter]);

  // Derived: statistics (computed from ordersList)
  const stats = useMemo(() => {
    const now = new Date();
    const activeStatuses = new Set(['production', 'qc', 'dispatch']);
    let activeOrders = 0, totalRevenue = 0, outstandingBalance = 0, overdue = 0;

    for (const o of ordersList) {
      const status = (o.status || 'draft').toLowerCase();
      if (activeStatuses.has(status)) activeOrders++;
      totalRevenue += Number(o.grand_total || 0);
      outstandingBalance += Number(o.balance_due || 0);
      if (o.delivery_date_1 && new Date(o.delivery_date_1) < now && status !== 'completed') overdue++;
    }
    return { totalOrders: ordersList.length, activeOrders, totalRevenue, outstandingBalance, overdue };
  }, [ordersList]);

  // Handle bulk actions
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const handleBulkStatusChange = async () => {
    if (!bulkNewStatus || selectedOrders.size === 0 || bulkUpdating) return;

    setBulkUpdating(true);
    try {
      const orderIds = Array.from(selectedOrders);
      const results = await Promise.allSettled(orderIds.map(id => ordersDb.updateStatus(id, bulkNewStatus)));
      const failed = results.filter(r => r.status === 'rejected' || r.value?.error);
      if (failed.length > 0) {
        toast.error(`${failed.length} of ${orderIds.length} updates failed`);
      } else {
        toast.success(`Updated ${orderIds.length} orders to ${bulkNewStatus}`);
      }
      setSelectedOrders(new Set());
      setBulkStatusModal(false);
      await reloadOrders();
    } catch (error) {
      toast.error('Failed to update orders');
      if (import.meta.env.DEV) console.error('Error:', error);
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleBulkPrint = () => {
    const rows = getSelectedRows(ordersList, selectedOrders);
    if (rows.length === 0) {
      toast.error('Select orders to print');
      return;
    }
    printOrders(rows);
  };

  const handleBulkExport = () => {
    const rows = getSelectedRows(ordersList, selectedOrders);
    if (rows.length === 0) {
      toast.error('Select orders to export');
      return;
    }
    downloadOrdersCsv(rows, `orders-${new Date().toISOString().slice(0, 10)}.csv`);
    toast.success(`Exported ${rows.length} order${rows.length === 1 ? '' : 's'}`);
  };

  const [deleting, setDeleting] = useState(false);
  const [deleteWarnings, setDeleteWarnings] = useState([]);

  const confirmDelete = async (orderId) => {
    setDeleteTarget(orderId);
    setDeleteWarnings([]);
    setShowDeleteModal(true);
    // Check for linked records
    try {
      const warnings = [];
      const { data: prods } = await ordersDb.checkLinked?.(orderId, 'production_plans') ?? {};
      if (prods?.length) warnings.push(`${prods.length} production job(s)`);
      const { data: delivs } = await ordersDb.checkLinked?.(orderId, 'deliveries') ?? {};
      if (delivs?.length) warnings.push(`${delivs.length} dispatch(es)`);
      const { data: invs } = await ordersDb.checkLinked?.(orderId, 'invoices') ?? {};
      if (invs?.length) warnings.push(`${invs.length} invoice(s)`);
      const { data: pmts } = await ordersDb.checkLinked?.(orderId, 'payments') ?? {};
      if (pmts?.length) warnings.push(`${pmts.length} payment(s)`);
      setDeleteWarnings(warnings);
    } catch {
      // If check fails, still allow delete but with generic warning
      setDeleteWarnings(['Could not verify linked records — proceed with caution']);
    }
  };

  const handleDeleteOrder = async () => {
    if (!deleteTarget || deleting) return;

    setDeleting(true);
    try {
      const { error } = await ordersDb.delete(deleteTarget);
      if (error) throw error;
      toast.success('Order deleted');
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setDeleteWarnings([]);
      await reloadOrders();
    } catch (error) {
      toast.error(error?.message || 'Failed to delete order');
      if (import.meta.env.DEV) console.error('Error:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleSelectAll = () => {
    setSelectedOrders(current => toggleAllVisibleRows(filteredOrders, current));
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
        className: 'w-12 !px-4',
        label: (
          <input
            type="checkbox"
            aria-label="Select all visible orders"
            checked={
              allVisibleRowsSelected(filteredOrders, selectedOrders)
            }
            onChange={handleSelectAll}
            className="w-4 h-4"
          />
        ),
        render: (_value, row) => (
          <input
            type="checkbox"
            aria-label={`Select order ${row.order_number || ''}`}
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
        className: 'whitespace-nowrap',
        render: (value) => <span className="font-mono font-semibold text-indigo-700">{value || '—'}</span>,
      },
      {
        key: 'customers',
        label: 'Customer',
        className: 'min-w-[190px] max-w-[260px]',
        render: (_value, row) => (
          <div className="min-w-0">
            <p className="font-medium text-slate-800 truncate">
              {row.customers?.firm_name || row.customers?.contact_name || '—'}
            </p>
            {row.customers?.contact_name && row.customers.contact_name !== row.customers.firm_name && (
              <p className="text-xs text-slate-400 truncate mt-0.5">{row.customers.contact_name}</p>
            )}
          </div>
        ),
      },
    ];

    if (viewMode === 'allInfo' || viewMode === 'finance') {
      baseColumns.push({
        key: 'grand_total',
        label: 'Amount',
        className: 'whitespace-nowrap',
        render: (value) => <Currency amount={value || 0} />,
      });
    }

    if (viewMode === 'allInfo') {
      baseColumns.push(
        {
          key: 'priority',
          label: 'Priority',
          className: 'hidden 2xl:table-cell',
          render: (value) => (
            <Badge
              variant={
                value === 'urgent'
                  ? 'danger'
                  : value === 'high'
                  ? 'warning'
                  : 'default'
              }
            >
              <span className="capitalize">{value || 'normal'}</span>
            </Badge>
          ),
        },
        {
          key: 'status',
          label: 'Status',
          className: 'whitespace-nowrap',
          render: (value) => <StatusBadge status={value} />,
        },
        {
          key: 'created_at',
          label: 'Created',
          className: 'hidden xl:table-cell whitespace-nowrap',
          render: (value) =>
            value ? new Date(value).toLocaleDateString('en-IN') : '—',
        },
        {
          key: 'delivery_date_1',
          label: 'Delivery',
          className: 'hidden lg:table-cell whitespace-nowrap',
          render: (value) =>
            value ? new Date(value).toLocaleDateString('en-IN') : '—',
        },
        {
          key: 'order_line_items',
          label: 'Items',
          className: 'hidden 2xl:table-cell',
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
        className: 'whitespace-nowrap',
          render: (value) => <Currency amount={value || 0} />,
        },
        {
        key: 'advance_paid',
        label: 'Advance Paid',
        className: 'hidden xl:table-cell whitespace-nowrap',
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
      className: 'w-14 !px-3 text-right',
      render: (_value, row) => (
        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            aria-label={`Open actions for order ${row.order_number || ''}`}
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
                  navigate(`/orders/new?duplicate=${encodeURIComponent(row.id)}`)
                  setOpenMenuId(null)
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-[13px]"
              >
                <Copy size={14} /> Duplicate
              </button>
              <button
                onClick={() => {
                  printOrders([row])
                  setOpenMenuId(null)
                }}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center gap-2 text-[13px]"
              >
                <Printer size={14} /> Print
              </button>
              <button
                onClick={() => {
                  confirmDelete(row.id)
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
    <div className="fade-in max-w-[1500px] mx-auto space-y-5 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-indigo-600 mb-2">Sales workspace</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-950 tracking-tight">Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Track every booking from confirmation to dispatch.</p>
        </div>
        <Button size="lg" onClick={() => navigate('/orders/new')}>
          <Plus size={16} /> New Order
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5 gap-3 sm:gap-4">
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
          value={<Currency amount={stats.totalRevenue} compact />}
          icon={ShoppingCart}
          color="green"
        />
        <StatCard
          label="Outstanding"
          value={<Currency amount={stats.outstandingBalance} compact />}
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
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm shadow-slate-100">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Order pipeline</h2>
            <p className="text-xs text-slate-400 mt-0.5">Filter by the stage that needs attention</p>
          </div>
          <span className="text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2.5 py-1 whitespace-nowrap">
            {filteredOrders.length} shown
          </span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Order status filters">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            onClick={() => setActiveTab('all')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'all'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({ordersList.length})
          </button>
          {statuses.map((status) => (
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === status}
              key={status}
              onClick={() => setActiveTab(status)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === status
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {statusLabel(status)} ({statusPipeline[status] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm shadow-slate-100">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(190px,1fr)_minmax(240px,1.5fr)_minmax(190px,1fr)_auto] gap-3 items-end">
          <Select
            label="Date range"
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            options={[
              { value: 'allTime', label: 'All Time' },
              { value: 'today', label: 'Today' },
              { value: 'thisWeek', label: 'This Week' },
              { value: 'thisMonth', label: 'This Month' },
              { value: 'thisFY', label: 'This Fiscal Year' },
            ]}
          />
          <Input
            label="Customer"
            placeholder="Search firm or contact..."
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            icon={Search}
          />
          <Select
            label="View"
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            options={viewModes.map((v) => ({ value: v.id, label: v.label }))}
          />
          <Button
            variant="ghost"
            disabled={activeTab === 'all' && dateRange === 'allTime' && !customerFilter && viewMode === 'allInfo'}
            onClick={() => {
              setActiveTab('all');
              setDateRange('allTime');
              setCustomerFilter('');
              setViewMode('allInfo');
            }}
          >
            Reset
          </Button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedOrders.size > 0 && (
        <div className="sticky top-2 z-10 bg-indigo-50/95 backdrop-blur border border-indigo-200 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-sm">
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
      <DataTable
        columns={getTableColumns()}
        data={filteredOrders}
        onRowClick={handleRowClick}
        emptyTitle="No orders match this view"
        emptyDescription="Reset the filters or create a new order to get started."
        emptyIcon={ShoppingCart}
        emptyAction={<Button onClick={() => navigate('/orders/new')}><Plus size={15} /> New Order</Button>}
      />

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
            <Button variant="danger" size="sm" onClick={handleDeleteOrder} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          Are you sure you want to delete this order? This action cannot be undone.
        </p>
        {deleteWarnings.length > 0 && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
            <p className="text-sm font-semibold text-amber-800 mb-1">Warning — linked records found:</p>
            <ul className="text-sm text-amber-700 space-y-0.5">
              {deleteWarnings.map((w, i) => <li key={i}>• {w}</li>)}
            </ul>
            <p className="text-xs text-amber-600 mt-2">Deleting may cause orphaned data. Consider cancelling the order instead.</p>
          </div>
        )}
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
