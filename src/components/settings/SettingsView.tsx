import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import {
  printTestReceipt,
  getPrinterSettings,
  savePrinterSettings,
  resetPrinterSettingsToDefault,
  syncPrinterSettingsFromServer,
  isThermalPrinterName,
  PrinterCustomizationSettings,
} from '../../lib/printerService';
import { ThermalReceiptContent } from '../billing/ThermalReceiptContent';
import type { User } from '../../types';
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
  CloudDownload,
  ArrowUpCircle,
  Users,
  ShoppingCart,
  Boxes,
  ArrowLeftRight,
  Receipt,
  Banknote,
  Wallet,
  FileBarChart2,
  LayoutDashboard,
  ScrollText,
  UserCheck,
  RotateCcw,
  Sliders,
  Eye,
  EyeOff,
  Type,
} from 'lucide-react';
import type { UpdateStatusData, UpdateProgressData } from '../../electron';

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

  // Printer Hardware & Customization State
  const [printers, setPrinters] = useState<PrinterDevice[]>([]);
  const [loadingPrinters, setLoadingPrinters] = useState<boolean>(false);
  const [testPrinting, setTestPrinting] = useState<boolean>(false);
  const [printerSettings, setPrinterSettings] = useState<PrinterCustomizationSettings>(() => getPrinterSettings());
  const [activePrinterSubTab, setActivePrinterSubTab] = useState<'hardware' | 'header' | 'body' | 'footer'>('hardware');
  const [showLivePreview, setShowLivePreview] = useState<boolean>(true);

  // Database Backup & Restore State
  const [dbStats, setDbStats] = useState<any>(null);
  const [exportingBackup, setExportingBackup] = useState<boolean>(false);
  const [importingBackup, setImportingBackup] = useState<boolean>(false);
  const [selectedBackupFile, setSelectedBackupFile] = useState<File | null>(null);
  const [backupPreview, setBackupPreview] = useState<any>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupSuccess, setBackupSuccess] = useState<string | null>(null);

  // Wireless Updates State
  const [appVersionInfo, setAppVersionInfo] = useState<{ version: string; isPackaged: boolean; feedUrl?: string }>({
    version: '2.1.6',
    isPackaged: false,
  });
  const [updaterStatus, setUpdaterStatus] = useState<UpdateStatusData | null>(null);
  const [updaterProgress, setUpdaterProgress] = useState<UpdateProgressData | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState<boolean>(false);
  const [installingUpdate, setInstallingUpdate] = useState<boolean>(false);

  // Staff Tab Permissions State
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [loadingStaff, setLoadingStaff] = useState<boolean>(false);
  const [selectedStaffId, setSelectedStaffId] = useState<string>('');
  const [staffPermissions, setStaffPermissions] = useState<string[]>([]);
  const [savingPermissions, setSavingPermissions] = useState<boolean>(false);
  const [permissionsFeedback, setPermissionsFeedback] = useState<string | null>(null);

  const configurableTabs = [
    { id: 'billing', label: 'POS Billing', desc: 'Cashier checkout, cart and invoice generation', icon: ShoppingCart },
    { id: 'inventory', label: 'Inventory & BOM', desc: 'Catalog products, recipes and ingredient stock', icon: Boxes },
    { id: 'movements', label: 'Stock Movements', desc: 'Stock in/out, purchase receipts and wastage logs', icon: ArrowLeftRight },
    { id: 'sales', label: 'Sales & Bills History', desc: 'Past sales receipts, reprinting and order history', icon: Receipt },
    { id: 'refunds', label: 'Customer Refunds', desc: 'Item-level return processing, credit note generation and refunds ledger', icon: RotateCcw },
    { id: 'cash_control', label: 'Cash Control (Drawer)', desc: 'Register cash float, counter expenses & shift reconciliation', icon: Banknote },
    { id: 'customers', label: 'Customers & Loyalty', desc: 'Customer directory, visit count, weekly reports & history', icon: UserCheck },
    { id: 'expenses', label: 'Store Expenses', desc: 'Store expenditure ledger and payments management', icon: Wallet },
    { id: 'reports', label: 'Reports & P&L', desc: 'Financial profit & loss, GST reports and business analytics', icon: FileBarChart2 },
    { id: 'dashboard', label: 'Store Dashboard', desc: 'Overview metrics, top items and revenue charts', icon: LayoutDashboard },
    { id: 'audit', label: 'Audit Trail', desc: 'System security audit logs and operations history', icon: ScrollText },
  ];

  const loadStaffList = async () => {
    try {
      setLoadingStaff(true);
      const list = await api.getEmployees();
      const filtered = list.filter((u: User) => u.role !== 'DEVELOPER');
      setStaffUsers(filtered);
      if (filtered.length > 0 && !selectedStaffId) {
        setSelectedStaffId(filtered[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load staff for permissions:', err);
    } finally {
      setLoadingStaff(false);
    }
  };

  useEffect(() => {
    loadStaffList();
  }, []);

  useEffect(() => {
    if (selectedStaffId) {
      api.getEmployeePermissions(selectedStaffId).then((res: any) => {
        setStaffPermissions(res.permissions || ['billing', 'inventory', 'sales', 'movements', 'cash_control']);
      }).catch((err: any) => {
        console.error('Failed to get staff permissions:', err);
      });
    }
  }, [selectedStaffId]);

  const handleToggleTabPermission = async (tabId: string) => {
    if (!selectedStaffId) return;
    const current = new Set(staffPermissions);
    if (current.has(tabId)) {
      current.delete(tabId);
    } else {
      current.add(tabId);
    }
    const updated = Array.from(current);
    setStaffPermissions(updated);

    try {
      setSavingPermissions(true);
      await api.updateEmployeePermissions(selectedStaffId, updated);
      setPermissionsFeedback('Permissions saved successfully');
      setTimeout(() => setPermissionsFeedback(null), 2500);
    } catch (err: any) {
      alert(err.message || 'Failed to update tab permissions');
    } finally {
      setSavingPermissions(false);
    }
  };

  const applyPermissionPreset = async (presetTabs: string[]) => {
    if (!selectedStaffId) return;
    setStaffPermissions(presetTabs);
    try {
      setSavingPermissions(true);
      await api.updateEmployeePermissions(selectedStaffId, presetTabs);
      setPermissionsFeedback('Preset applied successfully');
      setTimeout(() => setPermissionsFeedback(null), 2500);
    } catch (err: any) {
      alert(err.message || 'Failed to apply preset');
    } finally {
      setSavingPermissions(false);
    }
  };

  useEffect(() => {
    if (window.electronAPI?.updater) {
      window.electronAPI.updater.getVersion().then((v) => {
        if (v) setAppVersionInfo(v);
      }).catch(() => {});

      const unsubStatus = window.electronAPI.updater.onStatus((data) => {
        setUpdaterStatus(data);
        setCheckingUpdate(false);
      });

      const unsubProgress = window.electronAPI.updater.onProgress((data) => {
        setUpdaterProgress(data);
      });

      return () => {
        if (unsubStatus) unsubStatus();
        if (unsubProgress) unsubProgress();
      };
    }
  }, []);

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI?.updater?.check) {
      setUpdaterStatus({
        status: 'dev-mode',
        message: 'Wireless updates activate in the desktop application.',
      });
      return;
    }
    setCheckingUpdate(true);
    setUpdaterStatus({ status: 'checking', message: 'Checking Supabase Cloud for new releases...' });
    try {
      const res = await window.electronAPI.updater.check();
      if (!res.success && res.error) {
        setUpdaterStatus({ status: 'error', message: res.error });
      }
    } catch (err: any) {
      setUpdaterStatus({ status: 'error', message: err.message || 'Failed to check updates' });
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleInstallDownloadedUpdate = async () => {
    if (!window.electronAPI?.updater?.install) return;
    setInstallingUpdate(true);
    await window.electronAPI.updater.install();
  };

  // Fetch connected printers
  const loadPrinters = async () => {
    try {
      setLoadingPrinters(true);
      const list = await api.getPrinters();
      setPrinters(list);

      // Auto-detect or select thermal printer as default if not already set
      if (list.length > 0) {
        const currentSaved = getPrinterSettings();
        if (!currentSaved.deviceName) {
          // Look for thermal printer first
          const thermal = list.find((p: any) => isThermalPrinterName(p.name));
          const def = thermal || list.find((p: any) => p.isDefault) || list[0];
          if (def) {
            handlePrinterSettingChange('deviceName', def.name);
          }
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
    syncPrinterSettingsFromServer().then((synced) => {
      setPrinterSettings(synced);
    }).catch(() => {});
    loadPrinters();
    loadDbStats();
  }, []);

  const [savingReceiptSettings, setSavingReceiptSettings] = useState<boolean>(false);
  const [savedReceiptFeedback, setSavedReceiptFeedback] = useState<boolean>(false);

  const handleExplicitSavePrinterSettings = () => {
    setSavingReceiptSettings(true);
    const updated = savePrinterSettings(printerSettings);
    setPrinterSettings(updated);
    setSavedReceiptFeedback(true);
    setFeedback({ type: 'success', text: 'Customized bill settings and thermal printer preferences saved permanently to local database!' });
    setTimeout(() => {
      setSavingReceiptSettings(false);
      setSavedReceiptFeedback(false);
    }, 2500);
  };

  const handlePrinterSettingChange = <K extends keyof PrinterCustomizationSettings>(
    key: K,
    value: PrinterCustomizationSettings[K]
  ) => {
    const updated = savePrinterSettings({ [key]: value });
    setPrinterSettings(updated);
  };

  const handleResetThermalDefaults = () => {
    const res = resetPrinterSettingsToDefault();
    setPrinterSettings(res);
    setFeedback({ type: 'success', text: 'Printer settings reset to default thermal (80mm) configuration.' });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleTestPrint = () => {
    try {
      setTestPrinting(true);
      printTestReceipt(store, printerSettings.deviceName, printerSettings);
      setTimeout(() => setTestPrinting(false), 800);
      setFeedback({ type: 'success', text: `Test receipt sent to ${printerSettings.deviceName || 'System Default'}` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (err: any) {
      setTestPrinting(false);
      setFeedback({ type: 'error', text: 'Printer error: ' + (err.message || 'Could not print test bill') });
    }
  };

  // Sample sale for interactive Live Receipt Preview
  const sampleSale: any = useMemo(() => ({
    id: 'sample-sale-001',
    store_id: store?.id || 'store-01',
    bill_number: 'FF-0042',
    created_at: new Date().toISOString(),
    employee_id: 'emp-1',
    employee_name: user?.name || 'Store Cashier',
    verification_token: 'SAMPLE_TOKEN_a1b2c3d4e5f6',
    status: 'COMPLETED' as const,
    payment_method: 'UPI',
    subtotal: 260,
    discount: 20,
    tax: 12,
    cgst: 6,
    sgst: 6,
    igst: 0,
    gst_type: 'INTRA_STATE' as const,
    tax_mode: 'INCLUSIVE' as const,
    round_off: 0,
    total: 252,
    customer_name: 'Rahul Sharma',
    customer_phone: '9876543210',
    notes: 'Sample live receipt preview',
    items: [
      {
        id: 'sample-item-1',
        sale_id: 'sample-sale-001',
        product_id: 'p1',
        product_name_snapshot: 'Belgian Chocolate Cone',
        sku_snapshot: 'ICE-CHOC-01',
        hsn_snapshot: '21050000',
        barcode_snapshot: '890123456789',
        quantity: 2,
        unit_price: 90,
        purchase_price_snapshot: 50,
        tax_rate: 5,
        tax_amount: 8.57,
        taxable_value: 171.43,
        cgst_amount: 4.29,
        sgst_amount: 4.29,
        igst_amount: 0,
        discount: 0,
        line_total: 180,
        selected_modifiers: [
          { modifierId: 'm1', name: 'Roasted Almonds' } as any
        ],
        created_at: new Date().toISOString(),
      },
      {
        id: 'sample-item-2',
        sale_id: 'sample-sale-001',
        product_id: 'p2',
        product_name_snapshot: 'Vanilla Sundae Cup',
        sku_snapshot: 'ICE-VAN-01',
        hsn_snapshot: '21050000',
        barcode_snapshot: '890123456790',
        quantity: 1,
        unit_price: 80,
        purchase_price_snapshot: 40,
        tax_rate: 5,
        tax_amount: 3.81,
        taxable_value: 76.19,
        cgst_amount: 1.9,
        sgst_amount: 1.9,
        igst_amount: 0,
        discount: 0,
        line_total: 80,
        created_at: new Date().toISOString(),
      },
    ],
  }), [store, user]);

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

        {/* 0. SOFTWARE VERSION & WIRELESS UPDATES SECTION */}
        <div className="bg-white p-6 rounded-lg border border-neutral-200 shadow-xs space-y-4 text-xs">
          <div className="border-b border-neutral-100 pb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CloudDownload className="w-4 h-4 text-blue-600" />
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">
                  Software Updates &amp; System Version
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Wireless automatic updates keep your POS secure without touching local database or sales data.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded-full border border-blue-200">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
              v{appVersionInfo.version} {appVersionInfo.isPackaged ? '(Packaged)' : '(Desktop)'}
            </span>
          </div>

          {/* Status Message */}
          {updaterStatus && (
            <div className={`p-3 rounded-lg border text-xs flex items-start gap-2.5 ${
              updaterStatus.status === 'downloaded'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : updaterStatus.status === 'available' || updaterStatus.status === 'checking'
                ? 'bg-blue-50 border-blue-200 text-blue-800'
                : updaterStatus.status === 'error'
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-neutral-50 border-neutral-200 text-neutral-700'
            }`}>
              {updaterStatus.status === 'downloaded' ? (
                <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : updaterStatus.status === 'available' || updaterStatus.status === 'checking' ? (
                <RefreshCw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 animate-spin" />
              ) : (
                <CloudDownload className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1 space-y-0.5">
                <div className="font-medium">{updaterStatus.message}</div>
                {updaterStatus.version && (
                  <div className="text-[11px] text-neutral-500 font-mono">Available: v{updaterStatus.version}</div>
                )}
              </div>
            </div>
          )}

          {/* Progress Bar (during download) */}
          {updaterProgress && updaterProgress.percent > 0 && updaterProgress.percent < 100 && (
            <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
              <div className="flex justify-between text-[11px] font-mono text-neutral-600">
                <span>Downloading update package...</span>
                <span>
                  {updaterProgress.bytesPerSecond > 0 && `${(updaterProgress.bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s • `}
                  {updaterProgress.percent}% ({(updaterProgress.transferred / (1024 * 1024)).toFixed(1)} / {(updaterProgress.total / (1024 * 1024)).toFixed(1)} MB)
                </span>
              </div>
              <div className="w-full bg-neutral-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-150 ease-out"
                  style={{ width: `${updaterProgress.percent}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Row */}
          <div className="flex justify-between items-center pt-1">
            <span className="text-[11px] text-neutral-500">
              Automatic background check: every 45 minutes + startup
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCheckForUpdates}
                disabled={checkingUpdate}
                className="px-3.5 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                <span>{checkingUpdate ? 'Checking...' : 'Check for Updates'}</span>
              </button>

              {updaterStatus?.status === 'downloaded' && (
                <button
                  type="button"
                  onClick={handleInstallDownloadedUpdate}
                  disabled={installingUpdate}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded font-bold text-xs transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${installingUpdate ? 'animate-spin' : ''}`} />
                  <span>{installingUpdate ? 'Restarting...' : 'Restart & Apply Update'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

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

        {/* 2. FULLY CUSTOMIZABLE THERMAL PRINTER SETTINGS CARD */}
        <div className="bg-white p-6 rounded-lg border border-neutral-200 shadow-xs space-y-5 text-xs">
          <div className="border-b border-neutral-100 pb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-neutral-900 text-white rounded-md">
                <Printer className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">
                  Thermal Receipt & Printer Customization
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Fully configure thermal roll layout, branding, GST details, footer messages, and set default hardware printer.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowLivePreview(!showLivePreview)}
                className="px-2.5 py-1 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-700 rounded text-[11px] font-medium flex items-center gap-1.5 transition-colors"
                title="Toggle live receipt preview"
              >
                {showLivePreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showLivePreview ? 'Hide Preview' : 'Live Preview'}</span>
              </button>

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
          </div>

          {/* Active Summary Ribbon */}
          <div className="bg-neutral-50 p-3 rounded border border-neutral-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-neutral-500">Default Printer:</span>
              <span className="font-semibold text-neutral-900 font-mono bg-white px-2 py-0.5 rounded border border-neutral-200">
                {printerSettings.deviceName || 'System Default'}
              </span>
              {printerSettings.deviceName && isThermalPrinterName(printerSettings.deviceName) && (
                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded font-medium border border-emerald-200">
                  Thermal POS Default
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-neutral-600">
              <span>Paper: <strong className="text-neutral-900">{printerSettings.format === '80mm' ? '80mm Thermal (3")' : printerSettings.format === '58mm' ? '58mm Thermal (2")' : printerSettings.format.toUpperCase()}</strong></span>
              <span>•</span>
              <span>Mode: <strong className="text-neutral-900">{printerSettings.directPrint ? 'Direct Silent' : 'Preview Prompt'}</strong></span>
              <span>•</span>
              <span>Auto-Print: <strong className="text-neutral-900">{printerSettings.autoPrintOnSale ? 'Enabled' : 'Off'}</strong></span>
            </div>
          </div>

          {/* Sub-Tabs Selector */}
          <div className="flex items-center gap-1 border-b border-neutral-200 pb-1">
            {[
              { id: 'hardware', label: 'Hardware & Format', icon: Printer },
              { id: 'header', label: 'Store Header & Branding', icon: Type },
              { id: 'body', label: 'Line Items & Taxes', icon: Sliders },
              { id: 'footer', label: 'Footer, QR & Policy', icon: Receipt },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activePrinterSubTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActivePrinterSubTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-t text-xs font-medium flex items-center gap-1.5 transition-colors border-b-2 -mb-[5px] ${
                    isActive
                      ? 'border-neutral-900 text-neutral-900 bg-neutral-100/60 font-semibold'
                      : 'border-transparent text-neutral-500 hover:text-neutral-800 hover:bg-neutral-50'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Main Grid: Controls + Live Preview */}
          <div className={`grid gap-6 ${showLivePreview ? 'grid-cols-1 lg:grid-cols-12' : 'grid-cols-1'}`}>
            {/* Left Column: Form Controls */}
            <div className={showLivePreview ? 'lg:col-span-7 space-y-4' : 'space-y-4'}>
              {/* TAB 1: HARDWARE & DEFAULT PRINTER */}
              {activePrinterSubTab === 'hardware' && (
                <div className="space-y-4">
                  <div>
                    <label className="font-semibold text-neutral-800 block mb-1">
                      Connected Receipt / Thermal Printer
                    </label>
                    <p className="text-[11px] text-neutral-500 mb-2">
                      Choose your dedicated POS receipt printer. Any detected thermal printer is pre-configured as default.
                    </p>
                    {printers.length === 0 ? (
                      <div className="p-3 bg-neutral-50 border border-neutral-200 rounded text-neutral-500 text-[11px]">
                        {loadingPrinters
                          ? 'Scanning connected system printers...'
                          : 'No external printers found. System default printer will be used.'}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {printers.map((p) => {
                          const isSelected = printerSettings.deviceName === p.name;
                          const isThermal = isThermalPrinterName(p.name);
                          return (
                            <button
                              key={p.name}
                              type="button"
                              onClick={() => handlePrinterSettingChange('deviceName', p.name)}
                              className={`p-2.5 text-left rounded border transition-all flex items-start justify-between ${
                                isSelected
                                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                                  : 'bg-white border-neutral-200 text-neutral-800 hover:border-neutral-400'
                              }`}
                            >
                              <div className="min-w-0 pr-2">
                                <div className="font-semibold truncate text-xs flex items-center gap-1.5">
                                  <span>{p.displayName || p.name}</span>
                                </div>
                                <div className="flex items-center gap-1 mt-1">
                                  {isThermal && (
                                    <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${
                                      isSelected ? 'bg-emerald-950 text-emerald-300' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    }`}>
                                      Thermal
                                    </span>
                                  )}
                                  <span className={`text-[10px] ${isSelected ? 'text-neutral-300' : 'text-neutral-500'}`}>
                                    {p.isDefault ? 'Windows Default' : (p.portName ? `Port: ${p.portName}` : 'Ready')}
                                  </span>
                                </div>
                              </div>
                              {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div>
                      <label className="font-medium text-neutral-700 block mb-1">
                        Thermal Paper Roll Width
                      </label>
                      <select
                        value={printerSettings.format}
                        onChange={(e) => handlePrinterSettingChange('format', e.target.value as any)}
                        className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs font-medium"
                      >
                        <option value="80mm">80mm Thermal Roll (Standard 3" - Default)</option>
                        <option value="58mm">58mm Thermal Roll (Compact 2")</option>
                        <option value="free">Auto Free-Size (Auto-Fit Roll)</option>
                        <option value="a4">A4 Full Sheet (Office Printer)</option>
                      </select>
                      <span className="text-[10.5px] text-neutral-500 block mt-0.5">
                        80mm is standard for point-of-sale thermal printers.
                      </span>
                    </div>

                    <div>
                      <label className="font-medium text-neutral-700 block mb-1">
                        Receipt Typography Density
                      </label>
                      <select
                        value={printerSettings.density}
                        onChange={(e) => handlePrinterSettingChange('density', e.target.value as any)}
                        className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs font-medium"
                      >
                        <option value="compact">Compact (Small font, saves roll paper)</option>
                        <option value="normal">Standard Normal (Balanced - Default)</option>
                        <option value="large">Large (High legibility / bold)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-neutral-100">
                    <div>
                      <label className="font-medium text-neutral-700 block mb-1">Receipt Copies</label>
                      <select
                        value={printerSettings.copies}
                        onChange={(e) => handlePrinterSettingChange('copies', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs"
                      >
                        <option value={1}>1 Copy (Customer Receipt)</option>
                        <option value={2}>2 Copies (Customer + Store Duplicate)</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-medium text-neutral-700 block mb-1">Paper Tear-Off Feed Lines</label>
                      <select
                        value={printerSettings.feedLines}
                        onChange={(e) => handlePrinterSettingChange('feedLines', Number(e.target.value))}
                        className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs"
                      >
                        <option value={1}>1 Blank Line</option>
                        <option value={2}>2 Blank Lines (Default)</option>
                        <option value={3}>3 Blank Lines</option>
                        <option value={4}>4 Blank Lines (Long tear bar)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-neutral-100">
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={printerSettings.directPrint}
                        onChange={(e) => handlePrinterSettingChange('directPrint', e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                      />
                      <div>
                        <span className="font-semibold text-neutral-800 block">Direct Silent Printing (Fast POS Mode - Default)</span>
                        <span className="text-[11px] text-neutral-500">
                          Bypasses the operating system print dialog and spools directly to hardware on checkout.
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={printerSettings.autoPrintOnSale}
                        onChange={(e) => handlePrinterSettingChange('autoPrintOnSale', e.target.checked)}
                        className="w-4 h-4 mt-0.5 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                      />
                      <div>
                        <span className="font-semibold text-neutral-800 block">Auto-Print upon Bill Completion</span>
                        <span className="text-[11px] text-neutral-500">
                          Automatically fires the print job the instant a sale is registered by the cashier.
                        </span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* TAB 2: STORE HEADER & BRANDING */}
              {activePrinterSubTab === 'header' && (
                <div className="space-y-3">
                  <div>
                    <label className="font-semibold text-neutral-800 block mb-1">
                      Receipt Store Name Override
                    </label>
                    <input
                      type="text"
                      placeholder={`Default: ${store?.name || 'FryFreeze'}`}
                      value={printerSettings.headerStoreNameOverride}
                      onChange={(e) => handlePrinterSettingChange('headerStoreNameOverride', e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs"
                    />
                    <span className="text-[10.5px] text-neutral-500 block mt-0.5">
                      Leave blank to use official business name, or enter custom branch/counter name.
                    </span>
                  </div>

                  <div>
                    <label className="font-semibold text-neutral-800 block mb-1">
                      Header Tagline / Slogan
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Delicious Treats & Fresh Bakes"
                      value={printerSettings.headerTagline}
                      onChange={(e) => handlePrinterSettingChange('headerTagline', e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs"
                    />
                  </div>

                  <div className="space-y-2 pt-2 border-t border-neutral-100">
                    <span className="font-semibold text-neutral-800 block text-xs">Show / Hide Store Info:</span>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showStoreAddress}
                          onChange={(e) => handlePrinterSettingChange('showStoreAddress', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Store Address</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showPhone}
                          onChange={(e) => handlePrinterSettingChange('showPhone', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Phone Number</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showEmail}
                          onChange={(e) => handlePrinterSettingChange('showEmail', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Email Address</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showGstin}
                          onChange={(e) => handlePrinterSettingChange('showGstin', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Store GSTIN</span>
                      </label>
                    </div>

                    <div className="pt-2 border-t border-dashed border-neutral-200">
                      <label className="flex items-center gap-2 cursor-pointer select-none mb-1.5">
                        <input
                          type="checkbox"
                          checked={printerSettings.showFssai}
                          onChange={(e) => handlePrinterSettingChange('showFssai', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="font-semibold text-neutral-800">Print FSSAI Food License Number</span>
                      </label>

                      {printerSettings.showFssai && (
                        <div className="pl-6">
                          <input
                            type="text"
                            placeholder="e.g. 12423008000123"
                            value={printerSettings.fssaiNumber}
                            onChange={(e) => handlePrinterSettingChange('fssaiNumber', e.target.value)}
                            className="w-full px-2.5 py-1 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs font-mono"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 3: LINE ITEMS & TAXES */}
              {activePrinterSubTab === 'body' && (
                <div className="space-y-3">
                  <div>
                    <label className="font-semibold text-neutral-800 block mb-1">
                      Receipt Document Title Mode
                    </label>
                    <select
                      value={printerSettings.docTitleMode}
                      onChange={(e) => handlePrinterSettingChange('docTitleMode', e.target.value as any)}
                      className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs font-medium"
                    >
                      <option value="AUTO">Automatic (Cash Bill for cash, Retail Bill for card/UPI, Bill of Supply for Exempt)</option>
                      <option value="BILL">Retail Bill (Standard POS)</option>
                      <option value="INVOICE">Tax Invoice (Formal / B2B)</option>
                      <option value="CASH_MEMO">Cash Memo</option>
                    </select>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-neutral-100">
                    <span className="font-semibold text-neutral-800 block text-xs">Receipt Meta Details:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showDateTime}
                          onChange={(e) => handlePrinterSettingChange('showDateTime', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Date & Time</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showCashierName}
                          onChange={(e) => handlePrinterSettingChange('showCashierName', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Cashier / Staff Name</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showCustomerDetails}
                          onChange={(e) => handlePrinterSettingChange('showCustomerDetails', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Customer Mobile & Name</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showPaymentMethod}
                          onChange={(e) => handlePrinterSettingChange('showPaymentMethod', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Payment Mode & Status</span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-neutral-100">
                    <span className="font-semibold text-neutral-800 block text-xs">Item Rows & Taxes:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showItemIndex}
                          onChange={(e) => handlePrinterSettingChange('showItemIndex', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Serial Numbers (1., 2.)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showHsn}
                          onChange={(e) => handlePrinterSettingChange('showHsn', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">HSN Code per Item</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showTaxRatePerItem}
                          onChange={(e) => handlePrinterSettingChange('showTaxRatePerItem', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">GST % per Item</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showModifiers}
                          onChange={(e) => handlePrinterSettingChange('showModifiers', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Modifiers / Toppings</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showGstBreakdown}
                          onChange={(e) => handlePrinterSettingChange('showGstBreakdown', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">GST Breakdown (CGST/SGST)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showDiscountLine}
                          onChange={(e) => handlePrinterSettingChange('showDiscountLine', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Discount Line</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showRoundOff}
                          onChange={(e) => handlePrinterSettingChange('showRoundOff', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Round-Off Adjustment</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 4: FOOTER, QR & POLICY */}
              {activePrinterSubTab === 'footer' && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <span className="font-semibold text-neutral-800 block text-xs">Authenticity QR Code:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showVerificationQr}
                          onChange={(e) => handlePrinterSettingChange('showVerificationQr', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Print Bill Verification QR</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={printerSettings.showVerificationToken}
                          onChange={(e) => handlePrinterSettingChange('showVerificationToken', e.target.checked)}
                          className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-0"
                        />
                        <span className="text-neutral-700">Print Token Hash</span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-neutral-100">
                    <label className="font-semibold text-neutral-800 block mb-1">
                      Primary Footer Message
                    </label>
                    <input
                      type="text"
                      placeholder="*** THANK YOU! VISIT AGAIN ***"
                      value={printerSettings.footerPrimaryMessage}
                      onChange={(e) => handlePrinterSettingChange('footerPrimaryMessage', e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs font-medium"
                    />
                  </div>

                  <div className="pt-2 border-t border-neutral-100">
                    <label className="font-semibold text-neutral-800 block mb-1">
                      Secondary Footer Note / Return Policy
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Goods once sold cannot be returned. Follow us on Instagram: @storename"
                      value={printerSettings.footerSecondaryNote}
                      onChange={(e) => handlePrinterSettingChange('footerSecondaryNote', e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-neutral-300 rounded focus:border-neutral-900 focus:outline-none bg-white text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Live Interactive Thermal Receipt Preview */}
            {showLivePreview && (
              <div className="lg:col-span-5 flex flex-col items-center">
                <div className="w-full max-w-[320px] bg-neutral-100 p-3 rounded-lg border border-neutral-300 shadow-inner space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-neutral-600 font-mono pb-1 border-b border-neutral-200">
                    <span className="font-semibold flex items-center gap-1">
                      <Receipt className="w-3.5 h-3.5 text-neutral-700" />
                      Live Thermal Roll
                    </span>
                    <span className="bg-white px-1.5 py-0.5 rounded border border-neutral-200 text-[10px]">
                      {printerSettings.format === '58mm' ? '58mm (2")' : '80mm (3")'}
                    </span>
                  </div>

                  {/* Serrated Paper Preview Container */}
                  <div className="bg-white p-3 rounded shadow-md border border-neutral-200 overflow-hidden font-mono">
                    <ThermalReceiptContent
                      sale={sampleSale}
                      store={store}
                      settings={printerSettings}
                    />
                  </div>

                  <div className="text-center text-[10px] text-neutral-400 font-mono pt-1">
                    Preview updates live with your customizations
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-100">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleResetThermalDefaults}
                className="px-3 py-1.5 bg-white border border-neutral-300 hover:bg-neutral-50 text-neutral-700 rounded text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Reset all settings to clean 80mm thermal receipt defaults"
              >
                <RotateCcw className="w-3.5 h-3.5 text-neutral-500" />
                Reset to Thermal Defaults
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExplicitSavePrinterSettings}
                disabled={savingReceiptSettings}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                title="Persist customized bill settings permanently to local database"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{savedReceiptFeedback ? 'Customized Bill Saved!' : 'Save Bill Customization'}</span>
              </button>

              <button
                type="button"
                onClick={handleTestPrint}
                disabled={testPrinting}
                className="px-4 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-neutral-300" />
                {testPrinting ? 'Sending to Hardware...' : 'Print Test Receipt'}
              </button>
            </div>
          </div>
        </div>

        {/* STAFF TAB ACCESS & PERMISSIONS CARD */}
        <div className="bg-white p-6 rounded-lg border border-neutral-200 shadow-xs space-y-4 text-xs">
          <div className="border-b border-neutral-100 pb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-neutral-100 text-neutral-800 rounded">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-neutral-900 text-sm">
                  Staff Navigation &amp; Tab Access Permissions
                </h3>
                <p className="text-[11px] text-neutral-500">
                  Select an employee and click toggle switches to grant or revoke access to individual app tabs.
                </p>
              </div>
            </div>

            {permissionsFeedback && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 text-[11px] font-semibold rounded-full border border-emerald-200">
                <Check className="w-3.5 h-3.5 text-emerald-600" />
                {permissionsFeedback}
              </span>
            )}
          </div>

          {loadingStaff ? (
            <div className="py-6 text-center text-neutral-400 font-mono text-xs">
              Loading staff accounts...
            </div>
          ) : staffUsers.length === 0 ? (
            <div className="py-6 text-center text-neutral-400 font-mono text-xs">
              No staff/employee accounts found. Create employees in the Staff Accounts tab.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Employee Selector Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-neutral-50 p-3 rounded-lg border border-neutral-200">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-neutral-700 text-xs">Configure Access For:</span>
                  <select
                    value={selectedStaffId}
                    onChange={(e) => setSelectedStaffId(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-neutral-300 rounded-md font-semibold text-xs text-neutral-900 focus:border-neutral-900 focus:outline-none shadow-2xs"
                  >
                    {staffUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.role}) — {u.email}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Quick Presets */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10.5px] text-neutral-400 font-mono uppercase">Quick Presets:</span>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset(['billing', 'cash_control', 'sales', 'refunds', 'customers'])}
                    className="px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-700 rounded border border-neutral-200 text-[11px] font-medium transition-colors"
                  >
                    Cashier Terminal
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset(['inventory', 'movements'])}
                    className="px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-700 rounded border border-neutral-200 text-[11px] font-medium transition-colors"
                  >
                    Stock Incharge
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset(['billing', 'inventory', 'movements', 'sales', 'refunds', 'cash_control', 'expenses', 'customers', 'reports', 'dashboard'])}
                    className="px-2 py-1 bg-white hover:bg-neutral-100 text-neutral-700 rounded border border-neutral-200 text-[11px] font-medium transition-colors"
                  >
                    Store Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPermissionPreset(configurableTabs.map(t => t.id))}
                    className="px-2 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded text-[11px] font-semibold transition-colors shadow-2xs"
                  >
                    Grant All Tabs
                  </button>
                </div>
              </div>

              {/* Tab Toggles Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {configurableTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isEnabled = staffPermissions.includes(tab.id);
                  return (
                    <div
                      key={tab.id}
                      onClick={() => handleToggleTabPermission(tab.id)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer select-none flex items-center justify-between gap-3 ${
                        isEnabled
                          ? 'bg-emerald-50/50 border-emerald-300 shadow-2xs'
                          : 'bg-white border-neutral-200 opacity-70 hover:opacity-100 hover:border-neutral-300'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className={`p-2 rounded-md shrink-0 mt-0.5 ${isEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-100 text-neutral-500'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-xs text-neutral-900 flex items-center gap-1.5">
                            <span className="truncate">{tab.label}</span>
                            {isEnabled && (
                              <span className="text-[10px] font-mono text-emerald-700 font-normal">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-[10.5px] text-neutral-500 line-clamp-1 mt-0.5">
                            {tab.desc}
                          </p>
                        </div>
                      </div>

                      {/* Animated Toggle Switch */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTabPermission(tab.id);
                        }}
                        className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors duration-200 shrink-0 ${
                          isEnabled ? 'bg-emerald-600' : 'bg-neutral-300'
                        }`}
                        title={isEnabled ? 'Click to revoke tab access' : 'Click to grant tab access'}
                      >
                        <div
                          className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
                            isEnabled ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 flex items-center justify-between text-[11px] text-neutral-600">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    When <strong>{staffUsers.find(u => u.id === selectedStaffId)?.name || 'this employee'}</strong> logs in, only their enabled tabs will appear in the navigation bar and sidebar. Unauthorized tabs are strictly blocked.
                  </span>
                </div>
                {savingPermissions && (
                  <span className="text-neutral-500 font-mono text-[10px] flex items-center gap-1">
                    <RefreshCw className="w-3 h-3 animate-spin" /> Saving...
                  </span>
                )}
              </div>
            </div>
          )}
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
