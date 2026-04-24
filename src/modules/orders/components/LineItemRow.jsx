import { useMemo, useState } from 'react'
import { useApp } from '../../../contexts/AppContext'
import { SearchSelect, Select, Input } from '../../../components/ui'
import { ChevronDown, X, Copy, Minus, Plus } from 'lucide-react'

// Step size per quick-chip button for meters/weight fields
const QTY_CHIPS = [1, 10, 100]

export const LineItemRow = ({ item, onUpdate, onRemove, onCopy, stockMap }) => {
  const { products: productList, materials: materialList, machines: machineList, colors: colorList } = useApp()
  const [expanded, setExpanded] = useState(false)

  // Stock chip for the selected product/material. "Stock: 340m" — turns red
  // when the line qty exceeds available stock so the operator sees the gap
  // before committing the order. Graceful no-op when stockMap not supplied.
  const stockEntry = useMemo(() => {
    if (!stockMap) return null
    if (item.product_id) return stockMap.product?.get(item.product_id) || null
    if (item.material_id) return stockMap.material?.get(item.material_id) || null
    return null
  }, [stockMap, item.product_id, item.material_id])
  const stockQty = stockEntry ? Number(stockEntry.qty || 0) : null
  const stockUnit = stockEntry?.unit || ''
  const lineQty = item.meters || item.weight_kg || item.total_qty || 0
  const stockShort = stockQty !== null && lineQty > stockQty
  const stockLabel = stockQty === null
    ? null
    : `Stock: ${stockQty.toLocaleString('en-IN', { maximumFractionDigits: 2 })}${stockUnit ? ` ${stockUnit}` : ''}`

  const calcAmount = (qty, rate) => onUpdate({ amount: (qty || 0) * (rate || 0) })

  // QA audit C-01: with 2310+ products, rebuilding options on every keystroke
  // (qty/rate/width change) caused a 45-second browser freeze. Memoize per
  // list identity so options are built once per list, not once per render.
  // Also attach extra fields for SearchSelect's multi-key fuzzy match.
  const productOptions = useMemo(
    () => productList.map(p => ({
      value: p.id,
      label: `${p.code || ''} ${p.name || ''}`.trim(),
      code: p.code,
      name: p.name,
      hsn_code: p.hsn_code,
      category: p.category,
      _raw: p,
    })),
    [productList],
  )
  const materialOptions = useMemo(
    () => materialList.map(m => ({
      value: m.id,
      label: m.name,
      category: m.yarn_category,
      _raw: m,
    })),
    [materialList],
  )
  const machineOptions = useMemo(
    () => machineList.map(m => ({
      value: m.id,
      label: `${m.code || ''} ${m.name || ''}`.trim(),
      code: m.code,
      name: m.name,
      _raw: m,
    })),
    [machineList],
  )
  const colorOptions = useMemo(
    () => colorList.map(c => ({
      value: c.id,
      label: c.name,
      hex_code: c.hex_code,
      hindi_name: c.hindi_name,
      _raw: c,
    })),
    [colorList],
  )

  // Stepper helpers — keep qty >= 0, recompute amount inline so rate×qty stays live
  const bumpMeters = (delta) => {
    const next = Math.max(0, (item.meters || 0) + delta)
    onUpdate({ meters: next })
    calcAmount(next, item.rate_per_unit)
  }
  const bumpWeight = (delta) => {
    const next = Math.max(0, (item.weight_kg || 0) + delta)
    onUpdate({ weight_kg: next })
    calcAmount(next, item.rate_per_unit)
  }

  const headerQty = item.meters ? `${item.meters}m` : item.weight_kg ? `${item.weight_kg}kg` : '—'
  const selectedProduct = item.products?.name || productOptions.find(o => o.value === item.product_id)?.name
  const selectedMaterial = item.materials?.name || materialOptions.find(o => o.value === item.material_id)?.label
  const headerLabel = selectedProduct || selectedMaterial || 'Select item'

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => setExpanded(!expanded)}>
        <ChevronDown size={16} className={`text-slate-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {item.line_type} — {headerLabel}
          </p>
          <p className="text-xs text-slate-500">
            {headerQty}
            {item.rate_per_unit ? ` @ ₹${item.rate_per_unit}/unit` : ''}
          </p>
        </div>
        {stockLabel && (
          <span
            className={`hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-md shrink-0 ${
              stockShort
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
            title={stockShort ? 'Line quantity exceeds available stock' : 'Current stock available'}
          >
            {stockLabel}
            {stockShort && ` · short by ${(lineQty - stockQty).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
          </span>
        )}
        <span className="text-sm font-semibold text-slate-800 shrink-0">₹{(item.amount || 0).toFixed(2)}</span>
        {onCopy && (
          <button
            onClick={e => { e.stopPropagation(); onCopy() }}
            className="p-1 rounded hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 transition-colors"
            title="Duplicate line"
          >
            <Copy size={14} />
          </button>
        )}
        <button onClick={e => { e.stopPropagation(); onRemove() }} className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Remove line">
          <X size={16} />
        </button>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="p-4 border-t border-slate-100 space-y-4 bg-white">
          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Type"
              value={item.line_type}
              onChange={e => onUpdate({ line_type: e.target.value })}
              options={[
                { value: 'production', label: 'Production' },
                { value: 'trading', label: 'Trading' },
                { value: 'jobwork', label: 'Jobwork' },
                { value: 'stock', label: 'Stock' },
              ]}
            />
            {['production', 'trading', 'jobwork'].includes(item.line_type) && (
              <SearchSelect
                label="Product"
                value={item.product_id || ''}
                options={productOptions}
                placeholder="Search products..."
                searchKeys={['code', 'name', 'hsn_code', 'category']}
                onChange={(opt) => {
                  if (!opt.value) { onUpdate({ product_id: null, products: null }); return }
                  onUpdate({ product_id: opt.value, products: opt._raw })
                }}
                renderOption={(opt) => (
                  <div>
                    <p className="font-medium text-slate-800">{opt.code ? `${opt.code} — ${opt.name}` : opt.name}</p>
                    <p className="text-xs text-slate-500">
                      {opt.hsn_code ? `HSN ${opt.hsn_code}` : ''}
                      {opt.category ? ` • ${opt.category}` : ''}
                    </p>
                  </div>
                )}
              />
            )}
            {item.line_type === 'stock' && (
              <SearchSelect
                label="Material"
                value={item.material_id || ''}
                options={materialOptions}
                placeholder="Search materials..."
                searchKeys={['category']}
                onChange={(opt) => {
                  if (!opt.value) { onUpdate({ material_id: null, materials: null }); return }
                  onUpdate({ material_id: opt.value, materials: opt._raw })
                }}
                renderOption={(opt) => (
                  <div>
                    <p className="font-medium text-slate-800">{opt.label}</p>
                    {opt.category && <p className="text-xs text-slate-500">{opt.category}</p>}
                  </div>
                )}
              />
            )}
            {item.line_type === 'production' && (
              <SearchSelect
                label="Machine"
                value={item.machine_id || ''}
                options={machineOptions}
                placeholder="Search machines..."
                searchKeys={['code', 'name']}
                onChange={(opt) => {
                  if (!opt.value) { onUpdate({ machine_id: null, machines: null }); return }
                  onUpdate({ machine_id: opt.value, machines: opt._raw })
                }}
                renderOption={(opt) => (
                  <div>
                    <p className="font-medium text-slate-800">{opt.code ? `${opt.code} — ${opt.name}` : opt.name}</p>
                  </div>
                )}
              />
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input label="Width (cm)" type="number" min="0" value={item.width_cm || ''} onChange={e => onUpdate({ width_cm: Math.max(0, parseFloat(e.target.value) || 0) })} />
            <Input label="Rate/Unit" type="number" min="0" value={item.rate_per_unit || ''} onChange={e => { const v = Math.max(0, parseFloat(e.target.value) || 0); onUpdate({ rate_per_unit: v }); calcAmount(item.meters || item.weight_kg, v) }} />
          </div>

          {/* Meters with stepper + quick chips */}
          <div>
            <div className="flex items-end gap-2">
              <Input
                label="Meters"
                type="number"
                min="0"
                className="flex-1"
                value={item.meters || ''}
                onChange={e => { const v = Math.max(0, parseFloat(e.target.value) || 0); onUpdate({ meters: v }); calcAmount(v, item.rate_per_unit) }}
              />
              <button type="button" onClick={() => bumpMeters(-1)} className="mb-px h-[38px] w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Decrease meters">
                <Minus size={14} />
              </button>
              <button type="button" onClick={() => bumpMeters(1)} className="mb-px h-[38px] w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Increase meters">
                <Plus size={14} />
              </button>
            </div>
            <div className="flex gap-1.5 mt-2">
              {QTY_CHIPS.map(n => (
                <button key={n} type="button" onClick={() => bumpMeters(n)} className="px-2 py-0.5 text-xs rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-colors">
                  +{n}m
                </button>
              ))}
              <button type="button" onClick={() => { onUpdate({ meters: 0 }); calcAmount(0, item.rate_per_unit) }} className="px-2 py-0.5 text-xs rounded-md bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 transition-colors">
                Clear
              </button>
            </div>
          </div>

          {/* Weight with stepper + quick chips */}
          <div>
            <div className="flex items-end gap-2">
              <Input
                label="Weight (kg)"
                type="number"
                min="0"
                className="flex-1"
                value={item.weight_kg || ''}
                onChange={e => { const v = Math.max(0, parseFloat(e.target.value) || 0); onUpdate({ weight_kg: v }); calcAmount(v, item.rate_per_unit) }}
              />
              <button type="button" onClick={() => bumpWeight(-0.1)} className="mb-px h-[38px] w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Decrease weight">
                <Minus size={14} />
              </button>
              <button type="button" onClick={() => bumpWeight(0.1)} className="mb-px h-[38px] w-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50" aria-label="Increase weight">
                <Plus size={14} />
              </button>
            </div>
            <div className="flex gap-1.5 mt-2">
              {[0.5, 1, 5].map(n => (
                <button key={n} type="button" onClick={() => bumpWeight(n)} className="px-2 py-0.5 text-xs rounded-md bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 text-slate-600 transition-colors">
                  +{n}kg
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SearchSelect
              label="Color"
              value={item.color_id || ''}
              options={colorOptions}
              placeholder="Search colors..."
              searchKeys={['hindi_name', 'hex_code']}
              onChange={(opt) => onUpdate({ color_id: opt.value || null })}
              renderOption={(opt) => (
                <div className="flex items-center gap-2">
                  {opt.hex_code && <span className="w-3 h-3 rounded-full border border-slate-200 shrink-0" style={{ backgroundColor: opt.hex_code }} />}
                  <span>{opt.label}</span>
                  {opt.hindi_name && <span className="text-xs text-slate-400 ml-auto">{opt.hindi_name}</span>}
                </div>
              )}
            />
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
