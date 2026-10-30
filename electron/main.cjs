const { app, BrowserWindow, Menu, dialog, shell, ipcMain, session } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');

if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

// ─── Single Instance Lock ──────────────────────────────────────────────────────
// CRITICAL: Guarantees that only ONE instance of LedgerStore can run at any time.
// If the user clicks the shortcut multiple times, subsequent launches exit immediately
// and refocus the existing main window, completely preventing infinite loops / fork bombs.
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  console.log('[LedgerStore] Another instance is already running. Exiting cleanly.');
  app.quit();
  process.exit(0);
}

// Disable hardware acceleration to eliminate Windows GPU driver / cache crashes
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');
app.commandLine.appendSwitch('disable-features', 'DawnGraphite');

// ─── Paths & Data Directory ────────────────────────────────────────────────────
// Packaged app detection
const isPackaged = app.isPackaged;

// Dedicated user data directory to avoid cache collisions
const appDataRoot = app.getPath('appData');
const isDevMode = !isPackaged;
// In development, keep FryFreeze data completely isolated in 'FryFreezeDesktop'
// so it NEVER touches or conflicts with the installed 'BillSreeDesktop' / 'Jayam Stores'!
const newUserDataDir = isDevMode
  ? path.join(appDataRoot, 'FryFreezeDesktop')
  : path.join(appDataRoot, 'FryFreezeDesktop');

try {
  app.setPath('userData', newUserDataDir);
} catch (_) {}

const userDataDir = app.getPath('userData');
// Persistent writable SQLite database folder inside AppData
const persistentDataDir = path.join(userDataDir, 'data');
if (!fs.existsSync(persistentDataDir)) {
  fs.mkdirSync(persistentDataDir, { recursive: true });
}

// ─── Environment & Supabase Cloud Config Synchronization ──────────────────────
const envCandidates = [
  path.join(persistentDataDir, '.env'),
  path.join(process.resourcesPath, '.env'),
  path.resolve(__dirname, '..', '.env'),
  path.resolve(process.cwd(), '.env'),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const idx = trimmed.indexOf('=');
          const k = trimmed.slice(0, idx).trim();
          let v = trimmed.slice(idx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (!process.env[k]) {
            process.env[k] = v;
          }
        }
      });
      const targetEnv = path.join(persistentDataDir, '.env');
      if (!fs.existsSync(targetEnv)) {
        try { fs.copyFileSync(envPath, targetEnv); } catch (_) {}
      }
      break;
    } catch (_) {}
  }
}

// Guarantee Supabase Cloud authentication credentials are never missing
if (!process.env.SUPABASE_URL) {
  process.env.SUPABASE_URL = 'https://sxzaalvmkkdnczrtzitd.supabase.co';
}
if (!process.env.SUPABASE_ANON_KEY) {
  process.env.SUPABASE_ANON_KEY = 'sb_publishable_0eosb1s_HO_94uv-4Rnlkw_9CVWYBGM';
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_publishable_0eosb1s_HO_94uv-4Rnlkw_9CVWYBGM';
}

// ─── Starter Database Seeding ──────────────────────────────────────────────────
// Ensure user starts with the full product catalog and store config
const targetDbPath = path.join(persistentDataDir, 'ledgerstore.db');

// Automatic safety snapshot before starting (preserves history across versions/updates)
if (fs.existsSync(targetDbPath) && fs.statSync(targetDbPath).size > 1000) {
  try {
    const backupDir = path.join(userDataDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    const today = new Date().toISOString().split('T')[0];
    const dailyBackupPath = path.join(backupDir, `ledgerstore-daily-${today}.db`);
    if (!fs.existsSync(dailyBackupPath)) {
      fs.copyFileSync(targetDbPath, dailyBackupPath);
      console.log(`[Backup] Automatic daily backup created at: ${dailyBackupPath}`);
      // Clean up backups older than 14 days
      const files = fs.readdirSync(backupDir).filter(f => f.startsWith('ledgerstore-daily-')).sort();
      while (files.length > 14) {
        const oldest = files.shift();
        fs.unlinkSync(path.join(backupDir, oldest));
      }
    }
  } catch (backupErr) {
    console.warn('[Backup] Daily backup notice:', backupErr);
  }
}

const starterDbCandidates = [
  path.join(process.resourcesPath, 'data', 'ledgerstore.db'),
  path.resolve(__dirname, '..', 'data', 'ledgerstore.db'),
];

let starterDbPath = null;
for (const cand of starterDbCandidates) {
  if (fs.existsSync(cand) && fs.statSync(cand).size > 10000) {
    starterDbPath = cand;
    break;
  }
}

if (starterDbPath && fs.existsSync(starterDbPath)) {
  let shouldSeed = !fs.existsSync(targetDbPath) || fs.statSync(targetDbPath).size < 1000;
  if (!shouldSeed && fs.existsSync(targetDbPath)) {
    try {
      const { DatabaseSync } = require('node:sqlite');
      const testDb = new DatabaseSync(targetDbPath);
      const prodCount = (testDb.prepare('SELECT count(*) as c FROM products').get() || {}).c || 0;
      testDb.close();
      if (prodCount === 0) {
        shouldSeed = true;
      }
    } catch (_) {}
  }

  if (shouldSeed) {
    try {
      console.log(`[FrozenBowl] Seeding starter database with products from: ${starterDbPath}`);
      fs.copyFileSync(starterDbPath, targetDbPath);
    } catch (copyErr) {
      console.warn('[FrozenBowl] Could not copy initial database:', copyErr);
    }
  }
}

// Pass DATA_DIR to localDb so it uses the writable user directory
process.env.DATA_DIR = persistentDataDir;

function getResourcePath(...segments) {
  if (isPackaged) {
    return path.join(process.resourcesPath, ...segments);
  }
  return path.resolve(__dirname, '..', ...segments);
}

const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 9876;
let currentPort = DEFAULT_PORT;
let serverInstance = null;
let mainWindow = null;

// ─── In-Process Server Management ──────────────────────────────────────────────
// The server runs DIRECTLY inside Electron's main process.
// NO child processes are spawned. This completely eliminates any possibility
// of fork-bombing or spawning multiple process instances.

function isServerHealthy(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(400, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function startEmbeddedServer() {
  // If an external dev server is already running on this port, connect to it
  const alreadyRunning = await isServerHealthy(DEFAULT_PORT);
  if (alreadyRunning) {
    console.log(`✅ Connected to active external server at http://127.0.0.1:${DEFAULT_PORT}`);
    currentPort = DEFAULT_PORT;
    return currentPort;
  }

  console.log('⚡ Starting LedgerStore embedded server in-process...');

  // Resolve directory containing client dist files
  const distDir = isPackaged
    ? path.join(process.resourcesPath, 'app-dist')
    : path.resolve(__dirname, '..', 'dist');

  // Candidate paths for bundled server.cjs
  const candidatePaths = [
    path.join(distDir, 'server.cjs'),
    path.resolve(__dirname, '..', 'dist', 'server.cjs'),
    path.join(process.resourcesPath, 'app.asar', 'dist', 'server.cjs'),
  ];

  let serverModule = null;
  let lastLoadError = null;
  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      try {
        serverModule = require(candidate);
        console.log(`[LedgerStore] Loaded server bundle from: ${candidate}`);
        break;
      } catch (loadErr) {
        lastLoadError = loadErr;
        console.error(`[LedgerStore] Error loading bundle at ${candidate}:`, loadErr);
      }
    }
  }

  if (serverModule && typeof serverModule.startServer === 'function') {
    try {
      serverInstance = await serverModule.startServer({
        distDir,
        port: DEFAULT_PORT,
      });
      currentPort = serverInstance.port;

      // Confirm embedded server is responding to HTTP requests before opening browser window
      let healthy = false;
      for (let i = 0; i < 30; i++) {
        healthy = await isServerHealthy(currentPort);
        if (healthy) break;
        await new Promise((r) => setTimeout(r, 150));
      }

      if (healthy) {
        console.log(`✅ LedgerStore embedded server active and healthy on http://127.0.0.1:${currentPort}`);
      } else {
        console.warn(`[LedgerStore] Server started on port ${currentPort} but health check timed out.`);
      }
      return currentPort;
    } catch (startErr) {
      console.error('[LedgerStore] Failed to start embedded server:', startErr);
      lastLoadError = startErr;
    }
  }

  console.error('⚠️ server.cjs could not be started. Last error:', lastLoadError || 'module not found');
  return DEFAULT_PORT;
}

function stopServer() {
  if (serverInstance && typeof serverInstance.close === 'function') {
    try {
      serverInstance.close();
    } catch (_) {}
    serverInstance = null;
  }
}

// ─── IPC Handlers ──────────────────────────────────────────────────────────────
ipcMain.handle('get-printers', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    try {
      const printers = await win.webContents.getPrintersAsync();
      return printers;
    } catch (err) {
      console.error('[Printers] Error retrieving printers:', err);
      return [];
    }
  }
  return [];
});

ipcMain.on('print-window', (event, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    const isSilent = options ? Boolean(options.silent) : true;
    const deviceName = options && options.deviceName ? options.deviceName : '';
    win.webContents.print(
      {
        silent: isSilent,
        printBackground: true,
        deviceName: deviceName,
        margins: { marginType: 'none' },
      },
      (success, failureReason) => {
        if (!success && failureReason !== 'cancelled') {
          console.log('[Print] Status:', success, failureReason || 'complete');
        }
      }
    );
  }
});

// ─── Window & Menu ─────────────────────────────────────────────────────────────
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Print Bill / Invoice',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            if (mainWindow) mainWindow.webContents.print();
          },
        },
        { type: 'separator' },
        {
          label: 'Export Database Backup (.db)...',
          click: async () => {
            try {
              if (!fs.existsSync(targetDbPath)) {
                dialog.showErrorBox('Backup Error', 'No active database found to back up.');
                return;
              }
              const defaultName = `FryFreeze-Backup-${new Date().toISOString().split('T')[0]}.db`;
              const saveResult = await dialog.showSaveDialog(mainWindow, {
                title: 'Export FryFreeze Database Backup',
                defaultPath: defaultName,
                filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }],
              });
              if (!saveResult.canceled && saveResult.filePath) {
                // Checkpoint before copying to ensure all pending transactions are flushed
                try {
                  const { DatabaseSync } = require('node:sqlite');
                  const db = new DatabaseSync(targetDbPath);
                  db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
                  db.close();
                } catch (_) {}
                fs.copyFileSync(targetDbPath, saveResult.filePath);
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'Backup Successful',
                  message: 'Database backup created successfully!',
                  detail: `Saved to:\n${saveResult.filePath}`,
                });
              }
            } catch (err) {
              dialog.showErrorBox('Backup Failed', err.message || 'An error occurred while creating backup.');
            }
          },
        },
        {
          label: 'Open Data Directory (SQLite)',
          click: () => {
            shell.openPath(persistentDataDir);
          },
        },
        { type: 'separator' },
        {
          label: 'Exit FryFreeze',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+R' },
        { type: 'separator' },
        { role: 'resetZoom', accelerator: 'CmdOrCtrl+0' },
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' },
        { role: 'zoomOut', accelerator: 'CmdOrCtrl+-' },
        { type: 'separator' },
        { role: 'togglefullscreen', accelerator: 'F11' },
        { role: 'toggleDevTools', accelerator: 'F12' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About FryFreeze',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About FryFreeze',
              message: 'FryFreeze - Quick-Service POS & Kitchen Management',
              detail: `Version ${app.getVersion()} (Desktop Edition)\nDatabase: Embedded SQLite\nData Folder: ${persistentDataDir}\nMode: 100% Offline Standalone Desktop App`,
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function resolveAppIcon() {
  const possiblePaths = [
    isPackaged ? path.join(process.resourcesPath, 'assets', 'icon.ico') : null,
    isPackaged ? path.join(process.resourcesPath, 'assets', 'icon.png') : null,
    isPackaged ? path.join(process.resourcesPath, 'assets', 'fryfreeze-logo.jpg') : null,
    path.resolve(__dirname, '..', 'assets', 'icon.ico'),
    path.resolve(__dirname, '..', 'assets', 'icon.png'),
    path.resolve(__dirname, '..', 'assets', 'fryfreeze-logo.jpg'),
    path.resolve(__dirname, '..', 'public', 'fryfreeze-logo.jpg'),
  ].filter(Boolean);

  for (const iconPath of possiblePaths) {
    if (fs.existsSync(iconPath)) return iconPath;
  }
  return undefined;
}

function createWindow() {
  const icon = resolveAppIcon();

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 680,
    title: 'FryFreeze - Quick-Service POS & Kitchen Management',
    icon: icon,
    backgroundColor: '#0f172a',
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  createMenu();

  const targetUrl = `http://127.0.0.1:${currentPort}`;
  mainWindow.loadURL(targetUrl);

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  });

  // Safety fallback: Ensure window is visible within 2.5s
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
    }
  }, 2500);

  let failLoadRetries = 0;
  const MAX_FAIL_RETRIES = 15;
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    if (failLoadRetries < MAX_FAIL_RETRIES) {
      failLoadRetries++;
      setTimeout(async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          const healthy = await isServerHealthy(currentPort);
          if (healthy || failLoadRetries < 5) {
            mainWindow.loadURL(targetUrl);
          }
        }
      }, 1000);
    } else {
      console.error(`[LedgerStore] Server not reachable after ${MAX_FAIL_RETRIES} attempts (${errorCode}: ${errorDescription})`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><title>FryFreeze</title></head>
          <body style="font-family:Segoe UI,sans-serif;margin:0;padding:40px;background:#0f172a;color:#f8fafc;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;box-sizing:border-box;">
            <div style="background:#1e293b;border:1px solid #334155;border-radius:12px;padding:36px;max-width:480px;text-align:center;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
              <h2 style="color:#f87171;margin-top:0;">Local Engine Starting</h2>
              <p style="color:#94a3b8;font-size:14px;line-height:1.6;margin-bottom:24px;">The local FryFreeze database engine is still initializing. Click below to reconnect.</p>
              <button onclick="location.href='${targetUrl}'" style="padding:10px 24px;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;">Retry Now</button>
            </div>
          </body>
          </html>
        `)}`);
      }
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── Single Instance Focus Handler ─────────────────────────────────────────────
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

// ─── App Lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    await startEmbeddedServer();
  } catch (err) {
    console.error('[LedgerStore] Error starting server:', err);
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopServer();
    app.quit();
  }
});

app.on('before-quit', () => {
  try {
    if (session && session.defaultSession) {
      session.defaultSession.clearStorageData({
        storages: ['cookies', 'localstorage'],
      }).catch(() => {});
    }
  } catch (_) {}
  stopServer();
});
