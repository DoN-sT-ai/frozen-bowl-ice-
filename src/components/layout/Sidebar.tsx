import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  ArrowLeftRight,
  Receipt,
  Users,
  Wallet,
  FileBarChart2,
  ScrollText,
  Settings,
  ShieldCheck,
  Code,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const { user, isAdmin, isDeveloper } = useAuth();

  const adminNav = [
    { id: 'billing', label: 'POS Billing', icon: ShoppingCart, highlight: true, shortcut: 'Alt+1' },
    { id: 'inventory', label: 'Inventory & Stock', icon: Boxes, shortcut: 'Alt+2' },
    { id: 'sales', label: 'Sales & Bills', icon: Receipt, shortcut: 'Alt+3' },
    { id: 'movements', label: 'Stock Movements', icon: ArrowLeftRight, shortcut: 'Alt+4' },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, shortcut: 'Alt+5' },
    { id: 'expenses', label: 'Expenses', icon: Wallet, shortcut: 'Alt+6' },
    { id: 'reports', label: 'Reports & P&L', icon: FileBarChart2, shortcut: 'Alt+7' },
    { id: 'employees', label: 'Staff Accounts', icon: Users },
    { id: 'audit', label: 'Audit Trail', icon: ScrollText },
    { id: 'settings', label: 'Store Settings', icon: Settings, shortcut: 'Alt+8' },
    ...(isDeveloper ? [{ id: 'developer', label: 'Developer APIs', icon: Code, highlight: false }] : []),
  ];

  const employeeNav = [
    { id: 'billing', label: 'POS Billing', icon: ShoppingCart, highlight: true, shortcut: 'Alt+1' },
    { id: 'inventory', label: 'Inventory Catalog', icon: Boxes, shortcut: 'Alt+2' },
    { id: 'sales', label: 'My Sales History', icon: Receipt, shortcut: 'Alt+3' },
    { id: 'movements', label: 'Stock Movements', icon: ArrowLeftRight, shortcut: 'Alt+4' },
  ];

  const navItems = isAdmin ? adminNav : employeeNav;

  return (
    <aside className="w-60 border-r border-neutral-200 bg-white flex flex-col shrink-0 select-none">
      <div className="p-3 border-b border-neutral-100">
        <div className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider px-2">
          {isDeveloper ? '⚡ DEVELOPER CONSOLE' : isAdmin ? 'ADMIN CONSOLE' : 'CASHIER TERMINAL'}
        </div>
      </div>

      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-neutral-900 text-white font-semibold shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
              } ${item.highlight && !isActive ? 'text-neutral-900 font-semibold bg-neutral-50 border border-neutral-200' : ''}`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-neutral-500'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {item.shortcut && (
                <span className={`text-[10px] font-mono px-1 rounded ${
                  isActive ? 'text-neutral-300 bg-neutral-800' : 'text-neutral-400 bg-neutral-100'
                }`}>
                  {item.shortcut}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Subtle store status indicator */}
      <div className="p-3 border-t border-neutral-200 bg-neutral-50 text-[11px] text-neutral-500">
        <div className="flex items-center gap-1.5 font-medium text-neutral-700">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Ledger Active</span>
        </div>
        <div className="text-neutral-400 mt-0.5 text-[10px]">
          ACID Transactional Mode
        </div>
      </div>
    </aside>
  );
};
