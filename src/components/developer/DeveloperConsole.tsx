import React, { useState, useEffect } from 'react';
import { api } from '../../lib/api';
import {
  Code,
  Database,
  Cloud,
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Key,
  Server,
  Globe,
  Terminal,
  Save,
  Radio,
  Sliders,
  ExternalLink,
  Shield,
} from 'lucide-react';

export const DeveloperConsole: React.FC = () => {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [testing, setTesting] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form states
  const [supabaseUrl, setSupabaseUrl] = useState<string>('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState<string>('');
  const [supabaseServiceKey, setSupabaseServiceKey] = useState<string>('');
  const [appUrl, setAppUrl] = useState<string>('');
  const [port, setPort] = useState<number>(9876);

  const loadDevConfig = async () => {
    try {
      setLoading(true);
      const data = await api.getDevConfig();
      setConfig(data);
      setSupabaseUrl(data.supabase?.url || '');
      setAppUrl(data.server?.appUrl || '');
      setPort(data.server?.port || 9876);
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to load developer config' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevConfig();
  }, []);

  const handleTestConnection = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const result = await api.testSupabaseConnection({
        url: supabaseUrl,
        key: supabaseServiceKey || supabaseAnonKey || undefined,
      });
      setTestResult(result);
      if (result.success) {
        setFeedbackMsg({ type: 'success', text: `Connection successful! Ping: ${result.latencyMs}ms` });
      } else {
        setFeedbackMsg({ type: 'error', text: result.message });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
      setFeedbackMsg({ type: 'error', text: err.message || 'Connection test failed' });
    } finally {
      setTesting(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const payload: any = {
        supabaseUrl,
        appUrl,
        port: Number(port),
      };
      if (supabaseAnonKey.trim()) payload.supabaseAnonKey = supabaseAnonKey.trim();
      if (supabaseServiceKey.trim()) payload.supabaseServiceKey = supabaseServiceKey.trim();

      const res = await api.updateDevConfig(payload);
      setFeedbackMsg({ type: 'success', text: res.message });
      await loadDevConfig();
      setSupabaseAnonKey('');
      setSupabaseServiceKey('');
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to save config' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-neutral-900 text-neutral-400 font-mono text-xs">
        Loading Developer Diagnostics...
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-950 text-neutral-100 overflow-y-auto font-sans">
      {/* Top Header */}
      <div className="p-4 bg-neutral-900 border-b border-neutral-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center font-bold">
            <Code className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>Developer & API Architecture Console</span>
              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                DEVELOPER PROFILE
              </span>
            </h2>
            <p className="text-[11px] text-neutral-400">
              Configure Supabase Cloud Database APIs, endpoints, and live backend connection diagnostics.
            </p>
          </div>
        </div>

        <button
          onClick={loadDevConfig}
          className="p-1.5 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 rounded transition cursor-pointer"
          title="Reload system metrics"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {feedbackMsg && (
        <div
          className={`mx-4 mt-3 p-3 rounded-lg text-xs flex justify-between items-center ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/60 border border-emerald-700/50 text-emerald-300'
              : 'bg-rose-950/60 border border-rose-700/50 text-rose-300'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button onClick={() => setFeedbackMsg(null)} className="font-bold text-neutral-400 hover:text-white">✕</button>
        </div>
      )}

      <div className="p-4 space-y-6 max-w-5xl">
        {/* Section 1: Supabase Cloud Database Configuration */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-emerald-400" />
              <h3 className="font-semibold text-xs text-white uppercase tracking-wider font-mono">
                Supabase Cloud Database & API Configuration
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-medium border ${
                config?.supabase?.configured
                  ? 'bg-emerald-950/50 text-emerald-400 border-emerald-800'
                  : 'bg-rose-950/50 text-rose-400 border-rose-800'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${config?.supabase?.configured ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></span>
                {config?.supabase?.configured ? 'CLOUD CONNECTED' : 'UNCONFIGURED'}
              </span>
            </div>
          </div>

          {/* Developer System Notice */}
          <div className="p-2.5 rounded-lg bg-neutral-950 border border-neutral-800 text-neutral-300 text-xs font-mono flex items-center gap-2">
            <Shield className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Developer Console — Cloud Database endpoints, system configuration, and live API connectivity.</span>
          </div>

          <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
            <div>
              <label className="font-mono text-[11px] text-neutral-300 block mb-1">
                SUPABASE_URL (Cloud PostgreSQL Project REST Endpoint)
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-neutral-500 absolute left-2.5 top-2.5" />
                <input
                  type="url"
                  required
                  value={supabaseUrl}
                  onChange={(e) => setSupabaseUrl(e.target.value)}
                  placeholder="https://your-project.supabase.co"
                  className="w-full pl-8 pr-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-white font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="font-mono text-[11px] text-neutral-300 block mb-1">
                  SUPABASE_ANON_KEY (Public Anonymous API Key)
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-neutral-500 absolute left-2.5 top-2.5" />
                  <input
                    type="password"
                    value={supabaseAnonKey}
                    onChange={(e) => setSupabaseAnonKey(e.target.value)}
                    placeholder={config?.supabase?.anonKeyPreview ? `Current: ${config.supabase.anonKeyPreview}` : 'sb_publishable_...'}
                    className="w-full pl-8 pr-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-white font-mono text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-mono text-[11px] text-neutral-300 block mb-1">
                  SUPABASE_SERVICE_ROLE_KEY (Admin Service Role Key)
                </label>
                <div className="relative">
                  <Key className="w-4 h-4 text-amber-500/70 absolute left-2.5 top-2.5" />
                  <input
                    type="password"
                    value={supabaseServiceKey}
                    onChange={(e) => setSupabaseServiceKey(e.target.value)}
                    placeholder={config?.supabase?.serviceKeyPreview ? `Current: ${config.supabase.serviceKeyPreview}` : 'sb_service_role_...'}
                    className="w-full pl-8 pr-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-white font-mono text-xs focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              <div>
                <label className="font-mono text-[11px] text-neutral-300 block mb-1">
                  POS Server Base URL
                </label>
                <input
                  type="text"
                  value={appUrl}
                  onChange={(e) => setAppUrl(e.target.value)}
                  placeholder="http://127.0.0.1:9876"
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-white font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="font-mono text-[11px] text-neutral-300 block mb-1">
                  Binding Port
                </label>
                <input
                  type="number"
                  value={port}
                  onChange={(e) => setPort(parseInt(e.target.value) || 9876)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded-lg text-white font-mono text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-neutral-800">
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={testing}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border border-neutral-700 disabled:opacity-50"
              >
                <Radio className={`w-3.5 h-3.5 text-emerald-400 ${testing ? 'animate-spin' : ''}`} />
                {testing ? 'Pinging Cloud Database...' : 'Test Cloud Connection'}
              </button>

              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold rounded-lg text-xs flex items-center gap-1.5 transition cursor-pointer shadow-sm disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Writing to .env...' : 'Save Configuration to .env'}
              </button>
            </div>
          </form>

          {/* Test Connection Results Box */}
          {testResult && (
            <div className={`p-3.5 rounded-lg border text-xs font-mono space-y-1.5 animate-in fade-in ${
              testResult.success
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                : 'bg-rose-950/40 border-rose-800 text-rose-200'
            }`}>
              <div className="flex items-center justify-between font-bold">
                <span className="flex items-center gap-1.5">
                  {testResult.success ? <CheckCircle className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                  {testResult.message}
                </span>
                {testResult.latencyMs !== undefined && (
                  <span className="text-[11px] px-2 py-0.5 rounded bg-black/40">
                    {testResult.latencyMs} ms
                  </span>
                )}
              </div>
              {testResult.tableCounts && (
                <div className="text-[11px] text-neutral-300 pt-1 flex gap-4">
                  <span>Cloud Operators in DB: <strong>{testResult.tableCounts.usersCount}</strong></span>
                  <span>Products in DB: <strong>{testResult.tableCounts.productsCount}</strong></span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 2: Local & Cloud Database Architecture */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-neutral-300 font-mono text-xs font-bold">
              <Database className="w-4 h-4 text-cyan-400" />
              Local Transactional Storage
            </div>
            <div className="space-y-1.5 text-xs text-neutral-400 font-mono">
              <div className="flex justify-between">
                <span>Engine:</span>
                <span className="text-neutral-200">SQLite Node.js Native Sync</span>
              </div>
              <div className="flex justify-between">
                <span>File Path:</span>
                <span className="text-neutral-200 text-[11px] truncate max-w-[220px]" title={config?.database?.path}>
                  {config?.database?.path}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Integrity:</span>
                <span className="text-emerald-400">ACID Double-Entry Ledger</span>
              </div>
            </div>
          </div>

          <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-neutral-300 font-mono text-xs font-bold">
              <Server className="w-4 h-4 text-purple-400" />
              Runtime Environment
            </div>
            <div className="space-y-1.5 text-xs text-neutral-400 font-mono">
              <div className="flex justify-between">
                <span>Node.js:</span>
                <span className="text-neutral-200">{config?.server?.nodeVersion}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform:</span>
                <span className="text-neutral-200">{config?.server?.platform}</span>
              </div>
              <div className="flex justify-between">
                <span>Port:</span>
                <span className="text-neutral-200">{config?.server?.port}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: REST API Catalog & Route Explorer */}
        <div className="bg-neutral-900/90 border border-neutral-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2 pb-2 border-b border-neutral-800">
            <Terminal className="w-4 h-4 text-amber-400" />
            <h3 className="font-semibold text-xs text-white uppercase tracking-wider font-mono">
              System REST API Endpoints Catalog
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead>
                <tr className="border-b border-neutral-800 text-neutral-400 text-[11px]">
                  <th className="py-2 px-3">Method</th>
                  <th className="py-2 px-3">Endpoint Path</th>
                  <th className="py-2 px-3">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {(config?.endpoints || []).map((ep: any, idx: number) => (
                  <tr key={idx} className="hover:bg-neutral-800/40 transition">
                    <td className="py-2 px-3 font-bold text-amber-400">{ep.method}</td>
                    <td className="py-2 px-3 text-emerald-400 font-semibold">{ep.path}</td>
                    <td className="py-2 px-3 text-neutral-400">{ep.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

