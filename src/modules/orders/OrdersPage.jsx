import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { orders as ordersDb } from '../../lib/db';
import { useRealtimeTable, markSelfWrite } from '../../hooks/useRealtimeTable';
import { useStickyState } from '../../hooks/useStickyState';
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

  // URL-driven filters — Dashboard StatCards + Ctrl+K palette deep-link here
  // with ?status=<s>, ?filter=pending, or ?priority=urgent.
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('status') || 'all';
  const virtualFilter = searchParams.get('filter'); // 'pending' = not draft/completed/cancelled
  const priorityFilter = searchParams.get('priority'); // 'urgent' = overdue balance
  // State management
  const [ordersList, setOrdersList] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  // Filters that persist across page reloads — per-user sticky state
  const [pageSize, setPageSize] = useStickyState('orders.pageSize', 50);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ totalOrders: 0, activeOrders: 0, totalRevenue: 0, outstandingBalance: 0, overdue: 0 });
  const [statusPipeline, setStatusPipeline] = useState({});
  const [selectedOrders, setSelectedOrders] = useState(new Set());
  const [activeTab, setActiveTab] = useState(initialTab);
  const [dateRange, setDateRange] = useStickyState('orders.dateRange', 'allTime');
  const [customerFilter, setCustomerFilter] = useState('');
  const [viewMode, setViewMode] = useStickyState('orders.viewMode', 'allInfo');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [bulkStatusModal, setBulkStatusModal] = useState(false);
  const [bulkNewStatus, setBulkNewStatus] = useState('');

  // Debounce the customer search input so each keystroke doesn't trigger a round trip
  const [customerDebounced, setCustomerDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setCustomerDebounced(customerFilter), 300);
    return () => clearTimeout(t);
  }, [customerFilter]);

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

  // Calculate date range — returns ISO timestamps for server-side filter
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

  // Resolve the effective status to send to the server (tab OR pipeline chip)
  const effectiveStatus = useMemo(() => {
    if (selectedStatus) return selectedStatus;
    return activeTab;
  }, [activeTab, selectedStatus]);

  // Load orders — server-side paginated + filtered
  const loadOrders = useCallback(async (showSpinner = true) => {
    if (!user?.id) return;
    try {
      if (showSpinner) setLoading(true);
      const { start, end } = getDateRange(dateRange);
      const { data, count, error } = await ordersDb.listPaged({
        page,
        pageSize,
        status: effectiveStatus,
        customerTerm: customerDebounced,
        dateFrom: start ? start.toISOString() : undefined,
        dateTo: end ? end.toISOString() : undefined,
        pending: virtualFilter === 'pending',
        urgent: priorityFilter === 'urgent',
      });
      if (error) throw error;
      setOrdersList(data || []);
      setTotalCount(count || 0);
    } catch (error) {
      toast.error('Failed to load orders');
      if (import.meta.env.DEV) console.error('Error loading orders:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id, page, pageSize, effectiveStatus, customerDebounced, dateRange, virtualFilter, priorityFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Summary stats + status pipeline counts — unaffected by current page
  const loadSummary = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [sRes, cRes] = await Promise.all([
        ordersDb.summary(),
        ordersDb.statusCounts(),
      ]);
      if (sRes?.data) setStats(sRes.data);
      if (cRes?.data) setStatusPipeline(cRes.data);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading summary:', error);
    }
  }, [user?.id]);

  // Reset to page 0 whenever a server-side filter (not page itself) changes.
  // Using sync-state-during-render avoids the extra render + double fetch
  // that useEffect+setState would cause (old loadOrders would run once on
  // filter change and again after page reset).
  const filterKey = JSON.stringify({ effectiveStatus, customerDebounced, dateRange, virtualFilter, priorityFilter, pageSize });
  const prevFilterKey = useRef(filterKey);
  if (prevFilterKey.current !== filterKey) {
    prevFilterKey.current = filterKey;
    if (page !== 0) setPage(0);
  }

  // Load on mount and whenever paged filters change
  useEffect(() => { loadOrders(); }, [loadOrders]);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  // Live sync. Echoes from our own writes only refresh the visible list
  // (cheap, paged). Foreign writes additionally refresh stats + pipeline
  // and show a toast.
  useRealtimeTable('orders', (payload) => {
    loadOrders(false);
    if (payload && !payload.isEcho) {
      loadSummary();
      const evt = payload.eventType === 'DELETE' ? 'deleted' : payload.eventType === 'INSERT' ? 'created' : 'updated'
      const num = payload.new?.order_number || payload.old?.order_number || ''
      toast.info?.(`Order ${num} ${evt} by another user`, { duration: 3000 }) || toast.success(`Order ${num} ${evt}`)
    }
  });

  // Re-fetch silently when tab regains focus after 5+ min idle
  useEffect(() => {
    let lastHidden = 0;
    const handler = () => {
      if (document.visibilityState === 'hidden') {
        lastHidden = Date.now();
      } else if (document.visibilityState === 'visible' && lastHidden > 0) {
        if (Date.now() - lastHidden > 5 * 60 * 1000) {
          loadOrders(false);
        }
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [loadOrders]);

  // Server already applied all filters — rendered rows = ordersList
  const filteredOrders = ordersList;

  // Total pages from server count
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  // Handle bulk actions
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const handleBulkStatusChange = async () => {
    if (!bulkNewStatus || selectedOrders.size === 0 || bulkUpdating) return;

    setBulkUpdating(true);
    try {
      const orderIds = Array.from(selectedOrders);
      markSelfWrite('orders');
      const results = await Promise.allSettled(orderIds.map(id => ordersDb.updateStatus(id, bulkNewStatus)));
      const failed = results.filter(r => r.status === 'rejected' || r.value?.error);
      if (failed.length > 0) {
        toast.error(`${failed.length} of ${orderIds.length} updates failed`);
      } else {
        toast.success(`Updated ${orderIds.length} orders to ${bulkNewStatus}`);
      }
      setSelectedOrders(new Set());
      setBulkStatusModal(false);
      await Promise.all([loadOrders(false), loadSummary()]);
    } catch (error) {
      toast.error('Failed to update orders');
      if (import.meta.env.DEV) console.error('Error:', error);
    } finally {
      setBulkUpdating(false);
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
      markSelfWrite('orders');
      const { error } = await ordersDb.delete(deleteTarget);
      if (error) throw error;
      toast.success('Order deleted');
      setShowDeleteModal(false);
      setDeleteTarget(null);
      setDeleteWarnings([]);
      await Promise.all([loadOrders(false), loadSummary()]);
    } catch (error) {
      toast.error(error?.message || 'Failed to delete order');
      if (import.meta.env.DEV) console.error('Error:', error);
    } finally {
      setDeleting(false);
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
              {statusLabel(status)} ({statusPipeline[status] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Tab Bar */}
      <div className="border-b border-gray-200">
        <div className="flex gap-6">
          {['all', ...statuses].map((tab) => (
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
              {tab === 'all' ? 'All' : statusLabel(tab)}
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
            { value: 'allTime', label: 'All Time' },
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

        {/* Pagination footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-sm">
          <div className="flex items-center gap-3 text-slate-600">
            <span>
              {totalCount === 0
                ? '0 results'
                : `${page * pageSize + 1}–${Math.min((page + 1) * pageSize, totalCount)} of ${totalCount}`}
            </span>
            <Select
              value={String(pageSize)}
              onChange={(e) => {
                setPageSize(Number(e.target.value) || 50);
                setPage(0);
              }}
              options={[
                { value: '25', label: '25 / page' },
                { value: '50', label: '50 / page' },
                { value: '100', label: '100 / page' },
                { value: '200', label: '200 / page' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 0}
              onClick={() => setPage(0)}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              title="First page"
            >
              «
            </button>
            <button
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 inline-flex items-center gap-1"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="px-2 text-slate-500">
              Page {page + 1} of {totalPages}
            </span>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 inline-flex items-center gap-1"
            >
              Next <ChevronRight size={14} />
            </button>
            <button
              disabled={page + 1 >= totalPages}
              onClick={() => setPage(totalPages - 1)}
              className="px-2 py-1 rounded border border-slate-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              title="Last page"
            >
              »
            </button>
          </div>
        </div>
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
