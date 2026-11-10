import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { CloudDownload, CheckCircle, RefreshCw, X, ArrowUpCircle } from 'lucide-react';
import type { UpdateStatusData, UpdateProgressData } from '../../electron';

export const UpdateNotificationBanner: React.FC = () => {
  const { user } = useAuth();
  const [statusData, setStatusData] = useState<UpdateStatusData | null>(null);
  const [progress, setProgress] = useState<UpdateProgressData | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);
  const [isInstalling, setIsInstalling] = useState<boolean>(false);

  // Sync auth token to Electron auto-updater whenever user logs in
  useEffect(() => {
    if (window.electronAPI?.updater?.setAuth) {
      const token = localStorage.getItem('token') || '';
      if (token) {
        window.electronAPI.updater.setAuth(token);
      }
    }
  }, [user]);

  // Subscribe to Electron updater events and check initial pending state
  useEffect(() => {
    if (!window.electronAPI?.updater) return;

    // Check if an update is already pending on disk from previous session
    window.electronAPI.updater.getVersion().then((v) => {
      if (v?.hasPendingUpdate) {
        setStatusData({
          status: 'downloaded',
          version: v.pendingVersion,
          message: v.pendingVersion ? `Update v${v.pendingVersion} ready to install!` : 'Update ready to install!',
        });
        setDismissed(false);
      }
    }).catch(() => {});

    const unsubStatus = window.electronAPI.updater.onStatus((data) => {
      setStatusData(data);
      if (data.status === 'available' || data.status === 'downloaded') {
        setDismissed(false); // Un-dismiss when new update is ready
      }
    });

    const unsubProgress = window.electronAPI.updater.onProgress((data) => {
      setProgress(data);
      setDismissed(false);
    });

    return () => {
      if (unsubStatus) unsubStatus();
      if (unsubProgress) unsubProgress();
    };
  }, []);

  if (dismissed || !statusData) return null;

  // Only show banner when update is available, downloading, or downloaded
  const isDownloading = statusData.status === 'available' || (progress && progress.percent > 0 && progress.percent < 100);
  const isDownloaded = statusData.status === 'downloaded';

  if (!isDownloading && !isDownloaded) return null;

  const handleInstallNow = async () => {
    if (!window.electronAPI?.updater?.install) return;
    setIsInstalling(true);
    try {
      const res = await window.electronAPI.updater.install();
      if (res && !res.success) {
        setIsInstalling(false);
      }
    } catch (_) {
      setIsInstalling(false);
    }
  };

  return (
    <>
      {isInstalling && (
        <div className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/30">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Applying FryFreeze Update...</h3>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">
                Saving local ledger state and launching the update runner.
              </p>
              <div className="text-[11px] text-blue-300 font-medium mt-3 bg-blue-950/60 py-2 px-3 rounded-lg border border-blue-800/40">
                A progress window will guide the ~15s installation and relaunch FryFreeze automatically.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="fixed top-3 right-4 z-50 max-w-sm w-full bg-slate-900 text-white rounded-xl shadow-2xl border border-slate-700/80 p-4 transition-all duration-300 animate-in fade-in slide-in-from-top-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
              {isDownloaded ? (
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              ) : (
                <CloudDownload className="w-4 h-4 text-blue-400 animate-pulse" />
              )}
            </div>
            <div>
              <h4 className="text-xs font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>{isDownloaded ? 'Update Ready to Install' : 'Downloading Wireless Update'}</span>
                {statusData.version && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-blue-900/60 text-blue-300 border border-blue-700/50">
                    v{statusData.version}
                  </span>
                )}
              </h4>
              <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                {isDownloaded
                  ? 'The update is cryptographically verified and ready.'
                  : 'Downloading update in the background. You can continue billing.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-slate-400 hover:text-white p-1 rounded-md transition"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Progress Bar (when downloading) */}
        {isDownloading && progress && (
          <div className="mt-3 space-y-1.5">
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>
                {progress.bytesPerSecond > 0 && `${(progress.bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s • `}
                {progress.percent}%
              </span>
              <span>
                {(progress.transferred / (1024 * 1024)).toFixed(1)} / {(progress.total / (1024 * 1024)).toFixed(1)} MB
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-150 ease-out"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* Action Buttons (when downloaded) */}
        {isDownloaded && (
          <div className="mt-3 flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              onClick={() => setDismissed(true)}
              className="px-2.5 py-1 text-xs text-slate-400 hover:text-white rounded-lg transition"
            >
              Later
            </button>
            <button
              onClick={handleInstallNow}
              disabled={isInstalling}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm flex items-center gap-1.5 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isInstalling ? 'animate-spin' : ''}`} />
              <span>{isInstalling ? 'Restarting...' : 'Restart & Update Now'}</span>
            </button>
          </div>
        )}
      </div>
    </>
  );
};

