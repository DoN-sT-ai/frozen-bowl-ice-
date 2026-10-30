import React, { useState, useEffect } from 'react';
import { User } from '../../types';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { useAuth } from '../../context/AuthContext';
import { Users, UserPlus, CheckCircle, XCircle, Shield, Briefcase, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';

export const EmployeeManager: React.FC = () => {
  const { user: currentAdmin, isDeveloper } = useAuth();
  const [employees, setEmployees] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [formSubmitting, setFormSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [employeeToDelete, setEmployeeToDelete] = useState<User | null>(null);

  const [newEmployeeForm, setNewEmployeeForm] = useState({
    username: '',
    password: '',
    role: 'EMPLOYEE' as 'ADMIN' | 'EMPLOYEE' | 'DEVELOPER',
  });

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const data = await api.getEmployees();
      setEmployees(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setFormSubmitting(true);
      setErrorMsg(null);
      await api.createEmployee({
        name: newEmployeeForm.username.trim(),
        username: newEmployeeForm.username.trim(),
        email: `${newEmployeeForm.username.trim().toLowerCase()}@fryfreeze.com`,
        password: newEmployeeForm.password,
        role: newEmployeeForm.role,
      });
      setSuccessMsg(`Account for "${newEmployeeForm.username}" created successfully`);
      setShowAddModal(false);
      setNewEmployeeForm({ username: '', password: '', role: 'EMPLOYEE' });
      await loadEmployees();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create employee');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleActive = async (emp: User) => {
    try {
      setErrorMsg(null);
      const willActivate = !emp.active;
      await api.toggleEmployeeActive(emp.id, willActivate);
      setSuccessMsg(`Employee "${emp.name}" ${willActivate ? 'activated' : 'deactivated'}`);
      await loadEmployees();
    } catch (err: any) {
      setErrorMsg(err.message || 'Action failed');
    }
  };

  const handleDeleteEmployee = async () => {
    if (!employeeToDelete) return;
    try {
      setFormSubmitting(true);
      setErrorMsg(null);
      await api.deleteEmployee(employeeToDelete.id);
      setSuccessMsg(`Staff member "${employeeToDelete.name}" permanently removed`);
      setEmployeeToDelete(null);
      await loadEmployees();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to remove staff member');
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-50 overflow-y-auto md:overflow-hidden">
      {/* Top Header */}
      <div className="p-4 bg-white border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 leading-none">
            Employee & Cashier Management
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Authorize cashiers and inventory staff with granular store access control.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadEmployees}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs"
          >
            <UserPlus className="w-3.5 h-3.5" />
            Add Staff Member
          </button>
        </div>
      </div>

      {/* Messages */}
      {errorMsg && (
        <div className="mx-4 mt-3 p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-800 flex justify-between items-center">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold">✕</button>
        </div>
      )}
      {successMsg && (
        <div className="mx-4 mt-3 p-2.5 bg-emerald-50 border border-emerald-200 rounded text-xs text-emerald-800 flex justify-between items-center">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold">✕</button>
        </div>
      )}

      {/* Employees Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-400">Loading staff records...</div>
        ) : (
          <div className="bg-white rounded border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                  <th className="py-2.5 px-3">Username</th>
                  <th className="py-2.5 px-3 text-center">Role</th>
                  <th className="py-2.5 px-3">Last Login</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {employees.map((emp) => {
                  const isCurrent = emp.id === currentAdmin?.id;
                  return (
                    <tr key={emp.id} className="hover:bg-neutral-50 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-neutral-900 font-mono">
                        {emp.name || emp.email.split('@')[0]} {isCurrent && <span className="text-[10px] text-neutral-400 font-normal font-sans">(You)</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                            emp.role === 'DEVELOPER'
                              ? 'bg-amber-500 text-neutral-950 font-bold border border-amber-600'
                              : emp.role === 'ADMIN'
                              ? 'bg-neutral-900 text-white'
                              : 'bg-neutral-100 text-neutral-800 border border-neutral-200'
                          }`}
                        >
                          {emp.role === 'DEVELOPER' ? <span>⚡</span> : emp.role === 'ADMIN' ? <Shield className="w-2.5 h-2.5" /> : <Briefcase className="w-2.5 h-2.5" />}
                          {emp.role}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-500 font-mono text-[11px]">
                        {formatDateTime(emp.last_login_at)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {emp.active ? (
                          <span className="text-[10px] text-emerald-700 font-semibold inline-flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            ACTIVE
                          </span>
                        ) : (
                          <span className="text-[10px] text-red-600 font-semibold inline-flex items-center gap-1">
                            <XCircle className="w-3 h-3 text-red-600" />
                            DEACTIVATED
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right space-x-1.5">
                        {!isCurrent && (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              onClick={() => handleToggleActive(emp)}
                              className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                                emp.active
                                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              {emp.active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              onClick={() => setEmployeeToDelete(emp)}
                              className="p-1 text-neutral-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors inline-flex cursor-pointer"
                              title="Permanently remove staff member (Admin only)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
          <form onSubmit={handleCreateEmployee} className="bg-white rounded-lg border border-neutral-200 shadow-xl max-w-sm w-full p-5 space-y-4 max-h-[85dvh] overflow-y-auto">
            <div>
              <h3 className="font-semibold text-sm text-neutral-900">Add Staff Member</h3>
              <p className="text-xs text-neutral-500 mt-0.5">Create a login account for a cashier or manager.</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-medium text-neutral-700 block mb-1">Username *</label>
                <input
                  type="text"
                  required
                  value={newEmployeeForm.username}
                  onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, username: e.target.value.replace(/\s+/g, '').toLowerCase() })}
                  placeholder="e.g. cashier1, manager"
                  className="w-full px-2.5 py-1.5 font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
                <span className="text-[10px] text-neutral-400 mt-0.5 block">Used for POS terminal sign-in</span>
              </div>

              <div>
                <label className="font-medium text-neutral-700 block mb-1">Password (min 4 chars) *</label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={newEmployeeForm.password}
                  onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, password: e.target.value })}
                  placeholder="Enter login password"
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-medium text-neutral-700 block mb-1">Role *</label>
                <select
                  value={newEmployeeForm.role}
                  onChange={(e) => setNewEmployeeForm({ ...newEmployeeForm, role: e.target.value as any })}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                >
                  <option value="EMPLOYEE">EMPLOYEE (POS Billing &amp; Inventory Receive)</option>
                  <option value="ADMIN">ADMIN (Full Store Access, Reports &amp; Settings)</option>
                  {isDeveloper && (
                    <option value="DEVELOPER">DEVELOPER (System &amp; API Management)</option>
                  )}
                </select>
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
                disabled={formSubmitting}
                className="px-4 py-1.5 text-xs font-semibold bg-neutral-900 text-white rounded hover:bg-neutral-800 transition-colors"
              >
                {formSubmitting ? 'Creating...' : 'Create Staff Account'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Admin Employee Deletion Confirmation */}
      {employeeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-neutral-200 shadow-xl max-w-sm w-full p-5 space-y-3.5">
            <div className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <h3 className="font-semibold text-sm">Remove User Account</h3>
            </div>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Are you sure you want to permanently delete the login account for <strong className="text-neutral-900">"{employeeToDelete.name}"</strong> ({employeeToDelete.email})?
            </p>
            <div className="text-[11px] text-red-700 bg-red-50 p-2.5 rounded border border-red-200">
              ⚠️ <strong>Admin Action:</strong> This staff member will immediately lose all login access to POS and inventory.
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                disabled={formSubmitting}
                onClick={() => setEmployeeToDelete(null)}
                className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={formSubmitting}
                onClick={handleDeleteEmployee}
                className="px-4 py-1.5 text-xs font-semibold bg-red-600 text-white rounded hover:bg-red-700 transition-colors disabled:opacity-50 cursor-pointer flex items-center gap-1 shadow-xs"
              >
                {formSubmitting ? 'Deleting...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
