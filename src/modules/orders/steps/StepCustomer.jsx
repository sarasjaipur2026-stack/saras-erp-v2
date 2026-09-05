import { Select, SearchSelect, Input } from '../../../components/ui';
import { CustomerSearch } from '../components/CustomerSearch';

export function StepCustomer({
  formData,
  setFormData,
  selectedCustomer,
  onCustomerSelect,
  orderTypes,
  paymentTerms,
  brokers,
  currencies,
}) {
  return (
    <div className="space-y-6">
      <div>
        <label className="block text-sm font-semibold text-slate-900 mb-2">Customer</label>
        <CustomerSearch onSelect={onCustomerSelect} value={selectedCustomer} />
      </div>

      {selectedCustomer && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6 pt-6 border-t border-slate-200">
          <Select
            label="Order Type"
            value={formData.order_type_id || ''}
            onChange={(e) => { const value = e.target.value; setFormData((prev) => ({ ...prev, order_type_id: value })); }}
            options={[
              { value: '', label: 'Select order type' },
              ...(orderTypes || []).map((type) => ({ value: type.id, label: type.name })),
            ]}
          />

          <Select
            label="Order Nature"
            value={formData.nature}
            onChange={(e) => { const value = e.target.value; setFormData((prev) => ({ ...prev, nature: value })); }}
            options={[
              { value: 'sample', label: 'Sample' },
              { value: 'production', label: 'Production' },
              { value: 'export', label: 'Export' },
            ]}
          />

          <Select
            label="Priority"
            value={formData.priority}
            onChange={(e) => { const value = e.target.value; setFormData((prev) => ({ ...prev, priority: value })); }}
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' },
            ]}
          />

          <Select
            label="Payment Terms"
            value={formData.payment_terms_id || ''}
            onChange={(e) => { const value = e.target.value; setFormData((prev) => ({ ...prev, payment_terms_id: value })); }}
            options={[
              { value: '', label: 'Select payment terms' },
              ...(paymentTerms || []).map((term) => ({ value: term.id, label: term.name })),
            ]}
          />

          <SearchSelect
            label="Broker"
            value={formData.broker_id || ''}
            placeholder="Search broker (optional)..."
            onChange={(option) => setFormData((prev) => ({ ...prev, broker_id: option.value }))}
            options={(brokers || []).map((broker) => ({ value: broker.id, label: broker.name }))}
          />

          <Select
            label="Currency"
            value={formData.currency_id || ''}
            onChange={(e) => { const value = e.target.value; setFormData((prev) => ({ ...prev, currency_id: value || null, currency_code: currencies.find(c => c.id === value)?.code || 'INR' })); }}
            options={[
              { value: '', label: 'Select currency' },
              ...(currencies || []).map((c) => ({ value: c.id, label: c.code })),
            ]}
          />

          <div className="lg:col-span-2 pt-6 border-t border-slate-200">
            <label className="block text-sm font-semibold text-slate-900 mb-4">Delivery Dates</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <Input
                  type="date"
                  value={formData.delivery_date_1 || ''}
                  onChange={(e) => { const value = e.target.value; setFormData((prev) => ({ ...prev, delivery_date_1: value })); }}
                  placeholder="Delivery Date 1"
                />
              </div>
              <div>
                <Input
                  type="date"
                  value={formData.delivery_date_2 || ''}
                  onChange={(e) => { const value = e.target.value; setFormData((prev) => ({ ...prev, delivery_date_2: value })); }}
                  placeholder="Delivery Date 2 (optional)"
                />
              </div>
              <div>
                <Input
                  type="date"
                  value={formData.delivery_date_3 || ''}
                  onChange={(e) => { const value = e.target.value; setFormData((prev) => ({ ...prev, delivery_date_3: value })); }}
                  placeholder="Delivery Date 3 (optional)"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
