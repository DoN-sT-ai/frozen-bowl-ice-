import React, { useState, useEffect } from 'react';
import { StockMovement, MovementType } from '../../types';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { ArrowLeftRight, Filter, Search, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';

export const StockMovementsList: React.FC = () => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadMovements = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setIsRefreshing(true);
      setErrorMsg(null);
      const data = await api.getStockMovements({
        type: selectedType !== 'all' ? (selectedType as MovementType) : undefined,
        limit: 150,
      });
      setMovements(data);
    } catch (err: any) {
      if (!silent) setErrorMsg(err.message || 'Failed to load stock movements');
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadMovements(false);
    const interval = setInterval(() => {
      loadMovements(true);
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedType]);

  const filteredMovements = movements.filter((m) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.product_name.toLowerCase().includes(q) ||
      (m.reason && m.reason.toLowerCase().includes(q)) ||
      m.user_name.toLowerCase().includes(q)
    );
  });

  const getBadgeStyle = (type: MovementType) => {
    switch (type) {
      case 'SALE':
        return 'text-neutral-700 bg-neutral-100 border-neutral-200';
      case 'PURCHASE':
        return 'text-emerald-800 bg-emerald-50 border-emerald-200';
      case 'DAMAGE':
        return 'text-red-800 bg-red-50 border-red-200';
      case 'VOID':
        return 'text-amber-800 bg-amber-50 border-amber-200';
      default:
        return 'text-neutral-600 bg-neutral-50 border-neutral-200';
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-50 overflow-y-auto md:overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-white border-b border-neutral-200 space-y-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-base font-semibold text-neutral-900 leading-none">
              Stock Movements Audit
            </h1>
            <p className="text-xs text-neutral-500 mt-1">
              Immutable ledger of every unit added, sold, adjusted, or restored.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Updates</span>
            </div>
            <button
              onClick={() => loadMovements(false)}
              className="px-2.5 py-1 text-xs text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded flex items-center gap-1.5 font-medium transition-colors"
              title="Auto-refreshing live every 3s. Click to refresh immediately."
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing || loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search product or reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded text-xs focus:bg-white focus:outline-none focus:border-neutral-900"
            />
          </div>

          <div className="flex items-center gap-1 bg-neutral-100 p-1 rounded border border-neutral-200 overflow-x-auto">
            <span className="text-neutral-500 text-[10px] uppercase font-mono px-1">Type:</span>
            {['all', 'PURCHASE', 'SALE', 'ADJUSTMENT', 'DAMAGE', 'VOID'].map((t) => (
              <button
                key={t}
                onClick={() => setSelectedType(t)}
                className={`px-2 py-0.5 rounded transition-colors text-xs font-medium whitespace-nowrap ${
                  selectedType === t
                    ? 'bg-white text-neutral-900 shadow-xs'
                    : 'text-neutral-600 hover:text-neutral-900'
                }`}
              >
                {t === 'all' ? 'All Types' : t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-4 mt-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex justify-between items-center">
          <span>{errorMsg}</span>
          <button onClick={() => loadMovements(false)} className="font-semibold underline ml-2">Retry</button>
        </div>
      )}

      {/* Movements Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-400">Loading stock movements...</div>
        ) : filteredMovements.length === 0 ? (
          <div className="bg-white rounded border border-neutral-200 p-8 text-center text-xs text-neutral-500">
            No stock movements recorded for this filter.
          </div>
        ) : (
          <div className="bg-white rounded border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[760px]">
                <thead>
                  <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3 text-center">Movement Type</th>
                    <th className="py-2.5 px-3 text-right">Previous Stock</th>
                    <th className="py-2.5 px-3 text-right">Quantity</th>
                    <th className="py-2.5 px-3 text-right">Resulting Stock</th>
                    <th className="py-2.5 px-3">Reason / Reference</th>
                    <th className="py-2.5 px-3">Author</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {filteredMovements.map((m) => {
                    const isPositive = m.quantity > 0;
                    return (
                      <tr key={m.id} className="hover:bg-neutral-50 transition-colors">
                        <td className="py-2.5 px-3 text-neutral-500 font-mono text-[11px]">
                          {formatDateTime(m.created_at)}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-neutral-900">
                          {m.product_name}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${getBadgeStyle(
                              m.type
                            )}`}
                          >
                            {m.type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-neutral-500">
                          {m.before_stock}
                        </td>
                        <td
                          className={`py-2.5 px-3 text-right font-mono font-bold tabular-nums ${
                            isPositive ? 'text-emerald-700' : 'text-neutral-900'
                          }`}
                        >
                          {isPositive ? `+${m.quantity}` : m.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-neutral-900">
                          {m.after_stock}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600 max-w-xs">
                          <div>{m.reason || '-'}</div>
                          {m.purchase_cost !== undefined && m.purchase_cost > 0 && (
                            <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                              Buy: ₹{m.purchase_cost} {m.tax_rate ? `· ${m.tax_rate}% GST` : ''}
                              {m.supplier_invoice ? ` · Inv: ${m.supplier_invoice}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-700">
                          {m.user_name}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
