import { useState } from 'react';
import { Copy, Calendar, ChevronDown } from 'lucide-react';
import { Select, Input, Button } from '../../../components/ui';
import { CustomerSearch } from '../components/CustomerSearch';

// yyyy-mm-dd in local timezone — avoids the "date shifts by a day" bug from
// toISOString() (which is UTC). Operator sets Indian dates, not UTC dates.
const toLocalDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const addDays = (days) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
};

const DATE_CHIPS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: '+7d', days: 7 },
  { label: '+15d', days: 15 },
  { label: '+30d', days: 30 },
];

export function StepCustomer({
  formData,
  setFormData,
  selectedCustomer,
  onCustomerSelect,
  onDuplicateLastOrder,
  orderTypes,
  paymentTerms,
  brokers,
  currencies,
}) {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-2">Customer</label>
        <CustomerSearch onSelect={onCustomerSelect} value={selectedCustomer} />
      </div>

      {selectedCustomer && (
        <>
          {onDuplicateLastOrder && (
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
              <Copy size={14} className="text-emerald-600 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-emerald-900">Speed up repeat orders</p>
                <p className="text-xs text-emerald-700">Copy line items, charges &amp; terms from this customer&apos;s last order.</p>
              </div>
              <Button size="sm" variant="secondary" onClick={onDuplicateLastOrder}>
                Duplicate Last Order
              </Button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-200">
            <Select
              label="Order Type"
              required
              value={formData.order_type_id || ''}
              onChange={(e) => setFormData({ ...formData, order_type_id: e.target.value })}
              options={[
                { value: '', label: 'Select order type' },
                ...(orderTypes || []).map((type) => ({ value: type.id, label: type.name })),
              ]}
            />

            <Select
              label="Order Nature"
              value={formData.nature}
              onChange={(e) => setFormData({ ...formData, nature: e.target.value })}
              options={[
                { value: 'sample', label: 'Sample' },
                { value: 'production', label: 'Production' },
                { value: 'export', label: 'Export' },
              ]}
            />

            <Select
              label="Priority"
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
              options={[
                { value: 'normal', label: 'Normal' },
                { value: 'high', label: 'High' },
                { value: 'urgent', label: 'Urgent' },
              ]}
            />

            <Select
              label="Payment Terms"
              required
              value={formData.payment_terms_id || ''}
              onChange={(e) => setFormData({ ...formData, payment_terms_id: e.target.value })}
              options={[
                { value: '', label: 'Select payment terms' },
                ...(paymentTerms || []).map((term) => ({ value: term.id, label: term.name })),
              ]}
            />
          </div>

          {/* Advanced — broker + currency hidden under accordion since most orders
              don't change them per-order (operator pre-fills from customer master). */}
          <div>
            <button
              type="button"
              onClick={() => setAdvancedOpen((v) => !v)}
              className="flex items-center gap-2 text-sm text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <ChevronDown size={14} className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
              Advanced (Broker, Currency)
            </button>
            {advancedOpen && (
              <div className="grid grid-cols-2 gap-6 mt-4">
                <Select
                  label="Broker"
                  value={formData.broker_id || ''}
                  onChange={(e) => setFormData({ ...formData, broker_id: e.target.value })}
                  options={[
                    { value: '', label: 'No broker' },
                    ...(brokers || []).map((broker) => ({ value: broker.id, label: broker.name })),
                  ]}
                />

                <Select
                  label="Currency"
                  value={formData.currency_code || 'INR'}
                  onChange={(e) => setFormData({ ...formData, currency_code: e.target.value })}
                  options={[
                    ...(currencies?.length ? currencies : [{ code: 'INR' }]).map((c) => ({ value: c.code || 'INR', label: c.code || 'INR' })),
                  ]}
                />
              </div>
            )}
          </div>

          {/* Delivery dates with quick chips — "Tomorrow" + "+7d" covers 80% of booking cases */}
          <div className="pt-6 border-t border-slate-200">
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              <Calendar size={14} className="inline mr-1.5 mb-0.5" />
              Delivery Dates
            </label>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {DATE_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => setFormData({ ...formData, delivery_date_1: addDays(chip.days) })}
                  className="px-2.5 py-1 text-xs rounded-md bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-600 transition-colors"
                >
                  {chip.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Primary Date"
                type="date"
                value={formData.delivery_date_1 || ''}
                onChange={(e) => setFormData({ ...formData, delivery_date_1: e.target.value })}
              />
              <Input
                label="Secondary Date"
                type="date"
                value={formData.delivery_date_2 || ''}
                onChange={(e) => setFormData({ ...formData, delivery_date_2: e.target.value })}
              />
              <Input
                label="Final Date"
                type="date"
                value={formData.delivery_date_3 || ''}
                onChange={(e) => setFormData({ ...formData, delivery_date_3: e.target.value })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
