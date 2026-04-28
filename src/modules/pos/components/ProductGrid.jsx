/**
 * ProductGrid — virtualized grid of POS product tiles.
 * Uses @tanstack/react-virtual to keep 60fps with 2,310+ SKUs.
 *
 * Spec: docs/specs/2026-04-28-pos-system-design.md §7
 */

import { useRef, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import ProductTile from './ProductTile'

export default function ProductGrid({ products, primaryImagesByProductId, stockByProductId, onAdd, mode = 'counter' }) {
  const parentRef = useRef(null)

  const cols = mode === 'field' ? 3 : 5
  const rowHeight = mode === 'field' ? 168 : 130
  const rows = useMemo(() => {
    const r = []
    for (let i = 0; i < products.length; i += cols) r.push(products.slice(i, i + cols))
    return r
  }, [products, cols])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  })

  if (products.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">No products in this category</div>
    )
  }

  return (
    <div ref={parentRef} className="flex-1 overflow-y-auto p-3 bg-slate-100">
      <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
        {rowVirtualizer.getVirtualItems().map((vRow) => {
          const row = rows[vRow.index]
          return (
            <div
              key={vRow.key}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, height: rowHeight, transform: `translateY(${vRow.start}px)` }}
              className="grid gap-2"
            >
              <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                {row.map((p) => (
                  <ProductTile
                    key={p.id}
                    product={p}
                    primaryImage={primaryImagesByProductId.get(p.id)}
                    stockQty={stockByProductId.get(p.id)}
                    onClick={onAdd}
                    mode={mode}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
