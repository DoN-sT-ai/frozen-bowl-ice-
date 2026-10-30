import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Store } from '../types';
import { api } from '../lib/api';

interface AuthContextType {
  user: User | null;
  store: Store | null;
  loading: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  quickLogin: (email: string, pass: string) => Promise<void>;
  isAdmin: boolean;
  isDeveloper: boolean;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSession = async () => {
    try {
      setLoading(true);
      setError(null);

      // If there is no active session token in memory/sessionStorage (e.g. app was closed and reopened),
      // require explicit username and password authentication
      if (!api.getToken()) {
        setUser(null);
        setStore(null);
        return;
      }

      // Check if user explicitly logged out — don't auto-restore session
      const isExplicitLoggedOut = sessionStorage.getItem('ledger_logged_out') === 'true';
      if (isExplicitLoggedOut) {
        setUser(null);
        setStore(null);
        return;
      }

      // Restore existing session (e.g. page refresh) — verify with server
      const res = await api.getSession();
      setUser(res.user);
      setStore(res.store);
    } catch {
      // No active session — show login page for authentic sign in
      setUser(null);
      setStore(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSession();
  }, []);

  const login = async (email: string, pass: string) => {
    setError(null);
    try {
      sessionStorage.removeItem('ledger_logged_out');
      const res = await api.login(email, pass);
      setUser(res.user);
      setStore(res.store);
    } catch (err: any) {
      setError(err.message || 'Login failed');
      throw err;
    }
  };

  const logout = async () => {
    sessionStorage.setItem('ledger_logged_out', 'true');
    try {
      await api.logout();
    } catch {
      // Ignore
    } finally {
      setUser(null);
      setStore(null);
    }
  };

  const quickLogin = async (email: string, pass: string) => {
    await login(email, pass);
  };

  const isDeveloper = user?.role === 'DEVELOPER';
  const isAdmin = user?.role === 'ADMIN' || isDeveloper;

  return (
    <AuthContext.Provider
      value={{
        user,
        store,
        loading,
        error,
        login,
        logout,
        quickLogin,
        isAdmin,
        isDeveloper,
        refreshSession: fetchSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
