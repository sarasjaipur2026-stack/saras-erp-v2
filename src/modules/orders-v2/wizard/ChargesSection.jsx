/**
 * <ChargesSection> — order-level extra charges (freight, packing, labour…)
 * for the Order Wizard.
 *
 * Pure controlled component: parent owns the `charges` array; this just
 * renders rows + add/remove/patch handlers. Saves into orders.createAtomic's
 * `chargesArr` param.
 */

import { Plus, Trash2 } from 'lucide-react'
import { Currency, SearchSelect, Input } from '../../../components/ui'

/**
 * @param {object} props
 * @param {Array<{chargeTypeId: string, amount: string|number}>} props.charges
 * @param {Array<{id: string, name: string, default_value?: number, charge_mode?: string}>} props.chargeTypes
 * @param {(patch: Array) => void} props.onChange
 */
export default function ChargesSection({ charges, chargeTypes, onChange }) {
  const options = (chargeTypes || []).map((c) => ({
    value: c.id,
    label: c.name,
  }))

  const total = charges.reduce((a, c) => a + (Number(c.amount) || 0), 0)

  const patchAt = (idx, patch) =>
    onChange(charges.map((c, i) => (i === idx ? { ...c, ...patch } : c)))

  const removeAt = (idx) =>
    onChange(charges.filter((_, i) => i !== idx))

  const addRow = () => {
    // Pre-fill with the first available type so the row is immediately useful.
    const firstType = chargeTypes?.[0]
    onChange([
      ...charges,
      {
        chargeTypeId: firstType?.id || '',
        amount: firstType?.default_value ?? '',
      },
    ])
  }

  return (
    <div className="space-y-2">
      {charges.length === 0 && (
        <p className="text-[11px] text-slate-400 leading-snug">
          Freight · packing · labour · any flat or percentage charge that
          isn't a line item.
        </p>
      )}

      {charges.map((row, idx) => {
        const ct = (chargeTypes || []).find((c) => c.id === row.chargeTypeId)
        return (
          <div key={idx} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-7">
              <SearchSelect
                value={row.chargeTypeId}
                options={options}
                placeholder="Charge type…"
                onChange={(v) => {
                  const next = (chargeTypes || []).find((c) => c.id === v)
                  patchAt(idx, {
                    chargeTypeId: v,
                    // Only auto-fill amount if user hasn't already typed one.
                    amount: row.amount || next?.default_value || '',
                  })
                }}
              />
              {ct?.charge_mode === 'percentage' && (
                <p className="mt-0.5 text-[10px] text-slate-400">
                  Stored as a flat amount (not a % of subtotal). Phase 10.1
                  wires server-side % computation.
                </p>
              )}
            </div>
            <div className="col-span-4">
              <Input
                type="number"
                inputMode="decimal"
                value={row.amount}
                onChange={(e) => patchAt(idx, { amount: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div className="col-span-1 flex items-center justify-end pb-2">
              <button
                type="button"
                onClick={() => removeAt(idx)}
                className="inline-flex items-center gap-1 rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                title="Remove charge"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </div>
        )
      })}

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={addRow}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-50 transition"
        >
          <Plus size={12} /> Add charge
        </button>
        {charges.length > 0 && (
          <div className="text-[12px] text-slate-500">
            Total charges <strong className="ml-1 tabular-nums text-slate-900"><Currency amount={total} /></strong>
          </div>
        )}
      </div>
    </div>
  )
}
