import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import { Lock, User as UserIcon, ArrowRight, ExternalLink, Shield } from 'lucide-react';

interface LoginPageProps {
  onOpenVerify: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onOpenVerify }) => {
  const { login, error } = useAuth();
  const [shopName, setShopName] = useState<string>(() => localStorage.getItem('last_known_shop_name') || '');
  const [username, setUsername] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    api.getStoreInfo()
      .then(info => {
        if (info?.name) {
          setShopName(info.name);
          localStorage.setItem('last_known_shop_name', info.name);
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setLocalError('Please enter both username and password');
      return;
    }
    try {
      setLoading(true);
      setLocalError(null);
      await login(username.trim(), password);
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full bg-neutral-100 flex flex-col justify-center py-8 sm:py-12 px-4 sm:px-6 lg:px-8 text-neutral-900 font-sans overflow-y-auto">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="flex justify-center mb-3">
          <img
            src="/fryfreeze-logo.jpg"
            alt="FryFreeze Logo"
            className="w-24 h-24 rounded-2xl shadow-lg object-contain border-2 border-amber-500/20 bg-white p-1"
          />
        </div>
        <h2 className="text-center text-2xl font-black tracking-tight text-neutral-900">
          {shopName || 'Store Terminal'}
        </h2>
        <p className="mt-1 text-center text-xs text-neutral-500 font-medium">
          Point of Sale &amp; Kitchen Management System
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white py-6 px-6 shadow-sm border border-neutral-200 rounded-xl sm:px-8 space-y-4">
          <div className="border-b border-neutral-100 pb-2">
            <h3 className="font-semibold text-xs text-neutral-800 uppercase tracking-wider">
              Store Operator Sign-In
            </h3>
            <p className="text-[11px] text-neutral-400 mt-0.5">
              Enter authorized username and password to unlock terminals.
            </p>
          </div>

          {(localError || error) && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 leading-relaxed animate-in fade-in">
              {localError || error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-medium text-neutral-700 mb-1">
                Username
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-neutral-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-neutral-300 rounded-lg focus:border-neutral-900 focus:outline-none text-xs"
                  placeholder="Enter username"
                />
              </div>
            </div>

            <div>
              <label className="block font-medium text-neutral-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-neutral-400 absolute left-2.5 top-2.5" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 border border-neutral-300 rounded-lg focus:border-neutral-900 focus:outline-none font-mono text-xs"
                  placeholder="Enter password"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-neutral-900 text-white font-semibold rounded-lg text-xs hover:bg-neutral-800 transition-colors flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Verifying Credentials...' : 'Sign In to Store Terminal'}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Security & Access Indicator */}
          <div className="pt-3 border-t border-neutral-100 flex items-center justify-between text-[11px] text-neutral-500">
            <span className="flex items-center gap-1 text-neutral-600">
              <Shield className="w-3.5 h-3.5 text-emerald-600" />
              <span>Supabase Access Control Active</span>
            </span>
            <span className="font-mono text-[10px] text-neutral-400">Terminal Protected</span>
          </div>

          {/* Public Bill Verification Link */}
          <div className="pt-1 text-center">
            <button
              type="button"
              onClick={onOpenVerify}
              className="text-[11px] text-neutral-500 hover:text-neutral-900 underline underline-offset-2 flex items-center justify-center gap-1 mx-auto cursor-pointer"
            >
              Customer? Verify Bill Token Online
              <ExternalLink className="w-3 h-3 text-neutral-400" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
