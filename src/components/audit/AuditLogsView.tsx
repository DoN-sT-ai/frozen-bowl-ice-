import React, { useState, useEffect } from 'react';
import { AuditLog } from '../../types';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/utils';
import { ScrollText, Search, ShieldCheck, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [searchAction, setSearchAction] = useState<string>('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const loadLogs = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      else setIsRefreshing(true);
      const data = await api.getAuditLogs({ action: searchAction, limit: 120 });
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!silent) setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadLogs(false);
    const interval = setInterval(() => {
      loadLogs(true);
    }, 4000);
    return () => clearInterval(interval);
  }, [searchAction]);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-neutral-50 overflow-y-auto md:overflow-hidden">
      {/* Header */}
      <div className="p-4 bg-white border-b border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-neutral-900 leading-none">
            System Security & Audit Trail
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Append-only, immutable record of financial mutations, stock updates, and login attempts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Filter by action (e.g. SALE, USER)..."
              value={searchAction}
              onChange={(e) => setSearchAction(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-neutral-50 border border-neutral-200 rounded text-xs focus:bg-white focus:outline-none focus:border-neutral-900"
            />
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-medium shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live Audit</span>
          </div>
          <button
            onClick={() => loadLogs(false)}
            className="p-1.5 text-neutral-500 hover:text-neutral-900 bg-neutral-100 hover:bg-neutral-200 rounded transition-colors cursor-pointer"
            title="Auto-refreshing live every 4s. Click to refresh now."
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing || loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-400">Loading audit records...</div>
        ) : logs.length === 0 ? (
          <div className="bg-white rounded border border-neutral-200 p-8 text-center text-xs text-neutral-500">
            No audit records found.
          </div>
        ) : (
          <div className="bg-white rounded border border-neutral-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse min-w-[650px]">
              <thead>
                <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                  <th className="py-2.5 px-3 w-8"></th>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Entity Type</th>
                  <th className="py-2.5 px-3">Author</th>
                  <th className="py-2.5 px-3">IP Address</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="hover:bg-neutral-50 cursor-pointer transition-colors"
                      >
                        <td className="py-2.5 px-3 text-neutral-400">
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-500 whitespace-nowrap">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-semibold text-neutral-900">
                          {log.action}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-600">
                          {log.entity_type}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-800 font-medium">
                          {log.user_name || 'System / Guest'}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px] text-neutral-400">
                          {log.ip_address || 'Internal'}
                        </td>
                      </tr>

                      {/* Expanded JSON Inspector */}
                      {isExpanded && (
                        <tr className="bg-neutral-50/70 border-b border-neutral-200">
                          <td colSpan={6} className="p-3 pl-11">
                            <div className="space-y-2">
                              {log.entity_id && (
                                <div className="text-[11px] font-mono text-neutral-500">
                                  Entity ID: <span className="text-neutral-900">{log.entity_id}</span>
                                </div>
                              )}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px] font-mono">
                                {log.before_data && (
                                  <div className="p-2 bg-white rounded border border-neutral-200">
                                    <span className="text-neutral-400 block mb-1">State Before:</span>
                                    <pre className="text-neutral-700 overflow-x-auto whitespace-pre-wrap">
                                      {JSON.stringify(log.before_data, null, 2)}
                                    </pre>
                                  </div>
                                )}
                                {log.after_data && (
                                  <div className="p-2 bg-white rounded border border-neutral-200">
                                    <span className="text-neutral-400 block mb-1">State After / Payload:</span>
                                    <pre className="text-neutral-700 overflow-x-auto whitespace-pre-wrap">
                                      {JSON.stringify(log.after_data, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
