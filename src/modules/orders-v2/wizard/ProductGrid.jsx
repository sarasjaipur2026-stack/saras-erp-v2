/**
 * <ProductGrid> — tile grid for the Order Wizard, POS-style.
 *
 * Search filters by name / code / HSN.
 * Tap a tile → invokes `onPick(product)` which adds to / increments the cart
 *             in the parent (OrderWizardV2).
 *
 * Virtualisation deferred — typical product catalogues are <500 rows.
 */

import { useMemo, useState } from 'react'
import { Search, PackageX } from 'lucide-react'
import { Input } from '../../../components/ui'
import ProductTile from './ProductTile'

/**
 * @param {object} props
 * @param {Array} props.products
 * @param {Map<string, number>} props.cartByProductId  — productId → qty (for badge)
 * @param {(product: object) => void} props.onPick
 */
export default function ProductGrid({ products, cartByProductId, onPick }) {
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const list = (products || []).filter((p) => p.active !== false)
    const term = q.trim().toLowerCase()
    if (!term) return list.slice(0, 200) // soft cap for perf
    return list.filter((p) =>
      (p.name || '').toLowerCase().includes(term) ||
      (p.code || '').toLowerCase().includes(term) ||
      (p.hsn_code || '').toLowerCase().includes(term),
    ).slice(0, 200)
  }, [products, q])

  return (
    <div className="flex flex-col h-full">
      <div className="mb-3 shrink-0">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search products by name · code · HSN"
          icon={Search}
        />
        <div className="mt-1 text-[10px] text-slate-400">
          {filtered.length} of {products?.length || 0}{filtered.length >= 200 ? ' (showing first 200)' : ''}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-center text-slate-400 text-[12px]">
          <div>
            <PackageX size={24} className="mx-auto mb-2 text-slate-300" />
            No products match "{q}"
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {filtered.map((p) => (
              <ProductTile
                key={p.id}
                product={p}
                inCartQty={cartByProductId.get(p.id) || 0}
                onTap={onPick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
