import React, { useState, useEffect } from 'react';
import { Expense } from '../../types';
import { api } from '../../lib/api';
import { formatCurrency, formatDate } from '../../lib/utils';
import { Wallet, Plus, RotateCcw, AlertCircle, RefreshCw } from 'lucide-react';

export const ExpenseManager: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [form, setForm] = useState<{
    category: string;
    amount: number | string;
    description: string;
    expenseDate: string;
  }>({
    category: 'Utilities',
    amount: '',
    description: '',
    expenseDate: new Date().toISOString().split('T')[0],
  });

  const loadExpenses = async () => {
    try {
      setLoading(true);
      const data = await api.getExpenses();
      setExpenses(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(form.amount) || 0;
    if (amt <= 0) {
      setErrorMsg('Expense amount must be greater than zero');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);
      await api.createExpense({ ...form, amount: amt });
      setShowAddModal(false);
      setForm({
        category: 'Utilities',
        amount: '',
        description: '',
        expenseDate: new Date().toISOString().split('T')[0],
      });
      await loadExpenses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to record expense');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVoid = async (id: string) => {
    try {
      await api.voidExpense(id);
      await loadExpenses();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to void expense');
    }
  };

  const activeTotal = expenses
    .filter((e) => e.status === 'ACTIVE')
    .reduce((sum, e) => sum + e.amount, 0);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-50 overflow-y-auto md:overflow-hidden">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 leading-none">
            Store Expenses Ledger
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Track operational store overheads for accurate net profit calculations.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-neutral-500 uppercase font-mono block">Total Active:</span>
            <span className="text-sm font-bold font-mono text-neutral-900 tabular-nums">
              {formatCurrency(activeTotal)}
            </span>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Expense
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="mx-4 mt-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex justify-between items-center">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* Expenses Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-400">Loading expenses...</div>
        ) : expenses.length === 0 ? (
          <div className="bg-white rounded border border-neutral-200 p-8 text-center text-xs text-neutral-500">
            No expenses logged yet.
          </div>
        ) : (
          <div className="bg-white rounded border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Category</th>
                  <th className="py-2.5 px-3">Description</th>
                  <th className="py-2.5 px-3 text-right">Amount</th>
                  <th className="py-2.5 px-3">Logged By</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {expenses.map((exp) => {
                  const isVoided = exp.status === 'VOIDED';
                  return (
                    <tr
                      key={exp.id}
                      className={`hover:bg-neutral-50 transition-colors ${
                        isVoided ? 'opacity-50 bg-neutral-50' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono text-neutral-600">
                        {formatDate(exp.expense_date)}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-neutral-900">
                        {exp.category}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600">
                        {exp.description || '-'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums text-neutral-900">
                        {formatCurrency(exp.amount)}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600">
                        {exp.created_by_name}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                            isVoided
                              ? 'bg-neutral-100 text-neutral-500'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {exp.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {!isVoided && (
                          <button
                            onClick={() => handleVoid(exp.id)}
                            className="px-2 py-0.5 text-[11px] text-red-600 hover:bg-red-50 rounded transition-colors"
                          >
                            Void
                          </button>
                        )}
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

      {/* Log Expense Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form onSubmit={handleCreate} className="bg-white rounded-lg border border-neutral-200 shadow-xl max-w-sm w-full p-5 space-y-4 max-h-[85dvh] overflow-y-auto">
            <div>
              <h3 className="font-semibold text-sm text-neutral-900">Record Store Expense</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Logs overhead for accurate daily and monthly profit metrics.</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-neutral-700 block mb-1">Expense Category *</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                >
                  <option value="Utilities">Utilities (Electricity, Water, Internet)</option>
                  <option value="Packaging">Packaging & Carry Bags</option>
                  <option value="Rent">Store Rent & Maintenance</option>
                  <option value="Logistics">Freight & Delivery Logistics</option>
                  <option value="Salaries">Staff Advance / Wage</option>
                  <option value="Supplies">Cleaning & Office Supplies</option>
                  <option value="Other">Other Operational</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-neutral-700 block mb-1">Amount (₹) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  placeholder="0.00"
                  value={form.amount}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-'].includes(e.key)) e.preventDefault();
                  }}
                  onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/^0+(?=\d)/, '') })}
                  className="w-full px-2.5 py-1.5 font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-neutral-700 block mb-1">Date *</label>
                <input
                  type="date"
                  required
                  value={form.expenseDate}
                  onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-neutral-700 block mb-1">Description / Receipt Note</label>
                <input
                  type="text"
                  placeholder="e.g. Electric meter recharge token #499"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors"
              >
                {submitting ? 'Recording...' : 'Record Expense'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
