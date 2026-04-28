/**
 * BillLineItem — one cart row with qty controls, line discount, remove.
 */

import { Minus, Plus, X } from 'lucide-react'

export default function BillLineItem({ line, lineTotal, stockQty, onUpdate, onRemove }) {
  const lowStock = stockQty != null && stockQty < line.qty
  return (
    <div className="py-2 border-b border-slate-100 last:border-0">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-slate-700 truncate">{line.description}</div>
          <div className="text-[10px] text-slate-400 font-mono">{line.code}</div>
        </div>
        <button onClick={() => onRemove(line.id)} className="p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50">
          <X size={14} />
        </button>
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onUpdate(line.id, { qty: Math.max(0.001, +(line.qty - 1).toFixed(3)) })}
            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
          ><Minus size={11} /></button>
          <input
            type="number"
            value={line.qty}
            onChange={e => onUpdate(line.id, { qty: parseFloat(e.target.value) || 0 })}
            className="w-14 text-center text-[11px] font-semibold border border-slate-200 rounded px-1 py-0.5"
            step="0.001"
          />
          <button
            onClick={() => onUpdate(line.id, { qty: +(line.qty + 1).toFixed(3) })}
            className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-600"
          ><Plus size={11} /></button>
          <span className="text-[10px] text-slate-400 ml-1">{line.unit} × ₹</span>
          <input
            type="number"
            value={line.rate}
            onChange={e => onUpdate(line.id, { rate: parseFloat(e.target.value) || 0 })}
            className="w-16 text-center text-[11px] font-semibold border border-slate-200 rounded px-1 py-0.5"
            step="0.01"
          />
        </div>
        <div className="text-[13px] font-bold text-slate-700">₹{Number(lineTotal || 0).toFixed(2)}</div>
      </div>
      {lowStock && (
        <div className="text-[9px] text-red-500 mt-0.5">⚠ stock {stockQty} — selling negative</div>
      )}
    </div>
  )
}
