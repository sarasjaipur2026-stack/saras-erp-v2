import React, { useState, useEffect } from 'react';
import { products, materials, machines, colors } from '../../../lib/db';
import { useAuth } from '../../../contexts/AuthContext';
import { Select, Input, Button } from '../../../components/ui';
import { ChevronDown, X } from 'lucide-react';

export const LineItemRow = ({ item, onUpdate, onRemove }) => {
  const { user } = useAuth();
  const [isExpanded, setIsExpanded] = useState(false);
  const [productList, setProductList] = useState([]);
  const [materialList, setMaterialList] = useState([]);
  const [machineList, setMachineList] = useState([]);
  const [colorList, setColorList] = useState([]);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    const [prodRes, matRes, machRes, colorRes] = await Promise.all([
      products.list(user.id),
      materials.list(user.id),
      machines.list(user.id),
      colors.list(user.id),
    ]);

    if (!prodRes.error) setProductList(prodRes.data || []);
    if (!matRes.error) setMaterialList(matRes.data || []);
    if (!machRes.error) setMachineList(machRes.data || []);
    if (!colorRes.error) setColorList(colorRes.data || []);
  };

  const handleMetersToKg = () => {
    if (item.meters && item.products?.grams_per_meter) {
      const kg = (item.meters * item.products.grams_per_meter) / 1000;
      onUpdate({ weight_kg: kg });
    }
  };

  const handleKgToMeters = () => {
    if (item.weight_kg && item.products?.grams_per_meter) {
      const meters = (item.weight_kg * 1000) / item.products.grams_per_meter;
      onUpdate({ meters });
    }
  };

  const handleRateChange = (rate) => {
    onUpdate({ rate_per_unit: rate });
    calculateAmount(item.meters || item.weight_kg, rate);
  };

  const calculateAmount = (quantity, rate) => {
    const amount = (quantity || 0) * (rate || 0);
    onUpdate({ amount });
  };

  const productOptions = productList.map(p => ({
    value: p.id,
    label: `${p.code} - ${p.name}`,
  }));

  const materialOptions = materialList.map(m => ({
    value: m.id,
    label: m.name,
  }));

  const machineOptions = machineList.map(m => ({
    value: m.id,
    label: `${m.code} - ${m.name}`,
  }));

  const colorOptions = colorList.map(c => ({
    value: c.id,
    label: c.name,
  }));

  const lineTypeOptions = [
    { value: 'production', label: 'Production' },
    { value: 'trading', label: 'Trading' },
    { value: 'jobwork', label: 'Jobwork' },
    { value: 'stock', label: 'Stock' },
  ];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header Row */}
      <div className="flex items-center gap-4 p-4 bg-gray-50 cursor-pointer hover:bg-gray-100"
           onClick={() => setIsExpanded(!isExpanded)}>
        <button className="text-gray-600">
          <ChevronDown className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
        </button>

        <div className="flex-1">
          <p className="font-medium text-gray-900">
            {item.line_type} - {item.products?.name || item.machines?.name || 'Select item'}
          </p>
          <p className="text-sm text-gray-600">
            {item.meters ? `${item.meters}m` : item.weight_kg ? `${item.weight_kg}kg` : '-'}
            {item.rate_per_unit && ` @ ${item.rate_per_unit}/unit`}
          </p>
        </div>

        <div className="text-right min-w-fit">
          <p className="font-semibold text-gray-900">{(item.amount || 0).toFixed(2)}</p>
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-red-600 hover:text-red-700 p-1"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4 border-t border-gray-200 space-y-4 bg-white">
          <div className="grid grid-cols-3 gap-4">
            <Select
              label="Line Type"
              value={item.line_type}
              onChange={(e) => onUpdate({ line_type: e.target.value })}
              options={lineTypeOptions}
            />

            {['production', 'trading', 'jobwork'].includes(item.line_type) && (
              <Select
                label="Product"
                value={item.product_id || ''}
                onChange={(e) => {
                  const prod = productList.find(p => p.id === e.target.value);
                  onUpdate({ product_id: e.target.value, products: prod });
                }}
                options={productOptions}
              />
            )}

            {item.line_type === 'stock' && (
              <Select
                label="Material"
                value={item.material_id || ''}
                onChange={(e) => {
                  const mat = materialList.find(m => m.id === e.target.value);
                  onUpdate({ material_id: e.target.value, materials: mat });
                }}
                options={materialOptions}
              />
            )}

            {item.line_type === 'production' && (
              <Select
                label="Machine"
                value={item.machine_id || ''}
                onChange={(e) => {
                  const machine = machineList.find(m => m.id === e.target.value);
                  onUpdate({ machine_id: e.target.value, machines: machine });
                }}
                options={machineOptions}
              />
            )}
          </div>

          <div className="grid grid-cols-4 gap-4">
            <Input
              label="Width (cm)"
              type="number"
              value={item.width_cm || ''}
              onChange={(e) => onUpdate({ width_cm: parseFloat(e.target.value) })}
            />

            <div>
              <Input
                label="Meters"
                type="number"
                value={item.meters || ''}
                onChange={(e) => {
                  const meters = parseFloat(e.target.value);
                  onUpdate({ meters });
                  calculateAmount(meters, item.rate_per_unit);
                }}
              />
              {item.products?.grams_per_meter && (
                <button
                  onClick={handleMetersToKg}
                  className="text-xs text-blue-600 hover:underline mt-1"
                >
                  Convert to kg
                </button>
              )}
            </div>

            <div>
              <Input
                label="Weight (kg)"
                type="number"
                value={item.weight_kg || ''}
                onChange={(e) => {
                  const weight = parseFloat(e.target.value);
                  onUpdate({ weight_kg: weight });
                  calculateAmount(weight, item.rate_per_unit);
                }}
              />
              {item.products?.grams_per_meter && (
                <button
                  onClick={handleKgToMeters}
                  className="text-xs text-blue-600 hover:underline mt-1"
                >
                  Convert to meters
                </button>
              )}
            </div>

            <Input
              label="Rate per Unit"
              type="number"
              value={item.rate_per_unit || ''}
              onChange={(e) => handleRateChange(parseFloat(e.target.value))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Color"
              value={item.color_id || ''}
              onChange={(e) => {
                const color = colorList.find(c => c.id === e.target.value);
                onUpdate({ color_id: e.target.value, colors: color });
              }}
              options={colorOptions}
            />

            <Input
              label="Amount"
              type="number"
              disabled
              value={(item.amount || 0).toFixed(2)}
            />
          </div>

          {item.line_type === 'jobwork' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <p className="text-sm text-yellow-800">
                <strong>Jobwork Notice:</strong> This is a jobwork line item. Material tracking will be required.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};