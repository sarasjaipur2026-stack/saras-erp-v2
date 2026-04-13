import { Select, Input } from '../../../components/ui';
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
        <div className="grid grid-cols-2 gap-6 pt-6 border-t border-slate-200">
          <Select
            label="Order Type"
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
            value={formData.payment_terms_id || ''}
            onChange={(e) => setFormData({ ...formData, payment_terms_id: e.target.value })}
            options={[
              { value: '', label: 'Select payment terms' },
              ...(paymentTerms || []).map((term) => ({ value: term.id, label: term.name })),
            ]}
          />

          <Select
            label="Broker"
            value={formData.broker_id || ''}
            onChange={(e) => setFormData({ ...formData, broker_id: e.target.value })}
            options={[
              { value: '', label: 'Select broker (optional)' },
              ...(brokers || []).map((broker) => ({ value: broker.id, label: broker.name })),
            ]}
          />

          <Select
            label="Currency"
            value={formData.currency_id || ''}
            onChange={(e) => setFormData({ ...formData, currency_id: e.target.value })}
            options={[
              { value: '', label: 'Select currency' },
              ...(currencies || []).map((c) => ({ value: c.id, label: c.code })),
            ]}
          />

          <div className="col-span-2 pt-6 border-t border-slate-200">
            <label className="block text-sm font-semibold text-slate-900 mb-4">Delivery Dates</label>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Input
                  type="date"
                  value={formData.delivery_date_1 || ''}
                  onChange={(e) => setFormData({ ...formData, delivery_date_1: e.target.value })}
                  placeholder="Delivery Date 1"
                />
              </div>
              <div>
                <Input
                  type="date"
                  value={formData.delivery_date_2 || ''}
                  onChange={(e) => setFormData({ ...formData, delivery_date_2: e.target.value })}
                  placeholder="Delivery Date 2 (optional)"
                />
              </div>
              <div>
                <Input
                  type="date"
                  value={formData.delivery_date_3 || ''}
                  onChange={(e) => setFormData({ ...formData, delivery_date_3: e.target.value })}
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
