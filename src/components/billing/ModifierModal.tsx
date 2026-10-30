import React, { useState } from 'react';
import { X, Plus, Minus, Check } from 'lucide-react';
import { Product, SelectedModifier, ModifierGroupItem } from '../../types';
import { formatMoney } from '../../shared/calculations';

interface ModifierModalProps {
  product: Product;
  onAddToCart: (
    product: Product,
    selectedModifiers: SelectedModifier[],
    quantity: number
  ) => void;
  onClose: () => void;
}

export const ModifierModal: React.FC<ModifierModalProps> = ({ product, onAddToCart, onClose }) => {
  const [quantity, setQuantity] = useState(1);
  const [selectedMods, setSelectedMods] = useState<
    Map<string, { mod: any; qty: number }>
  >(new Map());

  const handleToggleModifier = (group: ModifierGroupItem, mod: any) => {
    const next = new Map(selectedMods);

    if (group.selectionType === 'single') {
      // Remove other modifiers in this single-choice group
      for (const m of group.modifiers) {
        next.delete(m.id);
      }
      next.set(mod.id, { mod, qty: 1 });
    } else {
      // Multiple selection
      if (next.has(mod.id)) {
        next.delete(mod.id);
      } else {
        // Enforce max selections
        const currentGroupCount = Array.from(next.values()).filter((item) =>
          group.modifiers.some((m) => m.id === item.mod.id)
        ).length;

        if (currentGroupCount < (group.maxSelections || 4)) {
          next.set(mod.id, { mod, qty: 1 });
        }
      }
    }

    setSelectedMods(next);
  };

  // Base price in minor paise (e.g. ₹80 -> 8000 paise)
  const basePriceMinor = Math.round(product.selling_price * 100);
  let unitPriceMinor = basePriceMinor;

  for (const item of selectedMods.values()) {
    unitPriceMinor += (item.mod.additionalPriceMinor || 0) * item.qty;
  }
  const totalLinePriceMinor = unitPriceMinor * quantity;

  const handleConfirm = () => {
    const list: SelectedModifier[] = Array.from(selectedMods.values()).map((item) => ({
      modifierId: item.mod.id,
      name: item.mod.name,
      additionalPriceMinor: item.mod.additionalPriceMinor || 0,
      quantity: item.qty,
    }));
    onAddToCart(product, list, quantity);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden flex flex-col max-h-[85vh] border border-neutral-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-neutral-50/80">
          <div>
            <h3 className="font-bold text-base text-neutral-900">{product.name}</h3>
            <div className="text-xs text-neutral-500 mt-0.5">
              Base Price: <span className="font-semibold text-neutral-900 font-mono">{formatMoney(basePriceMinor)}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-200 rounded-md text-neutral-500 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modifier Groups */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
          {product.modifierGroups && product.modifierGroups.length > 0 ? (
            product.modifierGroups.map((group) => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-neutral-900 uppercase tracking-wide">
                    {group.name}
                  </span>
                  <span className="text-neutral-500">
                    {group.selectionType === 'single'
                      ? 'Select 1 option'
                      : `Max ${group.maxSelections || 4} options`}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {group.modifiers.map((mod) => {
                    const isSelected = selectedMods.has(mod.id);
                    return (
                      <button
                        key={mod.id}
                        type="button"
                        onClick={() => handleToggleModifier(group, mod)}
                        className={`flex items-center justify-between p-3 rounded-lg border text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-neutral-900 bg-neutral-900/5 text-neutral-900'
                            : 'border-neutral-200 hover:border-neutral-300 bg-white'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-4 h-4 rounded-${
                              group.selectionType === 'single' ? 'full' : 'md'
                            } border flex items-center justify-center ${
                              isSelected
                                ? 'bg-neutral-900 border-neutral-900 text-white'
                                : 'border-neutral-400'
                            }`}
                          >
                            {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                          </div>
                          <div>
                            <div className="text-xs font-semibold text-neutral-900">{mod.name}</div>
                            {mod.ingredients && mod.ingredients.length > 0 && (
                              <div className="text-[10px] text-neutral-500">
                                Consumes: {mod.ingredients.map(i => `${i.quantityPerModifierBase}${i.baseUnitCode || 'g'} ${i.inventoryItemName || ''}`).join(', ')}
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="text-xs font-semibold font-mono text-neutral-800">
                          {mod.additionalPriceMinor > 0
                            ? `+${formatMoney(mod.additionalPriceMinor)}`
                            : 'Free'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="text-xs text-neutral-500 text-center py-4">
              No customizations available for this item.
            </div>
          )}
        </div>

        {/* Footer with Quantity Stepper and Add Button */}
        <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-between">
          {/* Quantity Stepper */}
          <div className="flex items-center border border-neutral-200 bg-white rounded-lg p-1">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 disabled:opacity-40 cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-8 text-center text-xs font-semibold font-mono">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add Button */}
          <button
            type="button"
            onClick={handleConfirm}
            className="flex items-center gap-2 px-5 py-2.5 bg-neutral-900 text-white rounded-lg text-xs font-semibold hover:bg-neutral-800 transition-colors shadow-xs cursor-pointer"
          >
            <span>Add to Order</span>
            <span>·</span>
            <span className="font-mono">{formatMoney(totalLinePriceMinor)}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

