import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { enquiries } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, DataTable, Tabs, Badge } from '../../components/ui';
import { Plus, Check, X } from 'lucide-react';

export const EnquiriesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();
  const [enquiriesList, setEnquiriesList] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    fetchEnquiries();
  }, [user]);

  const fetchEnquiries = async () => {
    setIsLoading(true);
    const { data, error } = await enquiries.list(user.id);
    if (error) {
      addToast('Failed to load enquiries', 'error');
    } else {
      setEnquiriesList(data || []);
    }
    setIsLoading(false);
  };

  const handleConvertToOrder = async (enquiry) => {
    const { error } = await enquiries.convertToOrder(enquiry.id);
    if (error) {
      addToast('Failed to convert enquiry', 'error');
    } else {
      addToast('Enquiry converted to order', 'success');
      fetchEnquiries();
    }
  };

  const handleMarkLost = async (enquiryId) => {
    const { error } = await enquiries.update(enquiryId, { status: 'lost' });
    if (error) {
      addToast('Failed to update enquiry', 'error');
    } else {
      addToast('Enquiry marked as lost', 'success');
      fetchEnquiries();
    }
  };

  const filteredEnquiries = statusFilter === 'all'
    ? enquiriesList
    : enquiriesList.filter(e => e.status === statusFilter);

  const columns = [
    { key: 'enquiry_number', label: 'Enquiry #' },
    {
      key: 'customers',
      label: 'Customer',
      render: (_, row) => row.customers?.contact_name,
    },
    { key: 'products_required', label: 'Products' },
    { key: 'quantity', label: 'Quantity' },
    { key: 'quoted_rate', label: 'Rate' },
    { key: 'status', label: 'Status', render: (status) => <Badge variant="default">{status}</Badge> },
    {
      key: 'actions',
      label: 'Actions',
      render: (_, row) => (
        <div className="flex gap-2">
          <button onClick={() => navigate(`/enquiries/${row.id}`)} className="text-blue-600 hover:underline text-sm">
            View
          </button>
          {row.status !== 'converted' && row.status !== 'lost' && (
            <>
              <button
                onClick={() => handleConvertToOrder(row)}
                className="text-green-600 hover:underline text-sm flex items-center gap-1"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleMarkLost(row.id)}
                className="text-red-600 hover:underline text-sm"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  const tabs = [
    { label: 'All Enquiries', content: null },
    { label: 'New', content: null },
    { label: 'Follow Up', content: null },
    { label: 'Quoted', content: null },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Enquiries</h1>
        <Button onClick={() => navigate('/enquiries/new')} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          New Enquiry
        </Button>
      </div>

      <Tabs
        tabs={tabs}
        defaultTab={0}
        onChange={(idx) => {
          const statusMap = { 0: 'all', 1: 'new', 2: 'follow_up', 3: 'quoted' };
          setStatusFilter(statusMap[idx]);
        }}
      />

      <div className="mt-6">
        <DataTable
          columns={columns}
          data={filteredEnquiries}
          onRowClick={(row) => navigate(`/enquiries/${row.id}`)}
          isLoading={isLoading}
          emptyMessage="No enquiries found"
        />
      </div>
    </div>
  );
};