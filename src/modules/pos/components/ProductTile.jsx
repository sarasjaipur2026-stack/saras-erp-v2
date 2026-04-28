/**
 * ProductTile — single tappable tile in the POS grid.
 * Image (lazy), code badge, name, stock badge, price.
 */

import { memo } from 'react'
import { supabase } from '../../../lib/supabase'

function publicUrl(path) {
  if (!path) return null
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}

function StockBadge({ qty }) {
  if (qty == null) return null
  const cls = qty > 5 ? 'text-emerald-600' : qty > 0 ? 'text-amber-600' : 'text-red-600'
  return <span className={`text-[10px] ${cls}`}>Stock {Number(qty).toFixed(qty % 1 === 0 ? 0 : 2)}</span>
}

const ProductTile = memo(function ProductTile({ product, onClick, primaryImage, stockQty, mode = 'counter' }) {
  const url = publicUrl(primaryImage?.storage_path)
  const isField = mode === 'field'
  return (
    <button
      onClick={() => onClick(product)}
      className="bg-white rounded-xl p-2 text-left border border-slate-100 hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
    >
      <div className={`bg-slate-50 rounded-lg mb-1.5 flex items-center justify-center overflow-hidden ${isField ? 'h-20' : 'h-14'}`}>
        {url ? (
          <img src={url} alt={product.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <span className="text-[9px] text-slate-400 font-mono">{product.code}</span>
        )}
      </div>
      <div className="text-[11px] font-semibold text-slate-700 leading-tight line-clamp-2 min-h-[28px]">{product.name}</div>
      <div className="flex items-center justify-between mt-1">
        <StockBadge qty={stockQty} />
        <span className="text-[12px] font-bold text-indigo-600">₹{Number(product.default_rate || 0).toFixed(0)}</span>
      </div>
    </button>
  )
})

export default ProductTile
