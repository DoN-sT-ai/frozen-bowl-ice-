// Type definitions for Electron IPC bridge exposed via preload.cjs

export interface UpdateStatusData {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error' | 'dev-mode';
  version?: string;
  releaseDate?: string;
  message: string;
  error?: string;
}

export interface UpdateProgressData {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export interface ElectronAPI {
  isElectron?: boolean;
  print?: (options: any) => void;
  getPrinters?: () => Promise<any[]>;
  openWhatsApp?: (options: { phone?: string; text?: string }) => Promise<{ success: boolean; method?: string; error?: string }>;
  updater?: {
    check: () => Promise<{ success: boolean; updateInfo?: any; isDev?: boolean; error?: string; message?: string }>;
    install: () => Promise<{ success: boolean; error?: string }>;
    getVersion: () => Promise<{ version: string; isPackaged: boolean; feedUrl?: string }>;
    setAuth: (token: string) => Promise<{ success: boolean }>;
    onStatus: (callback: (data: UpdateStatusData) => void) => () => void;
    onProgress: (callback: (data: UpdateProgressData) => void) => () => void;
  };
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

