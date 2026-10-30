import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { LoginPage } from './components/auth/LoginPage';
import { POSWorkspace } from './components/billing/POSWorkspace';
import { BillHistory } from './components/billing/BillHistory';
import { InventoryManager } from './components/inventory/InventoryManager';
import { StockMovementsList } from './components/inventory/StockMovementsList';
import { AdminDashboard } from './components/dashboard/AdminDashboard';
import { EmployeeManager } from './components/employees/EmployeeManager';
import { ExpenseManager } from './components/expenses/ExpenseManager';
import { ReportsView } from './components/reports/ReportsView';
import { AuditLogsView } from './components/audit/AuditLogsView';
import { SettingsView } from './components/settings/SettingsView';
import { DeveloperConsole } from './components/developer/DeveloperConsole';
import { PublicVerificationPage } from './components/verify/PublicVerificationPage';
import { X, Shield, Settings, Wallet, FileBarChart2, Users, ScrollText, Code } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { user, loading, isAdmin, isDeveloper, quickLogin } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('billing');
  const [showPublicVerify, setShowPublicVerify] = useState<boolean>(false);
  const [verifyToken, setVerifyToken] = useState<string>('');
  const [showMobileMore, setShowMobileMore] = useState<boolean>(false);

  // Check query parameter for ?verify=TOKEN on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('verify');
    if (token) {
      setVerifyToken(token);
      setShowPublicVerify(true);
    }
  }, []);

  // Sync tab permissions: if non-admin tries to open admin tabs, reset to billing
  useEffect(() => {
    const adminOnlyTabs = ['dashboard', 'expenses', 'reports', 'employees', 'audit', 'settings'];
    if (!isAdmin && adminOnlyTabs.includes(currentTab)) {
      setCurrentTab('billing');
    }
    if (!isDeveloper && currentTab === 'developer') {
      setCurrentTab('billing');
    }
  }, [isAdmin, isDeveloper, currentTab]);

  // Global keyboard shortcuts for navigation (Alt+1 through Alt+8)
  useEffect(() => {
    const handleGlobalNavKeys = (e: KeyboardEvent) => {
      // Support Alt + 1..8
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === '1') {
          e.preventDefault();
          setCurrentTab('billing');
        } else if (e.key === '2') {
          e.preventDefault();
          setCurrentTab('inventory');
        } else if (e.key === '3') {
          e.preventDefault();
          setCurrentTab('sales');
        } else if (e.key === '4') {
          e.preventDefault();
          setCurrentTab('movements');
        } else if (isAdmin && e.key === '5') {
          e.preventDefault();
          setCurrentTab('dashboard');
        } else if (isAdmin && e.key === '6') {
          e.preventDefault();
          setCurrentTab('expenses');
        } else if (isAdmin && e.key === '7') {
          e.preventDefault();
          setCurrentTab('reports');
        } else if (isAdmin && e.key === '8') {
          e.preventDefault();
          setCurrentTab('settings');
        }
      }
    };

    window.addEventListener('keydown', handleGlobalNavKeys);
    return () => window.removeEventListener('keydown', handleGlobalNavKeys);
  }, [isAdmin]);

  if (showPublicVerify) {
    return (
      <PublicVerificationPage
        initialToken={verifyToken}
        onBackToApp={() => {
          setShowPublicVerify(false);
          // clear query string without reload
          window.history.pushState({}, '', window.location.pathname);
        }}
      />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center text-xs text-neutral-400 font-mono">
        Connecting to store ledger...
      </div>
    );
  }

  if (!user) {
    return <LoginPage onOpenVerify={() => setShowPublicVerify(true)} />;
  }

  return (
    <div className="h-[100dvh] max-h-[100dvh] w-full flex flex-col overflow-hidden bg-neutral-50 font-sans antialiased text-neutral-900">
      {/* Top Bar */}
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenVerifyModal={() => setShowPublicVerify(true)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Desktop Sidebar */}
        <div className="hidden md:flex shrink-0">
          <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />
        </div>

        {/* Dynamic Workspace View */}
        <main className="flex-1 flex flex-col min-h-0 overflow-y-auto pb-16 md:pb-0">
          {currentTab === 'billing' && (
            <POSWorkspace onNavigateToSales={() => setCurrentTab('sales')} />
          )}
          {currentTab === 'inventory' && <InventoryManager />}
          {currentTab === 'movements' && <StockMovementsList />}
          {currentTab === 'sales' && <BillHistory />}

          {/* Admin Protected Views */}
          {isAdmin && currentTab === 'dashboard' && (
            <AdminDashboard onNavigateTab={setCurrentTab} />
          )}
          {isAdmin && currentTab === 'expenses' && <ExpenseManager />}
          {isAdmin && currentTab === 'reports' && <ReportsView />}
          {isAdmin && currentTab === 'employees' && <EmployeeManager />}
          {isAdmin && currentTab === 'audit' && <AuditLogsView />}
          {isAdmin && currentTab === 'settings' && <SettingsView />}
          {isDeveloper && currentTab === 'developer' && <DeveloperConsole />}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <MobileNav
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        onOpenMore={() => setShowMobileMore(true)}
      />

      {/* Mobile "More" Drawer Modal */}
      {showMobileMore && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/50 md:hidden p-0 overflow-y-auto">
          <div className="bg-white rounded-t-xl w-full p-5 space-y-4 shadow-xl border-t border-neutral-200 max-h-[85dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
              <span className="font-semibold text-xs uppercase tracking-wider text-neutral-400 font-mono">
                Store Menu
              </span>
              <button
                onClick={() => setShowMobileMore(false)}
                className="p-1 text-neutral-400 hover:text-neutral-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {isAdmin && (
                <>
                  <button
                    onClick={() => {
                      setCurrentTab('expenses');
                      setShowMobileMore(false);
                    }}
                    className="p-3 bg-neutral-50 rounded border border-neutral-200 text-left font-medium flex items-center gap-2"
                  >
                    <Wallet className="w-4 h-4 text-neutral-600" />
                    Expenses
                  </button>
                  <button
                    onClick={() => {
                      setCurrentTab('reports');
                      setShowMobileMore(false);
                    }}
                    className="p-3 bg-neutral-50 rounded border border-neutral-200 text-left font-medium flex items-center gap-2"
                  >
                    <FileBarChart2 className="w-4 h-4 text-neutral-600" />
                    Reports & P&L
                  </button>
                  <button
                    onClick={() => {
                      setCurrentTab('employees');
                      setShowMobileMore(false);
                    }}
                    className="p-3 bg-neutral-50 rounded border border-neutral-200 text-left font-medium flex items-center gap-2"
                  >
                    <Users className="w-4 h-4 text-neutral-600" />
                    Staff Accounts
                  </button>
                  <button
                    onClick={() => {
                      setCurrentTab('audit');
                      setShowMobileMore(false);
                    }}
                    className="p-3 bg-neutral-50 rounded border border-neutral-200 text-left font-medium flex items-center gap-2"
                  >
                    <ScrollText className="w-4 h-4 text-neutral-600" />
                    Audit Logs
                  </button>
                  <button
                    onClick={() => {
                      setCurrentTab('settings');
                      setShowMobileMore(false);
                    }}
                    className="p-3 bg-neutral-50 rounded border border-neutral-200 text-left font-medium flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4 text-neutral-600" />
                    Settings
                  </button>

                  {isDeveloper && (
                    <button
                      onClick={() => {
                        setCurrentTab('developer');
                        setShowMobileMore(false);
                      }}
                      className="p-3 bg-amber-50 rounded border border-amber-200 text-left font-medium flex items-center gap-2 text-amber-900"
                    >
                      <Code className="w-4 h-4 text-amber-600" />
                      Developer APIs
                    </button>
                  )}
                </>
              )}

              <button
                onClick={() => {
                  setShowPublicVerify(true);
                  setShowMobileMore(false);
                }}
                className="p-3 bg-neutral-50 rounded border border-neutral-200 text-left font-medium flex items-center gap-2"
              >
                <Shield className="w-4 h-4 text-neutral-600" />
                Verify Bill
              </button>
            </div>

            {/* Mobile User Information */}
            <div className="pt-3 border-t border-neutral-200 flex items-center justify-between text-xs">
              <div>
                <span className="text-neutral-500 text-[10px] uppercase font-mono block">Signed in as:</span>
                <span className="font-semibold text-neutral-900">{user?.name} ({user?.role})</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
