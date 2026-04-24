import { useEffect, useMemo, useState } from 'react';
import { Package, Plus, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui';
import { LineItemRow } from '../components/LineItemRow';
import { stockMovements } from '../../../lib/db';

// Pull top-used product IDs from the existing line items of this session
// so the operator can one-tap a recently-entered product into a new line.
const useRecentProducts = (lineItems, products) => useMemo(() => {
  if (!products?.length) return [];
  const freq = new Map();
  (lineItems || []).forEach((li) => {
    if (!li.product_id) return;
    freq.set(li.product_id, (freq.get(li.product_id) || 0) + 1);
  });
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pid]) => products.find((p) => p.id === pid))
    .filter(Boolean);
}, [lineItems, products]);

export function StepLineItems({
  formData,
  onAddItem,
  onAddItemWithProduct,
  onUpdateItem,
  onRemoveItem,
  onCopyItem,
  onReorder,
  expandedItems,
  setExpandedItems,
  products,
  materials,
  machines,
  colors,
}) {
  const recentProducts = useRecentProducts(formData.line_items, products);

  // Stock lookup — fetch once on mount so LineItemRow can show an inline
  // "Stock: 340m" chip next to the qty field. Failure is non-fatal: the chip
  // simply doesn't render. Refresh on mount only to avoid hammering the DB
  // during typing/editing.
  const [stockMap, setStockMap] = useState({ product: new Map(), material: new Map() });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await stockMovements.computeBalances();
        if (error || !data || cancelled) return;
        const product = new Map();
        const material = new Map();
        for (const row of data) {
          const qty = Number(row.quantity || 0);
          if (row.product_id) {
            const cur = product.get(row.product_id) || { qty: 0, unit: row.unit };
            product.set(row.product_id, { qty: cur.qty + qty, unit: row.unit || cur.unit });
          }
          if (row.material_id) {
            const cur = material.get(row.material_id) || { qty: 0, unit: row.unit };
            material.set(row.material_id, { qty: cur.qty + qty, unit: row.unit || cur.unit });
          }
        }
        setStockMap({ product, material });
      } catch { /* ignore — chip is best-effort */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-slate-900">Order Line Items</h3>
        <Button onClick={onAddItem} className="bg-indigo-600 text-white hover:bg-indigo-700">
          <Plus size={16} />
          Add Item
        </Button>
      </div>

      {recentProducts.length > 0 && onAddItemWithProduct && (
        <div className="flex items-center gap-2 flex-wrap p-3 bg-indigo-50/40 border border-indigo-100 rounded-xl">
          <Sparkles size={14} className="text-indigo-500 shrink-0" />
          <span className="text-xs text-indigo-700 font-medium">Quick add:</span>
          {recentProducts.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onAddItemWithProduct(p)}
              className="px-2.5 py-1 text-xs rounded-md bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white transition-colors"
            >
              {p.code ? `${p.code} — ${p.name}` : p.name}
            </button>
          ))}
        </div>
      )}

      {(!formData.line_items || formData.line_items.length === 0) ? (
        <div className="text-center py-12 text-slate-500">
          <Package size={32} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm mb-4">No line items yet.</p>
          <Button onClick={onAddItem} variant="secondary" size="sm">
            <Plus size={14} /> Add first item
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {formData.line_items.map((item, idx) => (
            <LineItemRow
              key={item.id}
              item={item}
              index={idx}
              isExpanded={expandedItems[item.id]}
              onToggle={() =>
                setExpandedItems((prev) => ({
                  ...prev,
                  [item.id]: !prev[item.id],
                }))
              }
              onUpdate={(updates) => onUpdateItem(item.id, updates)}
              onRemove={() => onRemoveItem(item.id)}
              onCopy={onCopyItem ? () => onCopyItem(item.id) : undefined}
              onMoveUp={() => onReorder(item.id, 'up')}
              onMoveDown={() => onReorder(item.id, 'down')}
              canMoveUp={idx > 0}
              canMoveDown={idx < formData.line_items.length - 1}
              products={products}
              materials={materials}
              machines={machines}
              colors={colors}
              stockMap={stockMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}
