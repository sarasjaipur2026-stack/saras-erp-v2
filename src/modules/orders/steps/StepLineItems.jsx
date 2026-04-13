import { Package, Plus } from 'lucide-react';
import { Button } from '../../../components/ui';
import { LineItemRow } from '../components/LineItemRow';

export function StepLineItems({
  formData,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onReorder,
  expandedItems,
  setExpandedItems,
  products,
  materials,
  machines,
  colors,
}) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-900">Order Line Items</h3>
        <Button onClick={onAddItem} className="bg-indigo-600 text-white hover:bg-indigo-700">
          <Plus size={16} />
          Add Item
        </Button>
      </div>

      {(!formData.line_items || formData.line_items.length === 0) ? (
        <div className="text-center py-8 text-slate-500">
          <Package size={32} className="mx-auto mb-2 opacity-50" />
          <p>No line items added yet. Click "Add Item" to get started.</p>
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
              onMoveUp={() => onReorder(item.id, 'up')}
              onMoveDown={() => onReorder(item.id, 'down')}
              canMoveUp={idx > 0}
              canMoveDown={idx < formData.line_items.length - 1}
              products={products}
              materials={materials}
              machines={machines}
              colors={colors}
            />
          ))}
        </div>
      )}
    </div>
  );
}
