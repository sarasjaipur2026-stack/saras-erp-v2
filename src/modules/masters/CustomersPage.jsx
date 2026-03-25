import React, { useState, useEffect } from 'react';
import { customers } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Input, DataTable, Modal } from '../../components/ui';
import { Plus, Edit, Trash2 } from 'lucide-react';

export const CustomersPage = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [customerList, setCustomerList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
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
    setIsLoading(true);
    const { data, error } = await customers.list(user.id);
    if (error) {
      addToast('Failed to load customers', 'error');
    } else {
      setCustomerList(data || []);
    }
    setIsLoading(false);
  };

  const handleOpenModal = (customer = null) => {
    if (customer) {
      setEditingId(customer.id);
      setFormData(customer);
    } else {
      setEditingId(null);
      setFormData({
        firm_name: '',
        contact_name: '',
        phone: '',
        email: '',
        city: '',
        address: '',
        gstin: '',
        pan: '',
      });
    }
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.firm_name || !formData.contact_name) {
      addToast('Please fill required fields', 'error');
      return;
    }

    try {
      if (editingId) {
        const { error } = await customers.update(editingId, formData);
        if (error) throw error;
        addToast('Customer updated successfully', 'success');
      } else {
        const { error } = await customers.create({
          ...formData,
          user_id: user.id,
        });
        if (error) throw error;
        addToast('Customer added successfully', 'success');
      }
      setShowModal(false);
      fetchCustomers();
    } catch (error) {
      addToast('Failed to save customer', 'error');
    }
  };

  const handleDelete = async (id) => {
    try {
      const { error } = await customers.delete(id);
      if (error) throw error;
      addToast('Customer deleted', 'success');
      fetchCustomers();
    } catch (error) {
      addToast('Failed to delete customer', 'error');
    }
  };

  const filteredCustomers = customerList.filter(c =>
    c.contact_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.firm_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    { key: 'firm_name', label: 'Firm' },
    { key: 'contact_name', label: 'Contact Person' },
    { key: 'phone', label: 'Phone' },
    { key: 'city', label: 'City' },
    { key: 'gstin', label: 'GSTIN' },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleOpenModal(row)}
            className="text-blue-600 hover:underline text-sm"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => handleDelete(row.id)}
            className="text-red-600 hover:underline text-sm"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Customers</h1>
        <Button onClick={() => handleOpenModal()} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add Customer
        </Button>
      </div>

      <div className="mb-6">
        <Input
          placeholder="Search by name or firm..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredCustomers}
        isLoading={isLoading}
        emptyMessage="No customers found"
      />

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editingId ? 'Edit Customer' : 'Add New Customer'}
        size="lg"
      >
        <div className="space-y-4">
          <Input
            label="Firm Name"
            required
            value={formData.firm_name}
            onChange={(e) => setFormData(prev => ({ ...prev, firm_name: e.target.value }))}
          />
          <Input
            label="Contact Person Name"
            required
            value={formData.contact_name}
            onChange={(e) => setFormData(prev => ({ ...prev, contact_name: e.target.value }))}
          />
          <Input
            label="Phone"
            value={formData.phone}
            onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          />
          <Input
            label="City"
            value={formData.city}
            onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
          />
          <Input
            label="Address"
            value={formData.address}
            onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
          />
          <Input
            label="GSTIN"
            value={formData.gstin}
            onChange={(e) => setFormData(prev => ({ ...prev, gstin: e.target.value }))}
          />
          <Input
            label="PAN"
            value={formData.pan}
            onChange={(e) => setFormData(prev => ({ ...prev, pan: e.target.value }))}
          />

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingId ? 'Update' : 'Add'} Customer
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};