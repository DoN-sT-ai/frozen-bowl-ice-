import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShoppingCart, Boxes, Receipt, LayoutDashboard, MoreHorizontal, ArrowLeftRight, Banknote } from 'lucide-react';

interface MobileNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenMore: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentTab, onSelectTab, onOpenMore }) => {
  const { user, isAdmin } = useAuth();
  const allowedTabIds = isAdmin
    ? ['billing', 'cash_control', 'inventory', 'sales', 'refunds', 'movements', 'customers']
    : user?.permissions && user.permissions.length > 0
    ? user.permissions
    : ['billing', 'inventory', 'sales', 'refunds', 'movements', 'cash_control', 'customers'];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-neutral-200 flex items-center justify-around px-2 z-40">
      {allowedTabIds.includes('billing') && (
        <button
          onClick={() => onSelectTab('billing')}
          className={`flex flex-col items-center justify-center flex-1 py-1 ${
            currentTab === 'billing' ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
          }`}
        >
          <ShoppingCart className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Billing</span>
        </button>
      )}

      {allowedTabIds.includes('cash_control') && (
        <button
          onClick={() => onSelectTab('cash_control')}
          className={`flex flex-col items-center justify-center flex-1 py-1 ${
            currentTab === 'cash_control' ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
          }`}
        >
          <Banknote className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Cash</span>
        </button>
      )}

      {allowedTabIds.includes('inventory') && (
        <button
          onClick={() => onSelectTab('inventory')}
          className={`flex flex-col items-center justify-center flex-1 py-1 ${
            currentTab === 'inventory' ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
          }`}
        >
          <Boxes className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Stock</span>
        </button>
      )}

      {allowedTabIds.includes('sales') && (
        <button
          onClick={() => onSelectTab('sales')}
          className={`flex flex-col items-center justify-center flex-1 py-1 ${
            currentTab === 'sales' ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
          }`}
        >
          <Receipt className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Bills</span>
        </button>
      )}

      {allowedTabIds.includes('movements') && !allowedTabIds.includes('cash_control') && (
        <button
          onClick={() => onSelectTab('movements')}
          className={`flex flex-col items-center justify-center flex-1 py-1 ${
            currentTab === 'movements' ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
          }`}
        >
          <ArrowLeftRight className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Movements</span>
        </button>
      )}

      {isAdmin && (
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`flex flex-col items-center justify-center flex-1 py-1 ${
            currentTab === 'dashboard' ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
          }`}
        >
          <LayoutDashboard className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Stats</span>
        </button>
      )}

      <button
        onClick={onOpenMore}
        className="flex flex-col items-center justify-center flex-1 py-1 text-neutral-500 hover:text-neutral-900"
      >
        <MoreHorizontal className="w-5 h-5" />
        <span className="text-[10px] mt-0.5">Menu</span>
      </button>
    </nav>
  );
};
