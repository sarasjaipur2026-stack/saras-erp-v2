import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { enquiries } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Input, Textarea, Select } from '../../components/ui';
import { CustomerSearch } from '../orders/components/CustomerSearch';
import { PhotoUpload } from '../../components/ui';

export const EnquiryForm = () => {
  const navigate = useNavigate();
  const { enquiryId } = useParams();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [enquiry, setEnquiry] = useState({
    customer_id: null,
    products_required: '',
    quantity: 0,
    quoted_rate: 0,
    source: '',
    status: 'new',
    followup_date: '',
    notes: '',
    photos: [],
  });

  const [isLoading, setIsLoading] = useState(!!enquiryId);

  useEffect(() => {
    if (enquiryId) {
      fetchEnquiry();
    }
  }, [enquiryId]);

  const fetchEnquiry = async () => {
    const { data, error } = await enquiries.get(enquiryId);
    if (error) {
      addToast('Failed to load enquiry', 'error');
      navigate('/enquiries');
    } else {
      setEnquiry(data);
    }
    setIsLoading(false);
  };

  const handleSave = async () => {
    try {
      if (!enquiry.customer_id) {
        addToast('Please select a customer', 'error');
        return;
      }

      const enquiryData = {
        customer_id: enquiry.customer_id,
        products_required: enquiry.products_required,
        quantity: enquiry.quantity,
        quoted_rate: enquiry.quoted_rate,
        source: enquiry.source,
        status: enquiry.status,
        followup_date: enquiry.followup_date,
        notes: enquiry.notes,
        user_id: user.id,
      };

      if (enquiryId) {
        const { error } = await enquiries.update(enquiryId, enquiryData);
        if (error) throw error;
      } else {
        const { error } = await enquiries.create(enquiryData);
        if (error) throw error;
      }

      addToast(`Enquiry ${enquiryId ? 'updated' : 'created'} successfully`, 'success');
      navigate('/enquiries');
    } catch (error) {
      addToast('Failed to save enquiry', 'error');
    }
  };

  if (isLoading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">
        {enquiryId ? 'Edit Enquiry' : 'Create New Enquiry'}
      </h1>

      <form className="space-y-8 bg-white p-6 rounded-lg border border-gray-200">
        {/* Customer Section */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Customer Details</h2>
          <CustomerSearch
            value={enquiry.customer_id}
            onChange={(customerId) => setEnquiry(prev => ({ ...prev, customer_id: customerId }))}
          />
        </section>

        {/* Enquiry Details Section */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Enquiry Details</h2>
          <div className="space-y-4">
            <Textarea
              label="Products Required"
              placeholder="Describe the products enquired..."
              value={enquiry.products_required}
              onChange={(e) => setEnquiry(prev => ({ ...prev, products_required: e.target.value }))}
              rows={3}
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Quantity"
                type="number"
                value={enquiry.quantity}
                onChange={(e) => setEnquiry(prev => ({ ...prev, quantity: parseFloat(e.target.value) }))}
              />
              <Input
                label="Quoted Rate"
                type="number"
                value={enquiry.quoted_rate}
                onChange={(e) => setEnquiry(prev => ({ ...prev, quoted_rate: parseFloat(e.target.value) }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Source"
                placeholder="How did you get this enquiry?"
                value={enquiry.source}
                onChange={(e) => setEnquiry(prev => ({ ...prev, source: e.target.value }))}
              />
              <Input
                label="Follow-up Date"
                type="date"
                value={enquiry.followup_date}
                onChange={(e) => setEnquiry(prev => ({ ...prev, followup_date: e.target.value }))}
              />
            </div>
            <Select
              label="Status"
              value={enquiry.status}
              onChange={(e) => setEnquiry(prev => ({ ...prev, status: e.target.value }))}
              options={[
                { value: 'new', label: 'New' },
                { value: 'follow_up', label: 'Follow Up' },
                { value: 'quoted', label: 'Quoted' },
                { value: 'converted', label: 'Converted' },
                { value: 'lost', label: 'Lost' },
              ]}
            />
          </div>
        </section>

        {/* Notes Section */}
        <section>
          <Textarea
            label="Notes"
            placeholder="Add any notes about this enquiry..."
            value={enquiry.notes}
            onChange={(e) => setEnquiry(prev => ({ ...prev, notes: e.target.value }))}
            rows={4}
          />
        </section>

        {/* Action Buttons */}
        <div className="flex gap-4 justify-end border-t pt-6">
          <Button variant="secondary" onClick={() => navigate('/enquiries')}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            {enquiryId ? 'Update Enquiry' : 'Create Enquiry'}
          </Button>
        </div>
      </form>
    </div>
  );
};