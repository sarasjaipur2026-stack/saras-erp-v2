import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { products, materials, machines, calculatorProfiles } from '../../lib/db';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { Button, Input, Select, Tabs } from '../../components/ui';
import { Save, Plus } from 'lucide-react';

export const CalculatorPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addToast } = useToast();

  const [productList, setProductList] = useState([]);
  const [materialList, setMaterialList] = useState([]);
  const [machineList, setMachineList] = useState([]);
  const [profileList, setProfileList] = useState([]);

  const [calc, setCalc] = useState({
    machine_id: null,
    product_id: null,
    chaal: '',
    sample_length_m: 0,
    sample_weight_kg: 0,
    yarn_count: '',
    yarn_type: '',
    cover_count: '',
    filler_count: '',
    waste_percentage: 0,
    labor_cost_per_kg: 0,
    overhead_cost_percentage: 0,
    profit_margin_percentage: 0,
    order_quantity: 0,
    profile_name: '',
  });

  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    loadData();
  }, [user]);

  const loadData = async () => {
    const [prodRes, matRes, machRes, profRes] = await Promise.all([
      products.list(user.id),
      materials.list(user.id),
      machines.list(user.id),
      calculatorProfiles.list(user.id),
    ]);

    if (!prodRes.error) setProductList(prodRes.data || []);
    if (!matRes.error) setMaterialList(matRes.data || []);
    if (!machRes.error) setMachineList(machRes.data || []);
    if (!profRes.error) setProfileList(profRes.data || []);
  };

  const gramsPerMeter = useMemo(() => {
    if (calc.sample_length_m && calc.sample_weight_kg) {
      return (calc.sample_weight_kg * 1000) / calc.sample_length_m;
    }
    return 0;
  }, [calc.sample_length_m, calc.sample_weight_kg]);

  const metersPerKg = useMemo(() => {
    return gramsPerMeter > 0 ? 1000 / gramsPerMeter : 0;
  }, [gramsPerMeter]);

  const materialRequired = useMemo(() => {
    if (!calc.order_quantity) return 0;
    return calc.order_quantity * gramsPerMeter / 1000;
  }, [calc.order_quantity, gramsPerMeter]);

  const productionEstimate = useMemo(() => {
    const selected = machineList.find(m => m.id === calc.machine_id);
    if (!selected) return {};

    const metersPerHour = calc.sample_length_m / 1;
    const totalMeters = calc.order_quantity * gramsPerMeter / 1000 * metersPerKg;
    const productionHours = totalMeters / metersPerHour;
    const deliveryDays = Math.ceil(productionHours / 8);

    return {
      metersPerHour,
      totalMeters,
      productionHours,
      deliveryDays,
      bobinChanges: Math.ceil(calc.order_quantity / 500),
    };
  }, [calc.machine_id, calc.order_quantity, calc.sample_length_m, gramsPerMeter, metersPerKg, machineList]);

  const costBreakdown = useMemo(() => {
    const material = materialRequired * 500;
    const labor = materialRequired * calc.labor_cost_per_kg;
    const overhead = material * (calc.overhead_cost_percentage / 100);
    const totalCost = material + labor + overhead;
    const profitAmount = totalCost * (calc.profit_margin_percentage / 100);
    const sellingPrice = totalCost + profitAmount;
    const pricePerUnit = calc.order_quantity > 0 ? sellingPrice / calc.order_quantity : 0;

    return {
      material,
      labor,
      overhead,
      totalCost,
      profitAmount,
      sellingPrice,
      pricePerUnit,
    };
  }, [materialRequired, calc.labor_cost_per_kg, calc.overhead_cost_percentage, calc.profit_margin_percentage, calc.order_quantity]);

  const handleSaveProfile = async () => {
    if (!calc.profile_name) {
      addToast('Please enter a profile name', 'error');
      return;
    }

    try {
      const { error } = await calculatorProfiles.create({
        ...calc,
        user_id: user.id,
      });

      if (error) throw error;
      addToast('Profile saved successfully', 'success');
      loadData();
    } catch (error) {
      addToast('Failed to save profile', 'error');
    }
  };

  const handleCreateOrder = () => {
    navigate('/orders/new', { state: { calculator: calc, costBreakdown } });
  };

  const tabs = [
    {
      label: 'Inputs',
      content: (
        <div className="space-y-6 bg-white p-6 rounded-lg border border-gray-200">
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Machine"
              value={calc.machine_id || ''}
              onChange={(e) => setCalc(prev => ({ ...prev, machine_id: e.target.value }))}
              options={machineList.map(m => ({ value: m.id, label: m.name }))}
            />
            <Select
              label="Product"
              value={calc.product_id || ''}
              onChange={(e) => setCalc(prev => ({ ...prev, product_id: e.target.value }))}
              options={productList.map(p => ({ value: p.id, label: p.name }))}
            />
            <Input
              label="Chaal"
              value={calc.chaal}
              onChange={(e) => setCalc(prev => ({ ...prev, chaal: e.target.value }))}
            />
            <Input
              label="Sample Length (m)"
              type="number"
              value={calc.sample_length_m}
              onChange={(e) => setCalc(prev => ({ ...prev, sample_length_m: parseFloat(e.target.value) }))}
            />
            <Input
              label="Sample Weight (kg)"
              type="number"
              value={calc.sample_weight_kg}
              onChange={(e) => setCalc(prev => ({ ...prev, sample_weight_kg: parseFloat(e.target.value) }))}
            />
            <Input
              label="Yarn Count"
              value={calc.yarn_count}
              onChange={(e) => setCalc(prev => ({ ...prev, yarn_count: e.target.value }))}
            />
            <Input
              label="Yarn Type"
              value={calc.yarn_type}
              onChange={(e) => setCalc(prev => ({ ...prev, yarn_type: e.target.value }))}
            />
            <Input
              label="Cover Count"
              value={calc.cover_count}
              onChange={(e) => setCalc(prev => ({ ...prev, cover_count: e.target.value }))}
            />
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Production Parameters</h3>
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Order Quantity"
                type="number"
                value={calc.order_quantity}
                onChange={(e) => setCalc(prev => ({ ...prev, order_quantity: parseFloat(e.target.value) }))}
              />
              <Input
                label="Waste %"
                type="number"
                value={calc.waste_percentage}
                onChange={(e) => setCalc(prev => ({ ...prev, waste_percentage: parseFloat(e.target.value) }))}
              />
              <Input
                label="Filler Count"
                value={calc.filler_count}
                onChange={(e) => setCalc(prev => ({ ...prev, filler_count: e.target.value }))}
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Cost Parameters</h3>
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Labor Cost/kg"
                type="number"
                value={calc.labor_cost_per_kg}
                onChange={(e) => setCalc(prev => ({ ...prev, labor_cost_per_kg: parseFloat(e.target.value) }))}
              />
              <Input
                label="Overhead %"
                type="number"
                value={calc.overhead_cost_percentage}
                onChange={(e) => setCalc(prev => ({ ...prev, overhead_cost_percentage: parseFloat(e.target.value) }))}
              />
              <Input
                label="Profit Margin %"
                type="number"
                value={calc.profit_margin_percentage}
                onChange={(e) => setCalc(prev => ({ ...prev, profit_margin_percentage: parseFloat(e.target.value) }))}
              />
            </div>
          </div>
        </div>
      ),
    },
    {
      label: 'Outputs',
      content: (
        <div className="space-y-6 bg-white p-6 rounded-lg border border-gray-200">
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-600 mb-1">Grams per Meter</p>
              <p className="text-2xl font-bold text-blue-900">{gramsPerMeter.toFixed(2)}g</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <p className="text-sm text-green-600 mb-1">Meters per kg</p>
              <p className="text-2xl font-bold text-green-900">{metersPerKg.toFixed(2)}m</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Material Required</h3>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <p className="text-2xl font-bold text-purple-900">{materialRequired.toFixed(2)} kg</p>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Production Estimate</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">Meters/Hour</p>
                <p className="text-xl font-semibold">{(productionEstimate.metersPerHour || 0).toFixed(2)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">Total Meters</p>
                <p className="text-xl font-semibold">{(productionEstimate.totalMeters || 0).toFixed(2)}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">Delivery Days</p>
                <p className="text-xl font-semibold">{productionEstimate.deliveryDays || 0}</p>
              </div>
              <div className="bg-gray-50 p-4 rounded">
                <p className="text-sm text-gray-600">Bobbin Changes</p>
                <p className="text-xl font-semibold">{productionEstimate.bobinChanges || 0}</p>
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-4">Cost Breakdown</h3>
            <div className="space-y-2">
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Material Cost:</span>
                <span className="font-semibold">{costBreakdown.material?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Labor Cost:</span>
                <span className="font-semibold">{costBreakdown.labor?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-2 bg-gray-50 rounded">
                <span>Overhead:</span>
                <span className="font-semibold">{costBreakdown.overhead?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-2 border-t-2 border-gray-300 font-bold">
                <span>Total Cost:</span>
                <span>{costBreakdown.totalCost?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-2 bg-green-50 rounded font-bold">
                <span>Selling Price:</span>
                <span className="text-green-700">{costBreakdown.sellingPrice?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between p-2 bg-green-100 rounded">
                <span>Price per Unit:</span>
                <span className="font-semibold text-green-900">{costBreakdown.pricePerUnit?.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Calculator</h1>
        <Button onClick={handleCreateOrder} variant="primary">
          Create Order
        </Button>
      </div>

      <Tabs tabs={tabs} defaultTab={activeTab} onChange={setActiveTab} />

      <div className="mt-6 bg-white p-4 rounded-lg border border-gray-200 space-y-4">
        <h3 className="font-semibold">Save Profile</h3>
        <div className="flex gap-4">
          <Input
            label="Profile Name"
            placeholder="e.g., Standard Production"
            value={calc.profile_name}
            onChange={(e) => setCalc(prev => ({ ...prev, profile_name: e.target.value }))}
          />
          <div className="flex items-end">
            <Button onClick={handleSaveProfile} size="sm" className="flex items-center gap-2">
              <Save className="w-4 h-4" />
              Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};