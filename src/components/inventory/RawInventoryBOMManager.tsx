import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
  calculatePackBreakdown,
  calculateReceivedBaseQuantity,
  calculateWeightedAverageCost,
  formatMoney,
  paiseToRupees,
  rupeesToPaise,
} from '../../shared/calculations';
import {
  Boxes,
  Plus,
  ArrowDownToLine,
  SlidersHorizontal,
  Search,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Scale,
  ShieldCheck,
  Package,
} from 'lucide-react';

export const RawInventoryBOMManager: React.FC = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterAlert, setFilterAlert] = useState<'all' | 'low' | 'out'>('all');
  const [auditStatus, setAuditStatus] = useState<any>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [receiveModalItem, setReceiveModalItem] = useState<any | null>(null);
  const [wastageModalItem, setWastageModalItem] = useState<any | null>(null);
  const [showStockCountModal, setShowStockCountModal] = useState<boolean>(false);

  // Form states - Create Raw Item
  const [newItemName, setNewItemName] = useState<string>('');
  const [newItemSku, setNewItemSku] = useState<string>('');
  const [newItemBaseUnit, setNewItemBaseUnit] = useState<string>('g');
  const [newItemPackSize, setNewItemPackSize] = useState<string>('1000');
  const [newItemReorderLevel, setNewItemReorderLevel] = useState<string>('2000');
  const [newItemInitialStock, setNewItemInitialStock] = useState<string>('0');
  const [newItemUnitCostRupees, setNewItemUnitCostRupees] = useState<string>('0.25');

  // Form states - Receive Delivery (Packs to Base Conversion)
  const [receivePacks, setReceivePacks] = useState<string>('1');
  const [receivePackSize, setReceivePackSize] = useState<string>('1000');
  const [receiveTotalRupees, setReceiveTotalRupees] = useState<string>('500');
  const [receiveInvoiceRef, setReceiveInvoiceRef] = useState<string>('');

  // Form states - Wastage
  const [wastageQtyBase, setWastageQtyBase] = useState<string>('100');
  const [wastageReason, setWastageReason] = useState<'spoiled' | 'dropped' | 'melted' | 'expired' | 'prep_error'>('melted');
  const [wastageNotes, setWastageNotes] = useState<string>('');

  // Form states - Stock Count
  const [countInputs, setCountInputs] = useState<Record<string, string>>({});

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const loadData = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setIsRefreshing(true);
      const [itemsRes, auditRes] = await Promise.all([
        api.getInventoryRawItems(),
        api.getLedgerAuditDrift(),
      ]);
      setItems(itemsRes);
      setAuditStatus(auditRes);

      if (!silent && !showStockCountModal) {
        const initialCounts: Record<string, string> = {};
        for (const it of itemsRes) {
          initialCounts[it.id] = String(it.current_stock_base);
        }
        setCountInputs(initialCounts);
      }
    } catch (err: any) {
      if (!silent) setFeedbackMsg({ type: 'error', text: err.message || 'Failed to load raw inventory' });
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);
    const interval = setInterval(() => {
      if (!receiveModalItem && !wastageModalItem && !showCreateModal && !showStockCountModal) {
        loadData(true);
      }
    }, 3500);
    return () => clearInterval(interval);
  }, [showStockCountModal, receiveModalItem, wastageModalItem, showCreateModal]);

  const filteredItems = items.filter((it) => {
    const isOut = it.current_stock_base <= 0;
    const isLow = it.current_stock_base <= it.reorder_level_base && !isOut;
    if (filterAlert === 'low' && !isLow) return false;
    if (filterAlert === 'out' && !isOut) return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return it.name.toLowerCase().includes(q) || (it.sku && it.sku.toLowerCase().includes(q));
  });

  // Action: Create Raw Item
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      setFeedbackMsg({ type: 'error', text: 'Item name is required' });
      return;
    }
    try {
      await api.createInventoryRawItem({
        name: newItemName.trim(),
        sku: newItemSku.trim() || undefined,
        baseUnitCode: newItemBaseUnit,
        defaultPackQuantityBase: parseInt(newItemPackSize, 10) || 1000,
        reorderLevelBase: parseInt(newItemReorderLevel, 10) || 2000,
        initialStockBase: parseInt(newItemInitialStock, 10) || 0,
        initialUnitCostMinor: rupeesToPaise(parseFloat(newItemUnitCostRupees) || 0),
      });
      setFeedbackMsg({ type: 'success', text: `Created bulk inventory item "${newItemName}"` });
      setShowCreateModal(false);
      setNewItemName('');
      setNewItemSku('');
      loadData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to create item' });
    }
  };

  // Action: Receive Purchase
  const handleReceivePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receiveModalItem) return;
    const packs = parseInt(receivePacks, 10) || 0;
    const packSize = parseInt(receivePackSize, 10) || 0;
    const totalMinor = rupeesToPaise(parseFloat(receiveTotalRupees) || 0);

    if (packs <= 0 || packSize <= 0) {
      setFeedbackMsg({ type: 'error', text: 'Packs and Pack Size must be positive numbers' });
      return;
    }

    try {
      await api.receivePurchase({
        invoiceReference: receiveInvoiceRef.trim() || undefined,
        lines: [
          {
            inventoryItemId: receiveModalItem.id,
            purchaseUnit: receiveModalItem.default_purchase_unit || 'pack',
            packsReceived: packs,
            quantityPerPackBase: packSize,
            lineTotalMinor: totalMinor,
          },
        ],
      });
      const baseQty = calculateReceivedBaseQuantity(packs, packSize);
      setFeedbackMsg({
        type: 'success',
        text: `Successfully received ${baseQty} ${receiveModalItem.base_unit_code} into stock. WAC updated.`,
      });
      setReceiveModalItem(null);
      loadData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to receive purchase' });
    }
  };

  // Action: Log Wastage
  const handleLogWastage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!wastageModalItem) return;
    const qtyBase = parseInt(wastageQtyBase, 10) || 0;
    if (qtyBase <= 0) {
      setFeedbackMsg({ type: 'error', text: 'Wastage quantity must be greater than zero' });
      return;
    }

    try {
      await api.recordWastage({
        inventoryItemId: wastageModalItem.id,
        quantityBase: qtyBase,
        reason: wastageReason,
        notes: wastageNotes.trim() || undefined,
      });
      setFeedbackMsg({
        type: 'success',
        text: `Recorded wastage of ${qtyBase} ${wastageModalItem.base_unit_code} (${wastageReason})`,
      });
      setWastageModalItem(null);
      loadData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to record wastage' });
    }
  };

  // Action: Approve Physical Stock Reconciliation
  const handleStockCountReconcile = async () => {
    try {
      const lines = items.map((it) => ({
        inventoryItemId: it.id,
        countedQuantityBase: parseInt(countInputs[it.id] || '0', 10),
      }));

      const count = await api.createStockCount({
        notes: 'Floor Physical Inventory Audit',
        lines,
      });

      await api.approveStockCount(count.id);
      setFeedbackMsg({
        type: 'success',
        text: `Stock count ${count.count_number} approved and reconciled against immutable ledger.`,
      });
      setShowStockCountModal(false);
      loadData();
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to reconcile stock count' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Toast Feedback */}
      {feedbackMsg && (
        <div
          className={`p-3 rounded-lg flex items-center justify-between text-xs font-medium border ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600" />
            ) : (
              <XCircle className="w-4 h-4 text-red-600" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-neutral-400 hover:text-neutral-700 ml-4"
          >
            &times;
          </button>
        </div>
      )}

      {/* Header & Ledger Integrity Status Bar */}
      <div className="bg-white rounded-xl border border-neutral-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Boxes className="w-5 h-5 text-neutral-800" />
              <h2 className="text-base font-bold text-neutral-900">
                Bulk Raw Materials & BOM Inventory Engine
              </h2>
            </div>
            <p className="text-xs text-neutral-500 mt-0.5">
              Decoupled recipe ingredients, irreducible scalar base units (g, ml, pcs), and Moving WAC ledger.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowStockCountModal(true)}
              className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5"
            >
              <Scale className="w-3.5 h-3.5" />
              Physical Stock Count
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-medium transition-colors inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Raw Material
            </button>
          </div>
        </div>

        {/* Ledger Integrity Audit Badge */}
        {auditStatus && (
          <div className="flex items-center justify-between bg-neutral-50 rounded-lg px-3 py-2 border border-neutral-200/80 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span className="font-medium text-neutral-700">Immutable Double-Entry Ledger:</span>
              {auditStatus.status === 'HEALTHY' ? (
                <span className="text-emerald-700 font-semibold bg-emerald-100/70 px-2 py-0.5 rounded text-[11px]">
                  Zero Drift Discrepancy Verified
                </span>
              ) : (
                <span className="text-red-700 font-semibold bg-red-100 px-2 py-0.5 rounded text-[11px]">
                  {auditStatus.discrepancyCount} Drift Discrepancies Detected!
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[10px] text-emerald-800 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live
              </span>
              <button
                onClick={() => loadData(false)}
                className="text-neutral-500 hover:text-neutral-900 inline-flex items-center gap-1 text-[11px] cursor-pointer"
                title="Auto-refreshing live every 3.5s. Click to force instant audit."
              >
                <RefreshCw className={`w-3 h-3 ${isRefreshing || loading ? 'animate-spin' : ''}`} />
                Verify
              </button>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-neutral-100 text-xs">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search raw ingredient or SKU..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded text-xs focus:bg-white focus:outline-none focus:border-neutral-900"
            />
          </div>

          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded border border-neutral-200">
            <span className="text-neutral-500 text-[10px] uppercase font-mono px-1">Alerts:</span>
            {[
              { id: 'all', label: 'All Items' },
              { id: 'low', label: 'Low Stock' },
              { id: 'out', label: 'Out of Stock' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterAlert(f.id as any)}
                className={`px-2 py-0.5 rounded transition-colors text-xs font-medium ${
                  filterAlert === f.id
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Dual Display Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-xs text-neutral-400">Loading raw materials & ledger...</div>
        ) : filteredItems.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-400">No raw inventory items found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-neutral-200 bg-neutral-50/75 text-neutral-500 font-medium">
                  <th className="py-2.5 px-3">Raw Material / Ingredient</th>
                  <th className="py-2.5 px-3">Base Unit</th>
                  <th className="py-2.5 px-3 text-right">Physical Breakdown (Dual Display)</th>
                  <th className="py-2.5 px-3 text-right">Scalar Base Stock</th>
                  <th className="py-2.5 px-3 text-right">Weighted Avg Cost (WAC)</th>
                  <th className="py-2.5 px-3 text-center">Stock Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredItems.map((it) => {
                  const isOutOfStock = it.current_stock_base <= 0;
                  const isLowStock = it.current_stock_base <= it.reorder_level_base && !isOutOfStock;
                  const packCalc = calculatePackBreakdown(
                    it.current_stock_base,
                    it.default_pack_quantity_base || 1000
                  );

                  return (
                    <tr key={it.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-neutral-900">{it.name}</div>
                        <div className="text-[11px] text-neutral-400 font-mono">
                          {it.sku || 'No SKU'} · Pack size: {it.default_pack_quantity_base} {it.base_unit_code}
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded text-[11px] font-semibold text-neutral-700">
                          {it.base_unit_code}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="font-medium text-neutral-800">
                          {packCalc.displayString}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="font-mono font-bold text-neutral-900 tabular-nums">
                          {it.current_stock_base.toLocaleString()} {it.base_unit_code}
                        </div>
                        <div className="text-[10px] text-neutral-400 font-mono">
                          Reorder at: {it.reorder_level_base.toLocaleString()} {it.base_unit_code}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        <div className="font-semibold text-neutral-800">
                          {formatMoney(it.weighted_average_unit_cost_minor)}
                          <span className="text-[10px] text-neutral-400">/{it.base_unit_code}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isOutOfStock ? (
                          <span className="text-[10px] text-red-600 font-semibold px-2 py-0.5 rounded bg-red-50 border border-red-200">
                            Out of Stock
                          </span>
                        ) : isLowStock ? (
                          <span className="text-[10px] text-amber-700 font-semibold px-2 py-0.5 rounded bg-amber-50 border border-amber-200">
                            Low Stock (≤ Reorder)
                          </span>
                        ) : (
                          <span className="text-[10px] text-emerald-700 font-medium px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200">
                            In Stock
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1.5">
                        <button
                          onClick={() => {
                            setReceiveModalItem(it);
                            setReceivePacks('1');
                            setReceivePackSize(String(it.default_pack_quantity_base || 1000));
                            setReceiveTotalRupees('500');
                            setReceiveInvoiceRef('');
                          }}
                          className="px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1"
                          title="Receive bulk packs and recalculate Moving WAC"
                        >
                          <ArrowDownToLine className="w-3 h-3" />
                          Receive Packs
                        </button>
                        <button
                          onClick={() => {
                            setWastageModalItem(it);
                            setWastageQtyBase('100');
                            setWastageReason('melted');
                            setWastageNotes('');
                          }}
                          className="px-2 py-1 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-[11px] font-medium transition-colors inline-flex items-center gap-1"
                          title="Log spoilage, melting, or dropped inventory"
                        >
                          <AlertTriangle className="w-3 h-3 text-red-600" />
                          Wastage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Receive Delivery with Moving WAC Calculation Preview */}
      {receiveModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleReceivePurchase}
            className="bg-white rounded-xl border border-neutral-200 shadow-xl max-w-md w-full p-5 space-y-4"
          >
            <div>
              <h3 className="font-bold text-sm text-neutral-900">Receive Bulk Delivery (Purchase)</h3>
              <p className="text-xs text-neutral-600 font-medium mt-0.5">{receiveModalItem.name}</p>
              <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                Current Stock: {receiveModalItem.current_stock_base} {receiveModalItem.base_unit_code} · Current WAC: {formatMoney(receiveModalItem.weighted_average_unit_cost_minor)}/{receiveModalItem.base_unit_code}
              </p>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                    Packs Received *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={receivePacks}
                    onChange={(e) => setReceivePacks(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                    Pack Size ({receiveModalItem.base_unit_code}) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={receivePackSize}
                    onChange={(e) => setReceivePackSize(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                  Total Purchase Cost (₹) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={receiveTotalRupees}
                  onChange={(e) => setReceiveTotalRupees(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                  Supplier Invoice Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. INV-2026-993"
                  value={receiveInvoiceRef}
                  onChange={(e) => setReceiveInvoiceRef(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900"
                />
              </div>

              {/* Real-time WAC Calculation Preview */}
              {(() => {
                const packs = parseInt(receivePacks, 10) || 0;
                const packSize = parseInt(receivePackSize, 10) || 0;
                const baseQtyReceived = calculateReceivedBaseQuantity(packs, packSize);
                const totalMinor = rupeesToPaise(parseFloat(receiveTotalRupees) || 0);
                const receivedUnitCostMinor = baseQtyReceived > 0 ? Math.round(totalMinor / baseQtyReceived) : 0;
                const newWac = calculateWeightedAverageCost(
                  receiveModalItem.current_stock_base,
                  receiveModalItem.weighted_average_unit_cost_minor,
                  baseQtyReceived,
                  receivedUnitCostMinor
                );

                return (
                  <div className="bg-neutral-50 p-3 rounded-lg border border-neutral-200 space-y-1 font-mono text-[11px]">
                    <div className="flex justify-between text-neutral-600">
                      <span>Total Base Received:</span>
                      <span className="font-bold text-neutral-900">{baseQtyReceived} {receiveModalItem.base_unit_code}</span>
                    </div>
                    <div className="flex justify-between text-neutral-600">
                      <span>Inward Unit Cost:</span>
                      <span className="font-bold text-neutral-900">{formatMoney(receivedUnitCostMinor)}/{receiveModalItem.base_unit_code}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700 font-semibold pt-1 border-t border-neutral-200">
                      <span>New Moving WAC:</span>
                      <span>{formatMoney(newWac)}/{receiveModalItem.base_unit_code}</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setReceiveModalItem(null)}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-medium"
              >
                Confirm Delivery
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Spoilage & Wastage */}
      {wastageModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleLogWastage}
            className="bg-white rounded-xl border border-neutral-200 shadow-xl max-w-md w-full p-5 space-y-4"
          >
            <div>
              <h3 className="font-bold text-sm text-neutral-900">Record Spoilage / Wastage</h3>
              <p className="text-xs text-neutral-600 font-medium mt-0.5">{wastageModalItem.name}</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                  Wastage Quantity ({wastageModalItem.base_unit_code}) *
                </label>
                <input
                  type="number"
                  min="1"
                  value={wastageQtyBase}
                  onChange={(e) => setWastageQtyBase(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900 font-mono"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                  Reason *
                </label>
                <select
                  value={wastageReason}
                  onChange={(e) => setWastageReason(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900"
                >
                  <option value="melted">Melted (Freezer/Ambient)</option>
                  <option value="spoiled">Spoiled / Sour</option>
                  <option value="dropped">Dropped / Spilled</option>
                  <option value="expired">Expired Date</option>
                  <option value="prep_error">Kitchen Preparation Error</option>
                </select>
              </div>

              <div>
                <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                  Incident Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Temperature fluctuation overnight"
                  value={wastageNotes}
                  onChange={(e) => setWastageNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setWastageModalItem(null)}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium"
              >
                Log Wastage Entry
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Create Raw Material */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <form
            onSubmit={handleCreateItem}
            className="bg-white rounded-xl border border-neutral-200 shadow-xl max-w-md w-full p-5 space-y-4"
          >
            <div>
              <h3 className="font-bold text-sm text-neutral-900">Add Raw Bulk Material</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Define base measurement unit and bulk packaging.</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                  Material Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Belgian Chocolate Base"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                    SKU / Code
                  </label>
                  <input
                    type="text"
                    placeholder="RAW-CHOC-001"
                    value={newItemSku}
                    onChange={(e) => setNewItemSku(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                    Irreducible Base Unit *
                  </label>
                  <select
                    value={newItemBaseUnit}
                    onChange={(e) => setNewItemBaseUnit(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900 font-mono"
                  >
                    <option value="g">Grams (g) - Mass</option>
                    <option value="ml">Milliliters (ml) - Volume</option>
                    <option value="piece">Pieces (piece) - Discrete</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                    Default Pack Size ({newItemBaseUnit})
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newItemPackSize}
                    onChange={(e) => setNewItemPackSize(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                    Reorder Level ({newItemBaseUnit})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newItemReorderLevel}
                    onChange={(e) => setNewItemReorderLevel(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                    Initial Stock ({newItemBaseUnit})
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newItemInitialStock}
                    onChange={(e) => setNewItemInitialStock(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900 font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-neutral-700 block mb-1">
                    Unit Cost (₹/{newItemBaseUnit})
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={newItemUnitCostRupees}
                    onChange={(e) => setNewItemUnitCostRupees(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-neutral-200 rounded focus:outline-none focus:border-neutral-900 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-medium"
              >
                Save Material
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Physical Stock Count & Variance Reconciliation */}
      {showStockCountModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-xl max-w-2xl w-full p-5 space-y-4 max-h-[85vh] flex flex-col">
            <div>
              <h3 className="font-bold text-sm text-neutral-900">Physical Stock Count Reconciliation</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Audit physical floor counts against cached digital stock. Approval creates immutable reconciliation movements.
              </p>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 text-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-500 font-medium bg-neutral-50">
                    <th className="py-2 px-2.5">Item</th>
                    <th className="py-2 px-2.5 text-right">Expected (Base)</th>
                    <th className="py-2 px-2.5 text-right w-32">Counted Physical</th>
                    <th className="py-2 px-2.5 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {items.map((it) => {
                    const counted = parseInt(countInputs[it.id] || '0', 10);
                    const expected = it.current_stock_base;
                    const variance = counted - expected;

                    return (
                      <tr key={it.id}>
                        <td className="py-2 px-2.5">
                          <span className="font-semibold text-neutral-900">{it.name}</span>
                          <span className="text-neutral-400 font-mono text-[10px] ml-1.5">({it.base_unit_code})</span>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-medium text-neutral-700">
                          {expected.toLocaleString()}
                        </td>
                        <td className="py-2 px-2.5 text-right">
                          <input
                            type="number"
                            min="0"
                            value={countInputs[it.id] ?? ''}
                            onChange={(e) =>
                              setCountInputs({ ...countInputs, [it.id]: e.target.value })
                            }
                            className="w-24 px-2 py-1 text-right border border-neutral-200 rounded font-mono text-xs focus:outline-none focus:border-neutral-900"
                          />
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono font-bold">
                          {variance === 0 ? (
                            <span className="text-neutral-400">0</span>
                          ) : variance > 0 ? (
                            <span className="text-emerald-600">+{variance}</span>
                          ) : (
                            <span className="text-red-600">{variance}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowStockCountModal(false)}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStockCountReconcile}
                className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-xs font-medium"
              >
                Approve & Reconcile
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

