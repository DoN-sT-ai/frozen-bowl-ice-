import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { printTestReceipt } from '../../lib/printerService';
import {
  Settings,
  Save,
  CheckCircle,
  AlertCircle,
  Printer,
  RefreshCw,
  Check,
  Database,
  Download,
  Upload,
  HardDrive,
  FileJson,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

interface PrinterDevice {
  name: string;
  displayName?: string;
  isDefault?: boolean;
  status?: number;
  portName?: string;
}

export const SettingsView: React.FC = () => {
  const { store, user, refreshSession } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Store Profile Form State
  const [formData, setFormData] = useState({
    name: store?.name || '',
    address: store?.address || '',
    phone: store?.phone || '',
    email: store?.email || '',
    gstin: store?.gstin || '',
    invoicePrefix: store?.invoice_prefix || '',
  });

  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Printer Hardware State
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState<boolean>(false);
  const [selectedPrinter, setSelectedPrinter] = useState<string>(() => localStorage.getItem('ledger_default_printer') || '');
  const [printerFormat, setPrinterFormat] = useState<string>(() => localStorage.getItem('ledger_printer_format') || '80mm');
  const [directPrint, setDirectPrint] = useState<boolean>(() => localStorage.getItem('ledger_direct_print') === 'true');
  const [testPrinting, setTestPrinting] = useState<boolean>(false);

  // Database Backup & Restore State
  const [dbStats, setDbStats] = useState<any>(null);
  const [exportingBackup, setExportingBackup] = useState<boolean>(false);
  const [importingBackup, setImportingBackup] = useState<boolean>(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [backupPreview, setBackupPreview] = useState<any>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);

  // Fetch connected printers
  const loadPrinters = async () => {
    try {
      setLoadingPrinters(true);
      const list = await api.getPrinters();
      setPrinters(list);
      if (!selectedPrinter && list.length > 0) {
        const def = list.find((p: any) => p.isDefault) || list[0];
        if (def) {
          setSelectedPrinter(def.name);
          localStorage.setItem('ledger_default_printer', def.name);
        }
      }
    } catch (_) {
      // Ignored
    } finally {
      setLoadingPrinters(false);
    }
  };

  // Fetch database stats
  const loadDbStats = async () => {
    try {
      const stats = await api.getDbStats();
      setDbStats(stats);
    } catch (_) {}
  };

  useEffect(() => {
    loadPrinters();
    loadDbStats();
  }, []);

  const handlePrinterSelect = (printerName: string) => {
    setSelectedPrinter(printerName);
    localStorage.setItem('ledger_default_printer', printerName);
  };

  const handleFormatChange = (fmt: string) => {
    setPrinterFormat(fmt);
    localStorage.setItem('ledger_printer_format', fmt);
  };

  const handleDirectPrintToggle = (enabled: boolean) => {
    setDirectPrint(enabled);
    localStorage.setItem('ledger_direct_print', enabled ? 'true' : 'false');
  };

  const handleTestPrint = () => {
    try {
      setTestPrinting(true);
      printTestReceipt(store, selectedPrinter);
      setTimeout(() => setTestPrinting(false), 800);
    } catch (err: any) {
      setTestPrinting(false);
      setFeedback({ type: 'error', text: 'Printer error: ' + (err.message || 'Could not print test bill') });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setFeedback(null);
      await api.updateSettings(formData);
      await refreshSession();
      setFeedback({ type: 'success', text: 'Store settings updated and saved permanently to local database' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to update store settings' });
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // BACKUP EXPORT HANDLER
  // ==========================================
  const handleExportBackup = async () => {
    try {
      setExportingBackup(true);
      setBackupError(null);
      setBackupSuccess(null);

      const backupData = await api.exportBackup();
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `ledgerstore-backup-${store?.code || 'store'}-${dateStr}.json`;

      const jsonStr = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const recordCount = backupData?.stats?.total_records || 'All';
      setBackupSuccess(`Backup exported successfully! File: ${filename} (${recordCount} records saved).`);
      loadDbStats();
    } catch (err: any) {
      setBackupError(err.message || 'Failed to export database backup');
    } finally {
      setExportingBackup(false);
    }
  };

  // ==========================================
  // BACKUP FILE SELECTION & PREVIEW
  // ==========================================
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setBackupError(null);
    setBackupSuccess(null);
    setBackupPreview(null);

    if (!file) {
      setSelectedBackupFile(null);
      return;
    }

    if (!file.name.endsWith('.json')) {
      setBackupError('Please select a valid .json LedgerStore backup file.');
      setSelectedBackupFile(null);
      return;
    }

    setSelectedBackupFile(file);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);

        const data = parsed.data || parsed;
        if (!data.stores || !Array.isArray(data.stores) || data.stores.length === 0) {
          throw new Error('Invalid file structure: no store profile found.');
        }

        const counts = {
          stores: (data.stores || []).length,
          users: (data.users || []).length,
          categories: (data.categories || []).length,
          products: (data.products || []).length,
          sales: (data.sales || []).length,
          sale_items: (data.sale_items || []).length,
          stock_movements: (data.stock_movements || []).length,
          expenses: (data.expenses || []).length,
        };

        const total = Object.values(counts).reduce((a, b) => a + b, 0);

        setBackupPreview({
          version: parsed.version || '1.0',
          exportedAt: parsed.exported_at || file.lastModified ? new Date(file.lastModified).toISOString() : 'Unknown',
          storeName: data.stores[0]?.name || 'Store',
          counts,
          total,
          raw: parsed,
        });
      } catch (err: any) {
        setBackupError('Invalid backup file: ' + (err.message || 'JSON parse error'));
        setSelectedBackupFile(null);
        setBackupPreview(null);
      }
    };
    reader.onerror = () => {
      setBackupError('Failed to read the selected file');
      setSelectedBackupFile(null);
    };
    reader.readAsText(file);
  };

  // ==========================================
  // BACKUP IMPORT / RESTORE HANDLER
  // ==========================================
  const handleImportBackup = async () => {
    if (!backupPreview || !backupPreview.raw) {
      setBackupError('Please select a valid backup file first.');
      return;
    }

    const confirmed = window.confirm(
      `⚠️ WARNING: Restoring this backup will replace current database records with:\n\n` +
      `• Store: ${backupPreview.storeName}\n` +
      `• Products: ${backupPreview.counts.products}\n` +
      `• Sales: ${backupPreview.counts.sales}\n` +
      `• Total Records: ${backupPreview.total}\n\n` +
      `An atomic transaction guarantees clean rollback if any error occurs.\n\n` +
      `Do you want to proceed with restore?`
    );

    if (!confirmed) return;

    try {
      setImportingBackup(true);
      setBackupError(null);
      setBackupSuccess(null);

      const res = await api.importBackup(backupPreview.raw);

      await refreshSession();
      await loadDbStats();

      setBackupSuccess(
        `✓ Database restored successfully! (${res.counts?.products || 0} products, ${res.counts?.sales || 0} sales, ${res.counts?.stock_movements || 0} stock entries loaded)`
      );
      setSelectedBackupFile(null);
      setBackupPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setBackupError(err.message || 'Failed to restore database from backup');
    } finally {
      setImportingBackup(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-50 overflow-y-auto">
      {/* Header */}
      <div className="p-4 bg-white border-b border-neutral-200 shrink-0">
        <h1 className="text-base font-semibold text-neutral-900 leading-none flex items-center gap-2">
          <Settings className="w-4 h-4 text-neutral-700" />
          Settings & Configuration
        </h1>
        <p className="text-xs text-neutral-500 mt-1">
          Manage business profile, thermal receipt printing, and local database backup & restore.
        </p>
      </div>

      <div className="p-4 max-w-3xl w-full mx-auto space-y-5">
        {feedback && (
          <div
            className={`p-3 rounded text-xs flex justify-between items-center ${
              feedback.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{feedback.text}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="font-bold hover:opacity-75">✕</button>
          </div>
        )}

        {/* 1. DATABASE BACKUP & RESTORE SECTION */}
        <div className="bg-white p-6 rounded-lg border border-neutral-200 shadow-xs space-y-4 text-xs">
          <div className="border-b border-neutral-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-indigo-600" />
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">
                  Database Backup & Restore
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Export complete snapshots or restore store data with zero formatting errors.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-full border border-emerald-200">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              SQLite Local (Active)
            </span>
          </div>

          {/* Database Statistics Card */}
          <div className="p-3 bg-neutral-50 rounded border border-neutral-200 grid grid-cols-2 md:grid-cols-4 gap-3 text-[11px]">
            <div>
              <span className="text-neutral-500 block">Database Engine:</span>
              <span className="font-medium text-neutral-900 font-mono">SQLite (node:sqlite)</span>
            </div>
            <div>
              <span className="text-neutral-500 block">Catalog Products:</span>
              <span className="font-bold text-neutral-900 font-mono">{dbStats?.counts?.products ?? '...'} items</span>
            </div>
            <div>
              <span className="text-neutral-500 block">Saved Sales & Bills:</span>
              <span className="font-bold text-neutral-900 font-mono">{dbStats?.counts?.sales ?? '...'} bills</span>
            </div>
            <div>
              <span className="text-neutral-500 block">File Size:</span>
              <span className="font-medium text-neutral-900 font-mono">
                {dbStats?.fileSizeBytes ? `${Math.round(dbStats.fileSizeBytes / 1024)} KB` : 'Active'}
              </span>
            </div>
          </div>

          {/* Backup Action Status Banners */}
          {backupSuccess && (
            <div className="p-3 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span className="flex-1">{backupSuccess}</span>
              <button onClick={() => setBackupSuccess(null)} className="font-bold">✕</button>
            </div>
          )}

          {backupError && (
            <div className="p-3 bg-red-50 text-red-800 border border-red-200 rounded text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span className="flex-1">{backupError}</span>
              <button onClick={() => setBackupError(null)} className="font-bold">✕</button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
            {/* EXPORT BACKUP CARD */}
            <div className="p-4 bg-neutral-50/60 rounded border border-neutral-200 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 font-bold text-neutral-900 text-xs mb-1">
                  <Download className="w-3.5 h-3.5 text-indigo-600" />
                  Backup Store Data (Export)
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  Downloads a complete snapshot of your store products, sales history, customer orders, stock movements, and settings as a standard JSON file.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={handleExportBackup}
                  disabled={exportingBackup}
                  className="w-full py-2 px-3 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 shadow-xs disabled:opacity-50"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  {exportingBackup ? 'Generating Backup...' : 'Download Backup (.json)'}
                </button>

                <a
                  href="/api/backup/download-db"
                  className="w-full py-1.5 px-3 bg-white border border-neutral-300 text-neutral-700 rounded text-[11px] font-medium hover:bg-neutral-50 transition-colors flex items-center justify-center gap-1.5"
                  download
                >
                  <HardDrive className="w-3 h-3 text-neutral-500" />
                  Download Direct SQLite (.db) File
                </a>
              </div>
            </div>

            {/* IMPORT / RESTORE BACKUP CARD */}
            <div className="p-4 bg-neutral-50/60 rounded border border-neutral-200 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2 font-bold text-neutral-900 text-xs mb-1">
                  <Upload className="w-3.5 h-3.5 text-emerald-600" />
                  Restore Store Data (Import)
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  Re-insert an exported backup file directly into the local SQLite database. Symmetrical format ensures zero errors or field mismatches.
                </p>
              </div>

              <div className="space-y-2 pt-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json,application/json"
                  onChange={handleFileChange}
                  className="hidden"
                  id="backup-file-upload"
                />

                <label
                  htmlFor="backup-file-upload"
                  className="w-full py-2 px-3 bg-white border border-dashed border-neutral-400 rounded text-xs font-medium text-neutral-700 hover:border-neutral-900 hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-neutral-500" />
                  {selectedBackupFile ? selectedBackupFile.name : 'Choose Backup File (.json)'}
                </label>

                {backupPreview && (
                  <div className="p-2.5 bg-indigo-50/70 border border-indigo-200 rounded text-[11px] space-y-1">
                    <div className="font-semibold text-indigo-950 flex items-center justify-between">
                      <span>Store: {backupPreview.storeName}</span>
                      <span className="font-mono text-[10px] text-indigo-700">v{backupPreview.version}</span>
                    </div>
                    <div className="text-neutral-600 text-[10.5px]">
                      Contains: <strong>{backupPreview.counts.products}</strong> products, <strong>{backupPreview.counts.sales}</strong> sales, <strong>{backupPreview.counts.stock_movements}</strong> inventory records.
                    </div>
                    <button
                      type="button"
                      onClick={handleImportBackup}
                      disabled={importingBackup}
                      className="w-full mt-2 py-1.5 px-3 bg-emerald-600 text-white rounded text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {importingBackup ? 'Restoring Database...' : 'Confirm & Restore to Database'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="pt-2 text-[11px] text-neutral-500 flex items-center gap-1.5 border-t border-neutral-100">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>
              <strong>Safe Transactions:</strong> All imports execute inside atomic SQLite rollback transactions. If any record fails, changes automatically cancel so existing data is never corrupted.
            </span>
          </div>
        </div>

        {/* 2. HARDWARE & THERMAL PRINTER SETTINGS CARD */}
        <div className="bg-white p-6 rounded-lg border border-neutral-200 shadow-xs space-y-4 text-xs">
          <div className="border-b border-neutral-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-neutral-700" />
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">
                  Hardware & Thermal Printer Configuration
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Select your thermal receipt printer and enable direct silent printing on bill completion.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadPrinters}
              disabled={loadingPrinters}
              className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors"
              title="Rescan connected USB and network printers"
            >
              <RefreshCw className={`w-3 h-3 ${loadingPrinters ? 'animate-spin' : ''}`} />
              Scan Printers
            </button>
          </div>

          <div className="space-y-4">
            {/* Default Printer Selector */}
            <div>
              <label className="font-medium text-neutral-700 block mb-1">
                Connected Receipt / Thermal Printer
              </label>
              {printers.length === 0 ? (
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-neutral-500 text-[11px]">
                  {loadingPrinters
                    ? 'Scanning connected system printers...'
                    : 'No external thermal printers found. System default printer will be used.'}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {printers.map((p) => {
                    const isSelected = selectedPrinter === p.name;
                    return (
                      <button
                        key={p.name}
                        type="button"
                        onClick={() => handlePrinterSelect(p.name)}
                        className={`p-2.5 text-left rounded border transition-all flex items-start justify-between ${
                          isSelected
                            ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                            : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400'
                        }`}
                      >
                        <div className="min-w-0 pr-2">
                          <div className="font-semibold truncate text-xs">{p.displayName || p.name}</div>
                          <div className={`text-[10px] ${isSelected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                            {p.isDefault ? 'Windows Default Printer' : (p.portName ? `Port: ${p.portName}` : 'Ready')}
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Paper Roll Format */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="font-medium text-neutral-700 block mb-1">Thermal Paper Roll Width</label>
                <select
                  value={printerFormat}
                  onChange={(e) => handleFormatChange(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs"
                >
                  <option value="80mm">80mm Thermal Roll (Standard Retail POS)</option>
                  <option value="58mm">58mm Thermal Roll (Compact Handheld)</option>
                  <option value="free">Auto Free-Size (Expands to Roll)</option>
                  <option value="a4">A4 Full Sheet (Office Printer)</option>
                </select>
              </div>

              <div>
                <label className="font-medium text-neutral-700 block mb-1">Direct Silent Printing</label>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="directPrintToggle"
                    checked={directPrint}
                    onChange={(e) => handleDirectPrintToggle(e.target.checked)}
                    className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0 cursor-pointer"
                  />
                  <label htmlFor="directPrintToggle" className="text-neutral-700 font-medium cursor-pointer text-xs select-none">
                    Skip Preview Dialog (Print Directly)
                  </label>
                </div>
                <span className="text-[10.5px] text-neutral-500 block mt-0.5">
                  Sends print job immediately to the thermal roll when you press Enter in POS.
                </span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-neutral-100">
              <span className="text-[11px] text-neutral-500">
                Selected: <strong className="text-neutral-800">{selectedPrinter || 'System Default'}</strong> ({printerFormat})
              </span>
              <button
                type="button"
                onClick={handleTestPrint}
                disabled={testPrinting}
                className="px-3 py-1.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded font-semibold text-xs transition-colors flex items-center gap-1.5"
              >
                <Printer className="w-3.5 h-3.5 text-neutral-600" />
                {testPrinting ? 'Printing Test...' : 'Print Test Receipt'}
              </button>
            </div>
          </div>
        </div>

        {/* 3. BUSINESS PROFILE & INVOICING CARD */}
        <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg border border-neutral-200 shadow-xs space-y-4 text-xs">
          <div className="space-y-3">
            <h3 className="font-bold text-neutral-900 text-sm border-b border-neutral-100 pb-2">
              Business Profile
            </h3>

            <div>
              <label className="font-medium text-neutral-700 block mb-1">Business / Store Name *</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
              />
            </div>

            <div>
              <label className="font-medium text-neutral-700 block mb-1">Physical Store Address</label>
              <textarea
                rows={3}
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full p-2 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-neutral-700 block mb-1">Official Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-medium text-neutral-700 block mb-1">Official Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-3 border-t border-neutral-100">
            <h3 className="font-bold text-neutral-900 text-sm border-b border-neutral-100 pb-2">
              Tax & Invoicing
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="font-medium text-neutral-700 block mb-1">GSTIN Number</label>
                <input
                  type="text"
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                  placeholder="e.g. 29ABCDE1234F1Z5"
                  className="w-full px-2.5 py-1.5 font-mono border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
              </div>
              <div>
                <label className="font-medium text-neutral-700 block mb-1">Bill Prefix Code</label>
                <input
                  type="text"
                  value={formData.invoicePrefix}
                  onChange={(e) => setFormData({ ...formData, invoicePrefix: e.target.value })}
                  placeholder="e.g. BILL"
                  className="w-full px-2.5 py-1.5 font-mono uppercase border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-3 bg-neutral-50 rounded border border-neutral-200 space-y-1 text-[11px] text-neutral-600">
              <div className="flex justify-between">
                <span>Default Currency:</span>
                <span className="font-mono font-semibold text-neutral-800">INR (₹ Indian Rupee)</span>
              </div>
              <div className="flex justify-between">
                <span>Timezone:</span>
                <span className="font-mono font-semibold text-neutral-800">Asia/Kolkata (IST)</span>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 bg-neutral-900 text-white rounded text-xs font-semibold hover:bg-neutral-800 transition-colors flex items-center gap-1.5 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Saving Changes...' : 'Save Store Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
