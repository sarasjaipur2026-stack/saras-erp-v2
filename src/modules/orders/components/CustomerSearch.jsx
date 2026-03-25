import React, { useState, useCallback, useEffect } from 'react';
import { customers } from '../../../lib/db';
import { useAuth } from '../../../contexts/AuthContext';
import { useToast } from '../../../contexts/ToastContext';
import { SearchSelect, Input, Modal, Button } from '../../../components/ui';
import { Plus } from 'lucide-react';

export const CustomerSearch = ({ value, onChange }) => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [customerList, setCustomerList] = useState([]);
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [newCustomerForm, setNewCustomerForm] = useState({
    firm_name: '',
    contact_name: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    gstin: '',
    pan: '',
  });

  useEffect(() => {
    fetchCustomers();
  }, [user]);

  const fetchCustomers = async () => {
    const { data, error } = await customers.list(user.id);
    if (!error && data) {
      setCustomerList(data);
      if (value) {
        const selected = data.find(c => c.id === value);
        setSelectedCustomer(selected);
      }
    }
  };

  const handleSearch = useCallback((term) => {
    if (term) {
      const filtered = customerList.filter(c =>
        c.contact_name.toLowerCase().includes(term.toLowerCase()) ||
        c.firm_name.toLowerCase().includes(term.toLowerCase())
      );
      setCustomerList(filtered);
    } else {
      fetchCustomers();
    }
  }, [customerList]);

  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    onChange(customer.id);
  };

  const handleAddNewCustomer = async () => {
    try {
      const { data, error } = await customers.create({
        ...newCustomerForm,
        user_id: user.id,
      });

      if (error) throw error;

      addToast('Customer added successfully', 'success');
      setShowNewCustomerModal(false);
      setNewCustomerForm({
        firm_name: '',
        contact_name: '',
        phone: '',
        email: '',
        city: '',
        address: '',
        gstin: '',
        pan: '',
      });
      handleCustomerSelect(data);
      fetchCustomers();
    } catch (error) {
      addToast('Failed to add customer', 'error');
    }
  };

  const options = customerList.map(c => ({
    value: c.id,
    label: `${c.contact_name} (${c.firm_name})`,
    data: c,
  }));

  return (
    <>
      <div className="space-y-4">
        <SearchSelect
          label="Select Customer"
          required
          options={options}
          onSearch={handleSearch}
          onChange={(opt) => handleCustomerSelect(opt.data)}
          placeholder="Search by name or firm..."
          renderOption={(opt) => (
            <div>
              <p className="font-medium">{opt.data.contact_name}</p>
              <p className="text-xs text-gray-500">
                {opt.data.firm_name} • {opt.data.city} • {opt.data.gstin}
              </p>
            </div>
          )}
        />

        {selectedCustomer && (
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <p className="font-semibold text-blue-900">{selectedCustomer.contact_name}</p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-blue-800">
              <div>
                <span className="text-gray-600">Firm:</span> {selectedCustomer.firm_name}
              </div>
              <div>
                <span className="text-gray-600">Phone:</span> {selectedCustomer.phone}
              </div>
              <div>
                <span className="text-gray-600">City:</span> {selectedCustomer.city}
              </div>
              <div>
                <span className="text-gray-600">GSTIN:</span> {selectedCustomer.gstin}
              </div>
            </div>
          </div>
        )}

        <Button
          variant="secondary"
          onClick={() => setShowNewCustomerModal(true)}
          size="sm"
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add New Customer
        </Button>
      </div>

      <Modal
        isOpen={showNewCustomerModal}
        onClose={() => setShowNewCustomerModal(false)}
        title="Add New Customer"
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Firm Name"
            required
            value={newCustomerForm.firm_name}
            onChange={(e) =>
              setNewCustomerForm(prev => ({ ...prev, firm_name: e.target.value }))
            }
          />
          <Input
            label="Contact Person Name"
            required
            value={newCustomerForm.contact_name}
            onChange={(e) =>
              setNewCustomerForm(prev => ({ ...prev, contact_name: e.target.value }))
            }
          />
          <Input
            label="Phone"
            value={newCustomerForm.phone}
            onChange={(e) => setNewCustomerForm(prev => ({ ...prev, phone: e.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            value={newCustomerForm.email}
            onChange={(e) => setNewCustomerForm(prev => ({ ...prev, email: e.target.value }))}
          />
          <Input
            label="City"
            value={newCustomerForm.city}
            onChange={(e) => setNewCustomerForm(prev => ({ ...prev, city: e.target.value }))}
          />
          <Input
            label="Address"
            value={newCustomerForm.address}
            onChange={(e) => setNewCustomerForm(prev => ({ ...prev, address: e.target.value }))}
          />
          <Input
            label="GSTIN"
            value={newCustomerForm.gstin}
            onChange={(e) => setNewCustomerForm(prev => ({ ...prev, gstin: e.target.value }))}
          />
          <Input
            label="PAN"
            value={newCustomerForm.pan}
            onChange={(e) => setNewCustomerForm(prev => ({ ...prev, pan: e.target.value }))}
          />

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowNewCustomerModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddNewCustomer}>Add Customer</Button>
          </div>
        </div>
      </Modal>
    </>
  );
};