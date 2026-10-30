import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { ShoppingCart, Boxes, Receipt, LayoutDashboard, MoreHorizontal, ArrowLeftRight } from 'lucide-react';

interface MobileNavProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenMore: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentTab, onSelectTab, onOpenMore }) => {
  const { isAdmin } = useAuth();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white border-t border-neutral-200 flex items-center justify-around px-2 z-40">
      <button
        onClick={() => onSelectTab('billing')}
        className={`flex flex-col items-center justify-center flex-1 py-1 ${
          currentTab === 'billing' ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
        }`}
      >
        <ShoppingCart className="w-5 h-5" />
        <span className="text-[10px] mt-0.5">Billing</span>
      </button>

      <button
        onClick={() => onSelectTab('inventory')}
        className={`flex flex-col items-center justify-center flex-1 py-1 ${
          currentTab === 'inventory' ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
        }`}
      >
        <Boxes className="w-5 h-5" />
        <span className="text-[10px] mt-0.5">Stock</span>
      </button>

      <button
        onClick={() => onSelectTab('movements')}
        className={`flex flex-col items-center justify-center flex-1 py-1 ${
          currentTab === 'movements' ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
        }`}
      >
        <ArrowLeftRight className="w-5 h-5" />
        <span className="text-[10px] mt-0.5">Movements</span>
      </button>

      <button
        onClick={() => onSelectTab('sales')}
        className={`flex flex-col items-center justify-center flex-1 py-1 ${
          currentTab === 'sales' ? 'text-neutral-900 font-semibold' : 'text-neutral-500'
        }`}
      >
        <Receipt className="w-5 h-5" />
        <span className="text-[10px] mt-0.5">Bills</span>
      </button>

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
