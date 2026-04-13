import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Send,
  Printer,
  Edit,
  ChevronRight,
  Plus,
  MessageSquare,
  Download,
  Upload,
  Truck,
  CreditCard,
  AlertTriangle,
  IndianRupee,
  Phone,
  Mail,
  Copy,
  FileText,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
} from 'lucide-react';
// eslint-disable-next-line no-unused-vars
import { orders, deliveries, activityLog, attachments, payments } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Modal, Input, StatusBadge, Badge, Currency, Spinner } from '../../components/ui';

export default function OrderDetail() {
  const { id: orderId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [order, setOrder] = useState(null);
  const [orderDeliveries, setOrderDeliveries] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [orderAttachments, setOrderAttachments] = useState([]);
  const [loading, setLoading] = useState(true);

  const [showAddDelivery, setShowAddDelivery] = useState(false);
  const [showAddComment, setShowAddComment] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  // eslint-disable-next-line no-unused-vars
  const [showSendUpdate, setShowSendUpdate] = useState(false);
  const [deliveryForm, setDeliveryForm] = useState({ lineId: '', date: '', qty: '', note: '', challan: '', vehicle: '' });
  const [commentText, setCommentText] = useState('');
  const [cancelReason, setCancelReason] = useState('');

  const loadOrderData = useCallback(async () => {
    try {
      setLoading(true);
      const [orderRes, deliveryRes, timelineRes, attachmentRes] = await Promise.all([
        orders.get(orderId),
        deliveries.listByOrder(orderId),
        activityLog.listByEntity('order', orderId),
        attachments.listByEntity('order', orderId),
      ]);

      setOrder(orderRes.data);
      setOrderDeliveries(deliveryRes.data || []);
      setTimeline((timelineRes.data || []).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      setOrderAttachments(attachmentRes.data || []);
    } catch (error) {
      toast.error('Failed to load order details');
      if (import.meta.env.DEV) console.error(error);
    } finally {
      setLoading(false);
    }
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadOrderData();
  }, [loadOrderData]);

  const getStatusProgression = () => {
    const states = ['draft', 'booking', 'approved', 'production', 'qc', 'dispatch', 'completed'];
    const currentIndex = states.indexOf(order?.status);
    const nextIndex = currentIndex + 1;
    if (nextIndex >= states.length || order?.status === 'cancelled') return null;
    const nextState = states[nextIndex];
    // eslint-disable-next-line no-unused-vars
    const labels = { draft: 'Create Booking', booking: 'Approve', approved: 'Start Production', production: 'QC', qc: 'Dispatch', dispatch: 'Complete' };
    return { nextState, label: `Move to ${nextState} →`, current: order?.status };
  };

  const handleAddDelivery = async () => {
    if (!deliveryForm.lineId || !deliveryForm.date || !deliveryForm.qty) {
      toast.error('Please fill all required fields');
      return;
    }
    try {
      await deliveries.create({
        order_id: orderId,
        line_item_id: deliveryForm.lineId,
        delivery_date: deliveryForm.date,
        delivered_qty: parseFloat(deliveryForm.qty),
        note: deliveryForm.note,
        challan_number: deliveryForm.challan,
        vehicle_number: deliveryForm.vehicle,
      });
      await activityLog.create({
        entity_type: 'order',
        entity_id: orderId,
        action: 'delivery',
        comment: `Delivery of ${deliveryForm.qty} units recorded`,
        staff_id: user.id,
      });
      setDeliveryForm({ lineId: '', date: '', qty: '', note: '', challan: '', vehicle: '' });
      setShowAddDelivery(false);
      await loadOrderData();
      toast.success('Delivery recorded');
    // eslint-disable-next-line no-unused-vars
    } catch (error) {
      toast.error('Failed to record delivery');
    }
  };

  const handleAddComment = async () => {
    if (!commentText.trim()) return;
    try {
      await activityLog.create({
        entity_type: 'order',
        entity_id: orderId,
        action: 'comment',
        comment: commentText,
        staff_id: user.id,
      });
      setCommentText('');
      setShowAddComment(false);
      await loadOrderData();
      toast.success('Comment added');
    // eslint-disable-next-line no-unused-vars
    } catch (error) {
      toast.error('Failed to add comment');
    }
  };

  const handleStatusChange = async () => {
    const progression = getStatusProgression();
    if (!progression) return;
    try {
      await orders.update(orderId, { status: progression.nextState });
      await activityLog.create({
        entity_type: 'order',
        entity_id: orderId,
        action: 'status_change',
        comment: `Status changed from ${progression.current} to ${progression.nextState}${cancelReason ? ': ' + cancelReason : ''}`,
        staff_id: user.id,
      });
      setShowStatusModal(false);
      setCancelReason('');
      await loadOrderData();
      toast.success(`Order moved to ${progression.nextState}`);
    // eslint-disable-next-line no-unused-vars
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleSendUpdate = (method) => {
    const customerPhone = order?.customers?.phone;
    const customerEmail = order?.customers?.email;
    const message = `Order #${order?.order_number} - Status: ${order?.status}`;

    if (method === 'whatsapp' && customerPhone) {
      window.open(`https://wa.me/${customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`);
    } else if (method === 'email' && customerEmail) {
      window.location.href = `mailto:${customerEmail}?subject=Order ${order?.order_number}&body=${encodeURIComponent(message)}`;
    } else if (method === 'copy') {
      navigator.clipboard.writeText(message);
      toast.success('Message copied to clipboard');
    } else {
      toast.error('Contact information not available');
    }
    setShowSendUpdate(false);
  };

  const getDeliveryProgress = (lineItem) => {
    const totalQty = lineItem.meters || lineItem.weight_kg || 0;
    const deliveredQty = orderDeliveries
      .filter(d => d.line_item_id === lineItem.id)
      .reduce((sum, d) => sum + d.delivered_qty, 0);
    const percentage = totalQty > 0 ? Math.round((deliveredQty / totalQty) * 100) : 0;
    return { deliveredQty, totalQty, percentage };
  };

  const getTotalAmount = () => {
    return order?.grand_total || 0;
  };

  const getTotalAdvance = () => {
    return order?.advance_paid || 0;
  };

  const getTimelineIcon = (type) => {
    const icons = {
      status_change: <CheckCircle className="w-5 h-5 text-indigo-600" />,
      delivery: <Truck className="w-5 h-5 text-emerald-600" />,
      payment: <CreditCard className="w-5 h-5 text-green-600" />,
      comment: <MessageSquare className="w-5 h-5 text-blue-600" />,
      edit: <Edit className="w-5 h-5 text-amber-600" />,
    };
    return icons[type] || <Clock className="w-5 h-5 text-slate-400" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <Spinner />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-600">Order not found</p>
      </div>
    );
  }

  const progression = getStatusProgression();

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-start gap-4">
            <button
              onClick={() => navigate('/orders')}
              className="p-2 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-700" />
            </button>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-xl font-bold text-slate-900">Order {order.order_number}</h1>
                <StatusBadge status={order.status} />
                {order.priority && <Badge variant={order.priority === 'high' ? 'red' : 'amber'}>{order.priority}</Badge>}
              </div>
              <p className="text-slate-600">{order.customers?.firm_name}</p>
            </div>
          </div>

          <div className="flex gap-2">
            {/* Send Update */}
            <div className="relative group">
              <Button variant="secondary" size="sm">
                <Send size={16} /> Send Update
              </Button>
              <div className="absolute right-0 mt-1 w-40 bg-white rounded-xl shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-10">
                <button
                  onClick={() => handleSendUpdate('whatsapp')}
                  className="w-full px-4 py-2 text-left hover:bg-slate-100 flex items-center gap-2 text-sm text-slate-700 first:rounded-t-xl"
                >
                  <Phone className="w-4 h-4" /> WhatsApp
                </button>
                <button
                  onClick={() => handleSendUpdate('email')}
                  className="w-full px-4 py-2 text-left hover:bg-slate-100 flex items-center gap-2 text-sm text-slate-700"
                >
                  <Mail className="w-4 h-4" /> Email
                </button>
                <button
                  onClick={() => handleSendUpdate('copy')}
                  className="w-full px-4 py-2 text-left hover:bg-slate-100 flex items-center gap-2 text-sm text-slate-700 last:rounded-b-xl"
                >
                  <Copy className="w-4 h-4" /> Copy
                </button>
              </div>
            </div>

            {/* Print */}
            <div className="relative group">
              <Button variant="secondary" size="sm">
                <Printer size={16} /> Print
              </Button>
              <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-10">
                <button className="w-full px-4 py-2 text-left hover:bg-slate-100 flex items-center gap-2 text-sm text-slate-700 first:rounded-t-xl">
                  <FileText className="w-4 h-4" /> Order Confirmation
                </button>
                <button className="w-full px-4 py-2 text-left hover:bg-slate-100 flex items-center gap-2 text-sm text-slate-700">
                  <FileText className="w-4 h-4" /> Production Slip
                </button>
                <button className="w-full px-4 py-2 text-left hover:bg-slate-100 flex items-center gap-2 text-sm text-slate-700 last:rounded-b-xl">
                  <FileText className="w-4 h-4" /> Delivery Challan
                </button>
              </div>
            </div>

            <Button variant="secondary" size="sm" onClick={() => navigate(`/orders/${orderId}/edit`)}>
              <Edit size={16} /> Edit
            </Button>

            {progression && (
              <Button
                onClick={() => setShowStatusModal(true)}
                variant="success"
                size="sm"
              >
                <ChevronRight size={16} /> {progression.label}
              </Button>
            )}
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm mb-1">Grand Total</p>
                <p className="text-2xl font-bold text-slate-900">
                  <Currency amount={getTotalAmount()} />
                </p>
              </div>
              <IndianRupee className="w-10 h-10 text-indigo-600 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm mb-1">Advance Paid</p>
                <p className="text-2xl font-bold text-green-600">
                  <Currency amount={getTotalAdvance()} />
                </p>
              </div>
              <CreditCard className="w-10 h-10 text-green-600 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm mb-1">Balance Due</p>
                <p className="text-2xl font-bold text-red-600">
                  <Currency amount={order?.balance_due || 0} />
                </p>
              </div>
              <AlertTriangle className="w-10 h-10 text-red-600 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-600 text-sm mb-1">Next Delivery</p>
                <p className="text-lg font-bold text-blue-600">
                  {order.delivery_date_1 ? new Date(order.delivery_date_1).toLocaleDateString() : 'N/A'}
                </p>
              </div>
              <Truck className="w-10 h-10 text-blue-600 opacity-20" />
            </div>
          </div>
        </div>

        {/* Delivery Progress */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-slate-900">Per-Line Delivery Progress</h2>
            <Button size="sm" onClick={() => setShowAddDelivery(true)}>
              <Plus size={16} /> Add Delivery
            </Button>
          </div>

          <div className="space-y-4">
            {order.order_line_items?.map(line => {
              const progress = getDeliveryProgress(line);
              const barColor = progress.percentage === 100 ? 'bg-emerald-500' : 'bg-indigo-600';
              const productName = line.products?.name || line.materials?.name || 'Item';
              const quantity = line.meters || line.weight_kg || 0;
              const unit = line.meters ? 'meters' : 'kg';
              return (
                <div key={line.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-semibold text-slate-900">{productName}</p>
                      <p className="text-sm text-slate-600">{quantity} {unit}</p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{progress.percentage}%</p>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div className={`h-2 rounded-full ${barColor}`} style={{ width: `${progress.percentage}%` }} />
                  </div>
                  <p className="text-xs text-slate-600 mt-2">
                    {progress.deliveredQty} of {progress.totalQty} delivered
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 mb-6">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Line Items</h2>
          <div className="space-y-3">
            {order.order_line_items?.map(line => {
              const productName = line.products?.name || line.materials?.name || 'Item';
              const isJobwork = line.line_type === 'jobwork';
              const quantity = line.meters || line.weight_kg || 0;
              const unit = line.meters ? 'meters' : 'kg';
              return (
                <div key={line.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="font-semibold text-slate-900">{productName}</p>
                      {isJobwork && (
                        <div className="flex items-center gap-2 mt-2 p-2 bg-amber-50 rounded-lg border border-amber-200">
                          <AlertCircle className="w-4 h-4 text-amber-600" />
                          <p className="text-xs text-amber-700">Material tracking required for jobwork</p>
                        </div>
                      )}
                    </div>
                    {line.line_type && <Badge variant="secondary">{line.line_type}</Badge>}
                  </div>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-slate-600">Width</p>
                      <p className="font-semibold text-slate-900">{line.width_cm || 'N/A'} cm</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Quantity</p>
                      <p className="font-semibold text-slate-900">{quantity} {unit}</p>
                    </div>
                    <div>
                      <p className="text-slate-600">Weight</p>
                      <p className="font-semibold text-slate-900">{line.weight_kg || 'N/A'} kg</p>
                    </div>
                    <div className="text-right">
                      <p className="text-slate-600">Rate</p>
                      <p className="font-semibold text-slate-900">
                        <Currency amount={line.rate_per_unit} />
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between">
                    <p className="text-slate-600">Amount</p>
                    <p className="font-bold text-slate-900">
                      <Currency amount={(line.rate_per_unit || 0) * quantity} />
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Activity Timeline */}
        <div className="grid grid-cols-3 gap-6">
          <div className="col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">Activity Timeline</h2>
              <Button size="sm" variant="secondary" onClick={() => setShowAddComment(true)}>
                <MessageSquare size={16} /> Add Comment
              </Button>
            </div>
            <div className="space-y-4">
              {timeline.map((event, idx) => (
                <div key={idx} className="flex gap-4 pb-4 border-b border-slate-200 last:border-0">
                  <div className="flex-shrink-0 mt-1">{getTimelineIcon(event.action)}</div>
                  <div className="flex-1">
                    <p className="text-slate-900">
                      <span className="font-semibold">{event.staff_id || user.name}</span>{' '}
                      <span className="text-slate-600">{event.comment}</span>
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      {new Date(event.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Attachments */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-900">Attachments</h2>
              <Button size="sm" variant="secondary">
                <Upload size={16} /> Upload
              </Button>
            </div>
            <div className="space-y-3">
              {orderAttachments.map(att => (
                <div
                  key={att.id}
                  className="border border-slate-200 rounded-lg p-3 flex items-center gap-3 hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <FileText className="w-5 h-5 text-indigo-600" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{att.file_name}</p>
                    <p className="text-xs text-slate-500">{(att.file_size / 1024).toFixed(1)} KB</p>
                  </div>
                  <Download className="w-4 h-4 text-slate-600 flex-shrink-0" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal open={showAddDelivery} onClose={() => setShowAddDelivery(false)} title="Add Delivery">
        <div className="space-y-4">
          <select
            value={deliveryForm.lineId}
            onChange={e => setDeliveryForm({ ...deliveryForm, lineId: e.target.value })}
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">Select Line Item</option>
            {order.order_line_items?.map(line => {
              const productName = line.products?.name || line.materials?.name || 'Item';
              const quantity = line.meters || line.weight_kg || 0;
              const unit = line.meters ? 'meters' : 'kg';
              return (
                <option key={line.id} value={line.id}>
                  {productName} - {quantity} {unit}
                </option>
              );
            })}
          </select>
          <Input
            type="date"
            label="Delivery Date"
            value={deliveryForm.date}
            onChange={e => setDeliveryForm({ ...deliveryForm, date: e.target.value })}
          />
          <Input
            type="number"
            label="Quantity"
            value={deliveryForm.qty}
            onChange={e => setDeliveryForm({ ...deliveryForm, qty: e.target.value })}
            placeholder="0"
          />
          <Input
            label="Note"
            value={deliveryForm.note}
            onChange={e => setDeliveryForm({ ...deliveryForm, note: e.target.value })}
            placeholder="Optional note"
          />
          <Input
            label="Challan Number"
            value={deliveryForm.challan}
            onChange={e => setDeliveryForm({ ...deliveryForm, challan: e.target.value })}
          />
          <Input
            label="Vehicle Number"
            value={deliveryForm.vehicle}
            onChange={e => setDeliveryForm({ ...deliveryForm, vehicle: e.target.value })}
          />
          <div className="flex gap-3 pt-4">
            <Button onClick={handleAddDelivery} variant="primary" className="flex-1">
              Record Delivery
            </Button>
            <Button onClick={() => setShowAddDelivery(false)} variant="secondary" className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showAddComment} onClose={() => setShowAddComment(false)} title="Add Comment">
        <div className="space-y-4">
          <textarea
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="Write your comment..."
            className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 h-32 resize-none"
          />
          <div className="flex gap-3 pt-4">
            <Button onClick={handleAddComment} variant="primary" className="flex-1">
              Add Comment
            </Button>
            <Button onClick={() => setShowAddComment(false)} variant="secondary" className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={showStatusModal} onClose={() => setShowStatusModal(false)} title="Confirm Status Change">
        <div className="space-y-4">
          <p className="text-slate-700">
            Move order to <span className="font-semibold">{progression?.nextState}</span>?
          </p>
          {progression?.nextState === 'cancelled' && (
            <Input
              label="Reason for Cancellation"
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="Provide cancellation reason"
            />
          )}
          <div className="flex gap-3 pt-4">
            <Button onClick={handleStatusChange} variant="primary" className="flex-1">
              Confirm
            </Button>
            <Button onClick={() => setShowStatusModal(false)} variant="secondary" className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
