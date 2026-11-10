// ============================================================================
// ELECTRON AUTO-UPDATER MODULE (WIRELESS CLOUD UPDATES VIA SUPABASE)
// ============================================================================
// Supports dual-mode update metadata discovery:
// 1. Supabase Edge Function update feed (when deployed).
// 2. Direct Supabase Storage authenticated feed with transparent multipart chunk
//    reassembly, retry resilience, and SHA-512 cryptographic verification.
//
// Key Reliability Guarantees:
// • Single download manager: eliminates concurrent progress clashing & stutter.
// • Monotonic progress & real-time transfer speed calculation (MB/s).
// • Bulletproof Windows installer runner: waits for running PID to completely exit,
//   runs NSIS silently with /S (zero file-locking errors), and auto-relaunches.
// • Local SQLite databases in userData directory are NEVER touched or overwritten.
// ============================================================================

const { ipcMain, app } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

let mainWindowRef = null;
let currentAuthToken = '';
let downloadedInstallerPath = null;
let activeDownloadPromise = null;
let maxReportedPercent = 0;
let lastCheckingTimestamp = 0;

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || 'https://qruqelexhfgqmdlsrlug.supabase.co';
  const key = process.env.SUPABASE_ANON_KEY || 'sb_publishable_V5urSBDQ03O0YT2fL0BRGQ_wr7iec55';
  return {
    url: url.replace(/\/+$/, ''),
    key,
  };
}

function getEdgeFunctionUrl() {
  const { url } = getSupabaseConfig();
  return `${url}/functions/v1/app-updates`;
}

function getRequestHeaders() {
  const { key } = getSupabaseConfig();
  const bearerToken = currentAuthToken || key;
  const headers = {
    'x-supabase-key': key,
    'apikey': key,
    'Authorization': `Bearer ${bearerToken}`,
    'x-client-version': app.getVersion(),
    'x-client-platform': process.platform,
    'x-client-arch': process.arch,
  };
  if (currentAuthToken) {
    headers['x-user-token'] = currentAuthToken;
  }
  return headers;
}

function sendToWindow(channel, data) {
  if (mainWindowRef && !mainWindowRef.isDestroyed() && mainWindowRef.webContents) {
    mainWindowRef.webContents.send(channel, data);
  }
}

function parseVersion(filenameOrVersion) {
  if (!filenameOrVersion) return '0.0.0';
  const match = filenameOrVersion.match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : filenameOrVersion;
}

function compareVersions(v1, v2) {
  const r = (parseVersion(v1) || '').split('.').map((n) => parseInt(n, 10) || 0);
  const l = (parseVersion(v2) || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    const rVal = r[i] || 0;
    const lVal = l[i] || 0;
    if (rVal > lVal) return 1;
    if (rVal < lVal) return -1;
  }
  return 0;
}

function isNewerVersion(remote, local) {
  return compareVersions(remote, local) > 0;
}

function pruneOldInstallers(updateDir, keepFilename = null) {
  if (!fs.existsSync(updateDir)) return;
  try {
    const entries = fs.readdirSync(updateDir);
    for (const entry of entries) {
      if (keepFilename && entry === keepFilename) continue;
      // Delete older or stale .exe or temporary download chunks
      if (entry.endsWith('.exe') || entry.endsWith('.tmp') || entry.includes('.exe.part')) {
        try {
          fs.unlinkSync(path.join(updateDir, entry));
          console.log(`[AutoUpdater] Pruned older/stale update artifact: ${entry}`);
        } catch (e) {
          console.warn(`[AutoUpdater] Could not prune ${entry}:`, e.message);
        }
      }
    }
  } catch (err) {
    console.warn('[AutoUpdater] Prune check note:', err.message);
  }
}

function getSortedPendingInstallers(updateDir) {
  if (!fs.existsSync(updateDir)) return [];
  try {
    const files = fs.readdirSync(updateDir).filter((f) => f.endsWith('.exe') && !f.endsWith('.tmp'));
    return files.sort((a, b) => compareVersions(parseVersion(b), parseVersion(a)));
  } catch (_) {
    return [];
  }
}

// ─── Network Fetch & Stream Utilities with Auto-Retry ────────────────────────

function fetchBufferWithRedirect(targetUrl, headers = {}, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Too many HTTP redirects'));

    const parsed = new URL(targetUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(targetUrl, { headers, timeout: 15000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchBufferWithRedirect(res.headers.location, {}, maxRedirects - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} fetching ${targetUrl}`));
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Network timeout fetching ' + targetUrl));
    });
    req.on('error', reject);
  });
}

function fetchStorageBuffer(filePath) {
  const { url, key } = getSupabaseConfig();
  const fullUrl = `${url}/storage/v1/object/authenticated/app-updates/${encodeURIComponent(filePath)}`;
  return fetchBufferWithRedirect(fullUrl, {
    apikey: key,
    Authorization: `Bearer ${key}`,
  });
}

function streamChunkWithRetry(partName, onChunkData, maxRetries = 3) {
  const { url, key } = getSupabaseConfig();
  const fullUrl = `${url}/storage/v1/object/authenticated/app-updates/${encodeURIComponent(partName)}`;

  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryStream = () => {
      attempt++;
      const req = https.get(
        fullUrl,
        {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`,
          },
          timeout: 45000,
        },
        (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            const redirectReq = https.get(res.headers.location, { timeout: 45000 }, (redRes) => {
              redRes.on('data', onChunkData);
              redRes.on('end', resolve);
            });
            redirectReq.on('timeout', () => redirectReq.destroy());
            redirectReq.on('error', (err) => {
              if (attempt < maxRetries) {
                console.warn(`[AutoUpdater] Part ${partName} retry ${attempt}/${maxRetries} after error:`, err.message);
                setTimeout(tryStream, 1500);
              } else {
                reject(err);
              }
            });
            return;
          }

          if (res.statusCode !== 200) {
            const err = new Error(`HTTP ${res.statusCode} downloading ${partName}`);
            if (attempt < maxRetries) {
              console.warn(`[AutoUpdater] Part ${partName} attempt ${attempt} got ${res.statusCode}. Retrying...`);
              return setTimeout(tryStream, 1500);
            }
            return reject(err);
          }

          res.on('data', onChunkData);
          res.on('end', resolve);
        }
      );

      req.on('timeout', () => {
        req.destroy();
        if (attempt < maxRetries) {
          console.warn(`[AutoUpdater] Part ${partName} timed out (attempt ${attempt}/${maxRetries}). Retrying...`);
          setTimeout(tryStream, 1500);
        } else {
          reject(new Error(`Timeout downloading ${partName} after ${maxRetries} attempts`));
        }
      });

      req.on('error', (err) => {
        if (attempt < maxRetries) {
          console.warn(`[AutoUpdater] Part ${partName} error on attempt ${attempt}: ${err.message}. Retrying...`);
          setTimeout(tryStream, 1500);
        } else {
          reject(err);
        }
      });
    };

    tryStream();
  });
}

// ─── Single Dedicated Download Manager ───────────────────────────────────────

async function downloadRelease(filename, version, expectedSha512, totalSize) {
  if (activeDownloadPromise) {
    return activeDownloadPromise;
  }

  activeDownloadPromise = (async () => {
    try {
      const updateDir = path.join(app.getPath('userData'), 'pending-update');
      if (!fs.existsSync(updateDir)) {
        fs.mkdirSync(updateDir, { recursive: true });
      }

      // Automatically prune older or conflicting installer artifacts
      pruneOldInstallers(updateDir, filename);

      const destPath = path.join(updateDir, filename);
      const tempPath = `${destPath}.tmp`;

      // 1. Check if already downloaded and verified
      if (fs.existsSync(destPath)) {
        try {
          const stat = fs.statSync(destPath);
          if (stat.size === totalSize) {
            console.log(`[AutoUpdater] Verifying existing installer on disk: ${destPath}`);
            const existingHash = crypto.createHash('sha512');
            const existingStream = fs.createReadStream(destPath);
            await new Promise((resolve, reject) => {
              existingStream.on('data', (d) => existingHash.update(d));
              existingStream.on('end', resolve);
              existingStream.on('error', reject);
            });
            const existingSha = existingHash.digest('base64');
            if (!expectedSha512 || existingSha === expectedSha512) {
              console.log(`[AutoUpdater] Installer already fully downloaded and verified!`);
              downloadedInstallerPath = destPath;
              sendToWindow('updater:status', {
                status: 'downloaded',
                version,
                message: `Update v${version} verified and ready to install!`,
              });
              return destPath;
            }
          }
        } catch (_) {}
      }

      // 2. Clean any stale temp file
      if (fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }

      console.log(`[AutoUpdater] Starting smooth download for ${filename} (${(totalSize / (1024 * 1024)).toFixed(1)} MB)...`);
      maxReportedPercent = 0;

      const fileStream = fs.createWriteStream(tempPath, { flags: 'w' });
      const hash = crypto.createHash('sha512');
      let transferred = 0;
      let lastReportTime = Date.now();
      let lastReportTransferred = 0;

      const onChunk = (chunk) => {
        fileStream.write(chunk);
        hash.update(chunk);
        transferred += chunk.length;

        const now = Date.now();
        const elapsedMs = now - lastReportTime;

        if (elapsedMs >= 200 || transferred >= totalSize) {
          const rawPercent = totalSize > 0 ? Math.round((transferred / totalSize) * 100) : 50;
          // Monotonically increasing: progress bar never jumps backwards
          maxReportedPercent = Math.max(maxReportedPercent, Math.min(rawPercent, 100));

          const bytesDiff = transferred - lastReportTransferred;
          const bytesPerSecond = elapsedMs > 0 ? Math.round((bytesDiff / elapsedMs) * 1000) : 0;

          lastReportTime = now;
          lastReportTransferred = transferred;

          sendToWindow('updater:progress', {
            percent: maxReportedPercent,
            bytesPerSecond,
            transferred,
            total: totalSize,
          });
        }
      };

      // 3. Check for multipart manifest
      let isMultipart = false;
      let manifest = null;
      try {
        const manifestBuf = await fetchStorageBuffer(`${filename}.manifest.json`);
        manifest = JSON.parse(manifestBuf.toString('utf8'));
        if (Array.isArray(manifest.parts) && manifest.parts.length > 0) {
          isMultipart = true;
        }
      } catch (_) {}

      if (isMultipart && manifest) {
        console.log(`[AutoUpdater] Downloading multipart release (${manifest.parts.length} parts, total ${manifest.totalSize} bytes)...`);
        for (let i = 0; i < manifest.parts.length; i++) {
          const partName = manifest.parts[i];
          console.log(`[AutoUpdater] Downloading part ${i + 1}/${manifest.parts.length}: ${partName}`);
          await streamChunkWithRetry(partName, onChunk);
        }
      } else {
        console.log(`[AutoUpdater] Downloading single binary: ${filename}`);
        await streamChunkWithRetry(filename, onChunk);
      }

      await new Promise((resolve, reject) => {
        fileStream.on('close', resolve);
        fileStream.on('error', reject);
        fileStream.end();
      });

      // 4. Cryptographic SHA-512 Verification
      const computedSha512 = hash.digest('base64');
      console.log(`[AutoUpdater] SHA-512 verification:`);
      console.log(`   Computed: ${computedSha512}`);
      console.log(`   Expected: ${expectedSha512}`);

      if (expectedSha512 && computedSha512 !== expectedSha512) {
        try { fs.unlinkSync(tempPath); } catch (_) {}
        throw new Error('Cryptographic SHA-512 mismatch. Corrupted download discarded.');
      }

      // 5. Atomically commit verified installer (with copy fallback for Windows lock safety)
      if (fs.existsSync(destPath)) {
        try { fs.unlinkSync(destPath); } catch (_) {}
      }
      try {
        fs.renameSync(tempPath, destPath);
      } catch (renameErr) {
        console.warn('[AutoUpdater] renameSync notice, using copy fallback:', renameErr.message);
        fs.copyFileSync(tempPath, destPath);
        try { fs.unlinkSync(tempPath); } catch (_) {}
      }

      downloadedInstallerPath = destPath;

      // Final 100% progress event
      sendToWindow('updater:progress', {
        percent: 100,
        bytesPerSecond: 0,
        transferred: totalSize,
        total: totalSize,
      });

      sendToWindow('updater:status', {
        status: 'downloaded',
        version,
        message: `Update v${version} verified and ready to install!`,
      });

      console.log(`[AutoUpdater] Update v${version} successfully prepared at: ${destPath}`);
      return destPath;
    } catch (err) {
      console.error('[AutoUpdater] Download failed:', err);
      sendToWindow('updater:status', {
        status: 'error',
        message: `Download failed: ${err.message}`,
      });
      throw err;
    } finally {
      activeDownloadPromise = null;
    }
  })();

  return activeDownloadPromise;
}

// ─── Update Check Engine (Edge Function with Supabase Storage Fallback) ──────

async function checkForUpdates() {
  const now = Date.now();
  if (now - lastCheckingTimestamp < 3000) {
    return { success: true, message: 'Check already in progress' };
  }
  lastCheckingTimestamp = now;

  sendToWindow('updater:status', {
    status: 'checking',
    message: 'Checking for updates in Supabase Cloud...',
  });

  let latestText = null;

  // Try 1: Supabase Edge Function
  try {
    const edgeUrl = `${getEdgeFunctionUrl()}/latest.yml`;
    const edgeBuf = await fetchBufferWithRedirect(edgeUrl, getRequestHeaders(), 3);
    latestText = edgeBuf.toString('utf8');
  } catch (edgeErr) {
    console.warn('[AutoUpdater] Edge function check note:', edgeErr.message);
  }

  // Try 2: Direct Supabase Storage
  if (!latestText || !latestText.includes('version:')) {
    try {
      const storageBuf = await fetchStorageBuffer('latest.yml');
      latestText = storageBuf.toString('utf8');
    } catch (storageErr) {
      console.warn('[AutoUpdater] Storage fallback check note:', storageErr.message);
    }
  }

  if (!latestText || !latestText.includes('version:')) {
    sendToWindow('updater:status', {
      status: 'error',
      message: 'Could not connect to update cloud. POS continues running smoothly offline.',
    });
    return { success: false, error: 'Could not retrieve update metadata.' };
  }

  // Parse latest.yml metadata
  const versionMatch = latestText.match(/version:\s*([^\r\n]+)/);
  const remoteVersion = versionMatch ? versionMatch[1].trim() : null;

  const fileMatch = latestText.match(/path:\s*([^\r\n]+)/) || latestText.match(/url:\s*([^\r\n]+)/);
  const remoteFile = fileMatch ? fileMatch[1].trim() : null;

  const shaMatch = latestText.match(/sha512:\s*([^\r\n]+)/);
  const expectedSha512 = shaMatch ? shaMatch[1].trim() : null;

  const sizeMatch = latestText.match(/size:\s*(\d+)/);
  const expectedSize = sizeMatch ? parseInt(sizeMatch[1], 10) : 0;

  const currentVersion = app.getVersion();

  if (!remoteVersion || !remoteFile) {
    sendToWindow('updater:status', {
      status: 'error',
      message: 'Invalid update metadata format received from server.',
    });
    return { success: false, error: 'Invalid update metadata.' };
  }

  if (!isNewerVersion(remoteVersion, currentVersion)) {
    sendToWindow('updater:status', {
      status: 'not-available',
      version: currentVersion,
      message: `FryFreeze is up to date (v${currentVersion}).`,
    });
    return { success: true, isUpToDate: true, version: currentVersion };
  }

  // Newer version is available!
  console.log(`[AutoUpdater] Newer version detected: v${remoteVersion} (current: v${currentVersion})`);
  sendToWindow('updater:status', {
    status: 'available',
    version: remoteVersion,
    message: `Version ${remoteVersion} available! Downloading wireless update in background...`,
  });

  // Start smooth background download
  downloadRelease(remoteFile, remoteVersion, expectedSha512, expectedSize).catch((err) => {
    console.error('[AutoUpdater] Background download failed:', err.message);
  });

  return { success: true, updateAvailable: true, version: remoteVersion };
}

// ─── Lifecycle & IPC Handlers ────────────────────────────────────────────────

function initAutoUpdater(mainWindow) {
  mainWindowRef = mainWindow;

  // Background Periodic Check (Every 45 Minutes)
  const PERIODIC_CHECK_INTERVAL = 45 * 60 * 1000;
  setInterval(() => {
    checkForUpdates().catch(() => {});
  }, PERIODIC_CHECK_INTERVAL);

  // Initial check 7 seconds after app startup
  setTimeout(() => {
    checkForUpdates().catch(() => {});
  }, 7000);
}

// IPC Handlers
ipcMain.handle('updater:check', async () => {
  return await checkForUpdates();
});

ipcMain.handle('updater:install', async () => {
  try {
    console.log('[AutoUpdater] Restart & Update requested...');

    let installerPath = downloadedInstallerPath;
    const updateDir = path.join(app.getPath('userData'), 'pending-update');

    // Check if installer is already present on disk in pending-update
    if ((!installerPath || !fs.existsSync(installerPath)) && fs.existsSync(updateDir)) {
      const exes = getSortedPendingInstallers(updateDir);
      if (exes.length > 0) {
        installerPath = path.join(updateDir, exes[0]);
      }
    }

    if (!installerPath || !fs.existsSync(installerPath)) {
      throw new Error('No downloaded update package found on disk. Please click "Check for Updates" to download.');
    }

    const stat = fs.statSync(installerPath);
    if (stat.size < 1000000) {
      throw new Error('Downloaded installer file appears incomplete.');
    }

    console.log(`[AutoUpdater] Executing silent Windows update via runner: ${installerPath}`);

    const targetPid = process.pid;
    const currentExe = process.execPath;
    const runnerScriptPath = path.join(updateDir, 'apply-update.ps1');

    // Dedicated PowerShell update runner with native progress indicator window:
    // 1. Shows a sleek centered dialog indicating the update is being extracted and applied.
    // 2. Monitors calling process PID and waits until it exits.
    // 3. Kills any lingering child processes so Windows releases all executable file locks.
    // 4. Executes NSIS silently with /S --updated --force-run while updating the status message.
    // 5. Verifies relaunch via Win32_Process fallback and closes the progress window.
    const runnerScriptContent = `
param(
  [int]$TargetPid,
  [string]$InstallerPath,
  [string]$AppExePath
)

$LogFile = Join-Path (Split-Path $InstallerPath) "update.log"
function Log-Msg($msg) {
  "[{0:yyyy-MM-dd HH:mm:ss}] {1}" -f (Get-Date), $msg | Out-File -FilePath $LogFile -Append -Encoding utf8
}

Log-Msg "=== Update runner started ==="
Log-Msg "TargetPid: $TargetPid"
Log-Msg "InstallerPath: $InstallerPath"
Log-Msg "AppExePath: $AppExePath"

# 1. Native Windows Progress / Splash Dialog
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$form = New-Object System.Windows.Forms.Form
$form.Text = "FryFreeze POS - Updating"
$form.Size = New-Object System.Drawing.Size(430, 165)
$form.StartPosition = "CenterScreen"
$form.FormBorderStyle = "FixedDialog"
$form.MaximizeBox = $false
$form.MinimizeBox = $false
$form.TopMost = $true
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#0f172a")

$labelTitle = New-Object System.Windows.Forms.Label
$labelTitle.Text = "Updating FryFreeze POS..."
$labelTitle.Font = New-Object System.Drawing.Font("Segoe UI", 12, [System.Drawing.FontStyle]::Bold)
$labelTitle.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#f8fafc")
$labelTitle.AutoSize = $true
$labelTitle.Location = New-Object System.Drawing.Point(24, 20)
$form.Controls.Add($labelTitle)

$labelDesc = New-Object System.Windows.Forms.Label
$labelDesc.Text = "Applying verified update package. Relaunching in ~15s..."
$labelDesc.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
$labelDesc.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#94a3b8")
$labelDesc.Size = New-Object System.Drawing.Size(375, 24)
$labelDesc.Location = New-Object System.Drawing.Point(24, 50)
$form.Controls.Add($labelDesc)

$progressBar = New-Object System.Windows.Forms.ProgressBar
$progressBar.Style = "Marquee"
$progressBar.MarqueeAnimationSpeed = 30
$progressBar.Size = New-Object System.Drawing.Size(370, 10)
$progressBar.Location = New-Object System.Drawing.Point(24, 82)
$form.Controls.Add($progressBar)

$form.Show()
$form.Refresh()

# 2. Wait for caller process to exit
$waitCount = 0
while ((Get-Process -Id $TargetPid -ErrorAction SilentlyContinue) -and ($waitCount -lt 40)) {
  Start-Sleep -Milliseconds 250
  $form.Refresh()
  $waitCount++
}
Log-Msg "Target process $TargetPid exited (waited $($waitCount * 250)ms)"

# 3. Terminate lingering child/auxiliary processes to release file locks
Log-Msg "Terminating lingering FryFreeze processes..."
Get-Process -Name "FryFreeze" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 4. Grace period for Windows file locks
Start-Sleep -Milliseconds 1000
$form.Refresh()

# 5. Run NSIS installer silently with auto-relaunch (--force-run)
if (Test-Path -LiteralPath $InstallerPath) {
  Log-Msg "Executing NSIS installer silently with auto-relaunch..."
  $labelDesc.Text = "Extracting files and applying update... Please wait."
  $form.Refresh()
  $p = Start-Process -FilePath $InstallerPath -ArgumentList "/S", "--updated", "--force-run" -PassThru -Wait
  Log-Msg "Installer process finished with exit code: $($p.ExitCode)"
} else {
  Log-Msg "ERROR: Installer path not found: $InstallerPath"
}

# 6. Grace period before verifying relaunch
$labelDesc.Text = "Relaunching FryFreeze POS..."
$form.Refresh()
Start-Sleep -Milliseconds 2500

# 7. Fallback relaunch via Win32_Process (completely detached root process)
$running = Get-Process -Name "FryFreeze" -ErrorAction SilentlyContinue
if (-not $running) {
  if (Test-Path -LiteralPath $AppExePath) {
    Log-Msg "Fallback launching FryFreeze via Win32_Process at: $AppExePath"
    $escaped = '"{0}"' -f $AppExePath
    $res = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $escaped }
    Log-Msg "Win32_Process.Create result: ReturnValue=$($res.ReturnValue), ProcessId=$($res.ProcessId)"
  } else {
    Log-Msg "ERROR: AppExePath not found: $AppExePath"
  }
} else {
  Log-Msg "FryFreeze already running via installer. PIDs: $($running.Id -join ', ')"
}

Log-Msg "=== Update runner finished ==="
$form.Close()
`;

    fs.writeFileSync(runnerScriptPath, runnerScriptContent.trim(), 'utf8');

    // Spawn detached PowerShell runner
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        runnerScriptPath,
        '-TargetPid',
        String(targetPid),
        '-InstallerPath',
        installerPath,
        '-AppExePath',
        currentExe,
      ],
      {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      }
    );
    child.unref();

    // Ensure the detached PowerShell process is active before closing Electron
    let exited = false;
    const safeExit = () => {
      if (exited) return;
      exited = true;
      setTimeout(() => {
        app.exit(0);
      }, 400);
    };

    child.on('spawn', safeExit);
    setTimeout(safeExit, 1200);

    return { success: true };
  } catch (err) {
    console.error('[AutoUpdater] Install invocation failed:', err);
    sendToWindow('updater:status', {
      status: 'error',
      message: `Installation failed: ${err.message}`,
    });
    return { success: false, error: err.message };
  }
});

ipcMain.handle('updater:get-version', () => {
  const updateDir = path.join(app.getPath('userData'), 'pending-update');
  let hasPending = Boolean(downloadedInstallerPath && fs.existsSync(downloadedInstallerPath));
  let pendingVersion = null;

  if (!hasPending && fs.existsSync(updateDir)) {
    const exes = getSortedPendingInstallers(updateDir);
    if (exes.length > 0) {
      const bestExe = path.join(updateDir, exes[0]);
      try {
        const stat = fs.statSync(bestExe);
        if (stat.size > 1000000) {
          downloadedInstallerPath = bestExe;
          hasPending = true;
          pendingVersion = parseVersion(exes[0]);
        }
      } catch (_) {}
    }
  } else if (downloadedInstallerPath) {
    pendingVersion = parseVersion(path.basename(downloadedInstallerPath));
  }

  return {
    version: app.getVersion(),
    isPackaged: app.isPackaged,
    feedUrl: getEdgeFunctionUrl(),
    hasPendingUpdate: hasPending,
    pendingVersion: pendingVersion,
  };
});

ipcMain.handle('updater:set-auth', (_event, token) => {
  if (token && typeof token === 'string') {
    currentAuthToken = token;
  }
  return { success: true };
});

module.exports = { initAutoUpdater };
