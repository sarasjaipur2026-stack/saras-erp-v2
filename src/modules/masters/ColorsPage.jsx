import React, { useState, useEffect } from 'react';
import { colors } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Input, Modal } from '../../components/ui';
import { Plus } from 'lucide-react';

const ColorsPage = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const [colorList, setColorList] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [newColor, setNewColor] = useState({
    name: '',
    hex_code: '#000000',
  });

  useEffect(() => {
    fetchColors();
  }, [user]);

  const fetchColors = async () => {
    const { data, error } = await colors.list(user.id);
    if (error) {
      addToast('Failed to load colors', 'error');
    } else {
      setColorList(data || []);
    }
  };

  const handleAddColor = async () => {
    if (!newColor.name || !newColor.hex_code) {
      addToast('Please fill all fields', 'error');
      return;
    }

    try {
      const { error } = await colors.create({
        ...newColor,
        user_id: user.id,
      });

      if (error) throw error;

      addToast('Color added successfully', 'success');
      setShowModal(false);
      setNewColor({ name: '', hex_code: '#000000' });
      fetchColors();
    } catch (error) {
      addToast('Failed to add color', 'error');
    }
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Colors</h1>
        <Button onClick={() => setShowModal(true)} className="flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Add Color
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {colorList.map(color => (
          <div
            key={color.id}
            className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
          >
            <div
              className="h-20"
              style={{ backgroundColor: color.hex_code }}
            />
            <div className="p-3">
              <p className="font-medium text-gray-900">{color.name}</p>
              <p className="text-xs text-gray-600 font-mono">{color.hex_code}</p>
            </div>
          </div>
        ))}
      </div>

      {colorList.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-600">No colors added yet</p>
          <Button variant="secondary" onClick={() => setShowModal(true)} className="mt-4">
            Add First Color
          </Button>
        </div>
      )}

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Add New Color"
      >
        <div className="space-y-4">
          <Input
            label="Color Name"
            placeholder="e.g., Crimson Red"
            value={newColor.name}
            onChange={(e) => setNewColor(prev => ({ ...prev, name: e.target.value }))}
          />
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <Input
                label="Hex Code"
                type="text"
                value={newColor.hex_code}
                onChange={(e) => setNewColor(prev => ({ ...prev, hex_code: e.target.value }))}
              />
            </div>
            <div
              className="w-12 h-12 rounded border-2 border-gray-300"
              style={{ backgroundColor: newColor.hex_code }}
            />
          </div>
          <input
            type="color"
            value={newColor.hex_code}
            onChange={(e) => setNewColor(prev => ({ ...prev, hex_code: e.target.value }))}
            className="w-full h-10 cursor-pointer"
          />

          <div className="flex gap-2 justify-end pt-4 border-t">
            <Button variant="secondary" onClick={() => setShowModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddColor}>Add Color</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ColorsPage;
