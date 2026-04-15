import { useMemo } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Input } from '../../../components/ui'

/**
 * Multi-line editor for enquiry line items.
 * Controlled — parent owns the `items` array and `onChange`.
 *
 * Each item: { product_id?, product_name_override?, quantity, unit, target_rate, our_quoted_rate, notes }
 */
export default function LineItemsEditor({ items = [], products = [], onChange }) {
  const rowTotal = (row) => {
    const rate = Number(row.our_quoted_rate ?? row.target_rate ?? 0) || 0
    const qty = Number(row.quantity ?? 0) || 0
    return rate * qty
  }

  const grandTotal = useMemo(
    () => items.reduce((sum, r) => sum + rowTotal(r), 0),
    [items]
  )

  const updateRow = (idx, patch) => {
    const next = items.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    onChange(next)
  }

  const addRow = () => {
    onChange([
      ...items,
      {
        _tempKey: `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        product_id: null,
        product_name_override: '',
        quantity: '',
        unit: 'kg',
        target_rate: '',
        our_quoted_rate: '',
        notes: '',
      },
    ])
  }

  const removeRow = (idx) => {
    onChange(items.filter((_, i) => i !== idx))
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
          Products Required
        </h3>
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 text-[12px] font-semibold text-indigo-600 hover:text-indigo-700"
        >
          <Plus size={14} /> Add product
        </button>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-8 text-[13px] text-slate-400 border-2 border-dashed border-slate-200 rounded-xl">
          No products yet — click "Add product" above.
        </div>
      ) : (
        <div className="space-y-2">
          {/* Header row */}
          <div className="hidden md:grid grid-cols-12 gap-2 px-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <div className="col-span-4">Product</div>
            <div className="col-span-1 text-right">Qty</div>
            <div className="col-span-1">Unit</div>
            <div className="col-span-2 text-right">Target ₹</div>
            <div className="col-span-2 text-right">Quoted ₹</div>
            <div className="col-span-1 text-right">Total</div>
            <div className="col-span-1" />
          </div>

          {items.map((row, idx) => {
            const key = row.id || row._tempKey || idx
            const product = products.find(p => p.id === row.product_id)
            return (
              <div
                key={key}
                className="grid grid-cols-12 gap-2 items-start bg-slate-50 rounded-lg p-2"
              >
                <div className="col-span-12 md:col-span-4">
                  <select
                    value={row.product_id || ''}
                    onChange={(e) => {
                      const pid = e.target.value || null
                      const picked = products.find(p => p.id === pid)
                      updateRow(idx, {
                        product_id: pid,
                        product_name_override: pid ? '' : row.product_name_override,
                        unit: picked?.rate_unit || row.unit || 'kg',
                        target_rate: row.target_rate || picked?.default_rate || '',
                      })
                    }}
                    className="w-full text-[13px] bg-white border border-slate-200 rounded-lg px-2 py-1.5"
                  >
                    <option value="">Pick or type below...</option>
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  {!row.product_id && (
                    <input
                      type="text"
                      value={row.product_name_override || ''}
                      onChange={(e) => updateRow(idx, { product_name_override: e.target.value })}
                      placeholder="Custom product description"
                      className="w-full mt-1 text-[12px] bg-white border border-slate-200 rounded-lg px-2 py-1"
                    />
                  )}
                </div>
                <div className="col-span-3 md:col-span-1">
                  <Input
                    type="number"
                    value={row.quantity ?? ''}
                    onChange={(e) => updateRow(idx, { quantity: e.target.value })}
                    className="text-right"
                  />
                </div>
                <div className="col-span-3 md:col-span-1">
                  <Input
                    value={row.unit || ''}
                    onChange={(e) => updateRow(idx, { unit: e.target.value })}
                    placeholder="kg"
                  />
                </div>
                <div className="col-span-3 md:col-span-2">
                  <Input
                    type="number"
                    value={row.target_rate ?? ''}
                    onChange={(e) => updateRow(idx, { target_rate: e.target.value })}
                    placeholder="Customer asking"
                    className="text-right"
                  />
                </div>
                <div className="col-span-3 md:col-span-2">
                  <Input
                    type="number"
                    value={row.our_quoted_rate ?? ''}
                    onChange={(e) => updateRow(idx, { our_quoted_rate: e.target.value })}
                    placeholder="We quote"
                    className="text-right"
                  />
                </div>
                <div className="col-span-11 md:col-span-1 text-right text-[13px] font-semibold text-slate-800 self-center">
                  ₹{rowTotal(row).toLocaleString('en-IN')}
                </div>
                <div className="col-span-1 flex justify-end self-center">
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                    aria-label="Remove line"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                {(product?.hsn_code || row.notes) && (
                  <div className="col-span-12 text-[11px] text-slate-400 px-1 pl-2">
                    {product?.hsn_code && <span>HSN {product.hsn_code} · </span>}
                    <input
                      type="text"
                      value={row.notes || ''}
                      onChange={(e) => updateRow(idx, { notes: e.target.value })}
                      placeholder="Notes (optional)"
                      className="bg-transparent outline-none w-[calc(100%-120px)]"
                    />
                  </div>
                )}
              </div>
            )
          })}

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200">
            <span className="text-[12px] text-slate-500">Expected value:</span>
            <span className="text-[16px] font-bold text-slate-900">
              ₹{grandTotal.toLocaleString('en-IN')}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
