/**
 * <ProductTile> — single tappable tile in the wizard product grid.
 *
 * Borrowed from POS pattern but adapted for the order wizard:
 *   - shows a "✓ N in cart" badge when the product is already a line
 *   - tap increments qty on the existing line (instead of opening a numpad)
 *   - rate auto-fills from product master on first add
 */

import { memo } from 'react'
import { Check } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

function publicUrl(path) {
  if (!path) return null
  try {
    return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
  } catch {
    return null
  }
}

const ProductTile = memo(function ProductTile({ product, onTap, inCartQty }) {
  const url = publicUrl(product.image_path || product.primary_image?.storage_path)
  const isActive = inCartQty > 0
  return (
    <button
      type="button"
      onClick={() => onTap(product)}
      className={`relative bg-white rounded-xl p-2 text-left border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
        isActive
          ? 'border-indigo-300 ring-2 ring-indigo-500/20 shadow-sm'
          : 'border-slate-100 hover:border-indigo-300 hover:shadow-sm'
      }`}
    >
      {isActive && (
        <span className="absolute top-1 right-1 inline-flex items-center gap-0.5 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
          <Check size={9} /> {inCartQty}
        </span>
      )}
      <div className="bg-slate-50 rounded-lg mb-1.5 flex items-center justify-center overflow-hidden h-16">
        {url ? (
          <img src={url} alt={product.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[9px] text-slate-400 font-mono">{product.code || '—'}</span>
        )}
      </div>
      <div className="text-[11px] font-semibold text-slate-700 leading-tight line-clamp-2 min-h-[28px]">
        {product.name}
      </div>
      <div className="flex items-center justify-between mt-1">
        <span className="text-[9px] text-slate-400 font-mono truncate">{product.code || ''}</span>
        <span className="text-[12px] font-bold text-indigo-600">
          ₹{Number(product.default_rate || 0).toFixed(0)}
        </span>
      </div>
    </button>
  )
})

export default ProductTile
