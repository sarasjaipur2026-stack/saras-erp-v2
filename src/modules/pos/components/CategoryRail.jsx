/**
 * CategoryRail — left rail of POS register.
 * Categories are derived from the product master's `category` text column.
 * Click a category to filter the ProductGrid.
 */

import { useMemo } from 'react'

const ALL = '__all__'

export default function CategoryRail({ products, selected, onSelect }) {
  const cats = useMemo(() => {
    const counts = new Map()
    counts.set(ALL, products.length)
    for (const p of products) {
      const k = (p.category || 'other').toLowerCase()
      counts.set(k, (counts.get(k) || 0) + 1)
    }
    return Array.from(counts.entries()).map(([key, count]) => ({ key, count }))
  }, [products])

  return (
    <div className="bg-white border-r border-slate-200 overflow-y-auto py-3 px-2">
      <div className="text-[10px] uppercase text-slate-400 font-semibold px-2 mb-2">Categories</div>
      {cats.map(({ key, count }) => {
        const active = (selected || ALL) === key
        const label = key === ALL ? 'All' : prettyLabel(key)
        return (
          <button
            key={key}
            onClick={() => onSelect(key === ALL ? null : key)}
            className={`w-full text-center py-3 mb-1 rounded-xl text-[12px] font-medium transition-colors ${active ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'}`}
          >
            <div className={`leading-tight ${active ? '' : 'text-slate-700'}`}>{label}</div>
            <div className={`text-[10px] mt-0.5 ${active ? 'text-indigo-100' : 'text-slate-400'}`}>{count}</div>
          </button>
        )
      })}
    </div>
  )
}

function prettyLabel(key) {
  return String(key).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
