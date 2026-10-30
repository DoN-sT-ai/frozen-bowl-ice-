import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { Store, LogOut, User as UserIcon, Shield, Briefcase, ExternalLink } from 'lucide-react';

interface NavbarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  onOpenVerifyModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentTab, onSelectTab, onOpenVerifyModal }) => {
  const { user, store, logout, quickLogin } = useAuth();

  return (
    <header className="h-14 border-b border-neutral-200 bg-white px-4 md:px-6 flex items-center justify-between shrink-0 z-30">
      {/* Zone 1: Single text element Brand wordmark */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => onSelectTab(user?.role === 'ADMIN' ? 'dashboard' : 'billing')}
          className="flex items-center gap-2.5 text-left focus:outline-none"
        >
          <img
            src="/fryfreeze-logo.jpg"
            alt="FryFreeze"
            className="w-8 h-8 rounded-lg object-contain shadow-sm border border-neutral-200"
          />
          <div>
            <div className="text-sm font-bold text-neutral-900 tracking-tight leading-none">
              {store?.name || 'FryFreeze'}
            </div>
            <div className="text-[11px] text-neutral-500 font-mono tracking-wider mt-0.5">
              CODE: {store?.code || 'FF-01'}
            </div>
          </div>
        </button>
      </div>

      {/* Zone 2: Store info & verification shortcut */}
      <div className="hidden md:flex items-center gap-4 text-xs text-neutral-600">
        <span className="text-neutral-400">GSTIN: {store?.gstin || '-'}</span>
        <span className="text-neutral-300">·</span>
        <button
          onClick={onOpenVerifyModal}
          className="text-neutral-700 hover:text-neutral-950 font-medium underline underline-offset-2 flex items-center gap-1 transition-colors"
        >
          Verify Bill Token
          <ExternalLink className="w-3 h-3 text-neutral-400" />
        </button>
      </div>

      {/* Zone 3: Active User & Logout */}
      <div className="flex items-center gap-3">
        {/* User Badge */}
        <div className="flex items-center gap-2">
          <div className="text-right hidden sm:block">
            <div className="text-xs font-medium text-neutral-900 leading-tight">
              {user?.name}
            </div>
            <div className="text-[10px] text-neutral-500 font-mono tracking-wider">
              {user?.role}
            </div>
          </div>
          <div className="sm:hidden px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-neutral-100 text-neutral-700 border border-neutral-200">
            {user?.role === 'ADMIN' ? 'ADMIN' : 'STAFF'}
          </div>
          <button
            onClick={logout}
            className="p-1.5 text-neutral-500 hover:text-red-700 hover:bg-neutral-100 rounded transition-colors"
            title="Sign out"
            aria-label="Sign out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
