import { useState } from 'react'
import { useApp } from '../../../contexts/AppContext'
import { Select, Input } from '../../../components/ui'
import { ChevronDown, X } from 'lucide-react'

export const LineItemRow = ({ item, onUpdate, onRemove }) => {
  const { products: productList, materials: materialList, machines: machineList, colors: colorList } = useApp()
  const [expanded, setExpanded] = useState(false)

  const calcAmount = (qty, rate) => onUpdate({ amount: (qty || 0) * (rate || 0) })

  const productOptions = [{ value: '', label: 'Select...' }, ...productList.map(p => ({ value: p.id, label: `${p.code} - ${p.name}` }))]
  const materialOptions = [{ value: '', label: 'Select...' }, ...materialList.map(m => ({ value: m.id, label: m.name }))]
  const machineOptions = [{ value: '', label: 'Select...' }, ...machineList.map(m => ({ value: m.id, label: `${m.code} - ${m.name}` }))]
  const colorOptions = [{ value: '', label: 'Select...' }, ...colorList.map(c => ({ value: c.id, label: c.name }))]

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setExpanded(!expanded)}>
        <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {item.line_type} — {item.products?.name || 'Select item'}
          </p>
          <p className="text-xs text-slate-500">
            {item.meters ? `${item.meters}m` : item.weight_kg ? `${item.weight_kg}kg` : '—'}
            {item.rate_per_unit ? ` @ ₹${item.rate_per_unit}/unit` : ''}
          </p>
        </div>
        <span className="text-sm font-semibold text-slate-800 shrink-0">₹{(item.amount || 0).toFixed(2)}</span>
        <button onClick={e => { e.stopPropagation(); onRemove() }} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="p-4 border-t border-slate-100 space-y-4 bg-white">
          <div className="grid grid-cols-3 gap-3">
            <Select label="Type" value={item.line_type} onChange={e => onUpdate({ line_type: e.target.value })}
              options={[{ value: 'production', label: 'Production' }, { value: 'trading', label: 'Trading' }, { value: 'jobwork', label: 'Jobwork' }, { value: 'stock', label: 'Stock' }]} />
            {['production', 'trading', 'jobwork'].includes(item.line_type) && (
              <Select label="Product" value={item.product_id || ''} onChange={e => { const p = productList.find(x => x.id === e.target.value); onUpdate({ product_id: e.target.value, products: p }) }} options={productOptions} />
            )}
            {item.line_type === 'stock' && (
              <Select label="Material" value={item.material_id || ''} onChange={e => { const m = materialList.find(x => x.id === e.target.value); onUpdate({ material_id: e.target.value, materials: m }) }} options={materialOptions} />
            )}
            {item.line_type === 'production' && (
              <Select label="Machine" value={item.machine_id || ''} onChange={e => { const m = machineList.find(x => x.id === e.target.value); onUpdate({ machine_id: e.target.value, machines: m }) }} options={machineOptions} />
            )}
          </div>

          <div className="grid grid-cols-4 gap-3">
            <Input label="Width (cm)" type="number" value={item.width_cm || ''} onChange={e => onUpdate({ width_cm: parseFloat(e.target.value) || 0 })} />
            <Input label="Meters" type="number" value={item.meters || ''} onChange={e => { const v = parseFloat(e.target.value) || 0; onUpdate({ meters: v }); calcAmount(v, item.rate_per_unit) }} />
            <Input label="Weight (kg)" type="number" value={item.weight_kg || ''} onChange={e => { const v = parseFloat(e.target.value) || 0; onUpdate({ weight_kg: v }); calcAmount(v, item.rate_per_unit) }} />
            <Input label="Rate/Unit" type="number" value={item.rate_per_unit || ''} onChange={e => { const v = parseFloat(e.target.value) || 0; onUpdate({ rate_per_unit: v }); calcAmount(item.meters || item.weight_kg, v) }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Select label="Color" value={item.color_id || ''} onChange={e => onUpdate({ color_id: e.target.value })} options={colorOptions} />
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
