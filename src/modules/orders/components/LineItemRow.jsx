import { useMemo, useState } from 'react'
import { useApp } from '../../../contexts/AppContext'
import { Select, SearchSelect, Input } from '../../../components/ui'
import { ChevronDown, X } from 'lucide-react'

export const LineItemRow = ({ item, onUpdate, onRemove }) => {
  const { products: productList, materials: materialList, machines: machineList, colors: colorList } = useApp()
  const [expanded, setExpanded] = useState(false)

  const productOptions = useMemo(() => productList.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` })), [productList])
  const materialOptions = useMemo(() => materialList.map(m => ({ value: m.id, label: m.name })), [materialList])
  const machineOptions = useMemo(() => machineList.map(m => ({ value: m.id, label: `${m.code} - ${m.name}` })), [machineList])
  const colorOptions = useMemo(() => colorList.map(c => ({ value: c.id, label: c.name })), [colorList])

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-stretch bg-slate-50 hover:bg-slate-100 transition-colors">
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
          className="flex flex-1 min-w-0 items-center gap-3 px-4 py-3 text-left focus-ring"
        >
          <ChevronDown size={16} className={`text-slate-400 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">
              <span className="capitalize">{item.line_type}</span> — {item.products?.name || item.materials?.name || 'Select item'}
            </p>
            <p className="text-xs text-slate-500">
              {item.meters ? `${item.meters}m` : item.weight_kg ? `${item.weight_kg}kg` : '—'}
              {item.rate_per_unit ? ` @ ₹${item.rate_per_unit}/unit` : ''}
            </p>
          </div>
          <span className="text-sm font-semibold text-slate-800 shrink-0">₹{(item.amount || 0).toFixed(2)}</span>
        </button>
        <button type="button" aria-label="Remove line item" onClick={onRemove} className="px-4 border-l border-slate-200/70 hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors focus-ring">
          <X size={16} />
        </button>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="p-4 border-t border-slate-100 space-y-4 bg-white">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select label="Type" value={item.line_type} onChange={e => onUpdate({ line_type: e.target.value })}
              options={[{ value: 'production', label: 'Production' }, { value: 'trading', label: 'Trading' }, { value: 'jobwork', label: 'Jobwork' }, { value: 'stock', label: 'Stock' }]} />
            {['production', 'trading', 'jobwork'].includes(item.line_type) && (
              <SearchSelect label="Product" value={item.product_id || ''} placeholder="Search product..." onChange={option => { const p = productList.find(x => x.id === option.value); onUpdate({ product_id: option.value, products: p }) }} options={productOptions} />
            )}
            {item.line_type === 'stock' && (
              <SearchSelect label="Material" value={item.material_id || ''} placeholder="Search material..." onChange={option => { const m = materialList.find(x => x.id === option.value); onUpdate({ material_id: option.value, materials: m }) }} options={materialOptions} />
            )}
            {item.line_type === 'production' && (
              <SearchSelect label="Machine" value={item.machine_id || ''} placeholder="Search machine..." onChange={option => { const m = machineList.find(x => x.id === option.value); onUpdate({ machine_id: option.value, machines: m }) }} options={machineOptions} />
            )}
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Input label="Width (cm)" type="number" min="0" value={item.width_cm || ''} onChange={e => onUpdate({ width_cm: parseFloat(e.target.value) || 0 })} />
            <Input label="Meters" type="number" min="0" value={item.meters || ''} onChange={e => { const v = parseFloat(e.target.value) || 0; onUpdate({ meters: v, weight_kg: 0, quantity: 0, unit: 'm', amount: v * (item.rate_per_unit || 0) }) }} />
            <Input label="Weight (kg)" type="number" min="0" value={item.weight_kg || ''} onChange={e => { const v = parseFloat(e.target.value) || 0; onUpdate({ weight_kg: v, meters: 0, quantity: 0, unit: 'kg', amount: v * (item.rate_per_unit || 0) }) }} />
            <Input label="Rate/Unit" type="number" min="0.01" value={item.rate_per_unit || ''} onChange={e => { const v = parseFloat(e.target.value) || 0; onUpdate({ rate_per_unit: v, amount: (item.meters || item.weight_kg || 0) * v }) }} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SearchSelect label="Color" value={item.color_id || ''} placeholder="Search color..." onChange={option => onUpdate({ color_id: option.value })} options={colorOptions} />
            <Input label="Amount" type="number" disabled value={(item.amount || 0).toFixed(2)} />
          </div>

          {item.line_type === 'jobwork' && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
              <p className="text-xs text-amber-800 font-medium">Jobwork line item — material tracking will be required.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
