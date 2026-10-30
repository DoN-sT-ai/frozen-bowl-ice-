const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');

// Ensure dist/server.cjs exists before launching
const serverCjs = path.resolve(rootDir, 'dist', 'server.cjs');
if (!fs.existsSync(serverCjs)) {
  console.log('⚡ dist/server.cjs not found. Building app bundles first...');
  try {
    execSync('node build.js', { cwd: rootDir, stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to build application:', err);
    process.exit(1);
  }
}

console.log('🚀 Launching LedgerStore Desktop Window...');

let electronExe;
try {
  electronExe = require('electron');
} catch (_) {
  electronExe = null;
}

const mainScript = path.resolve(__dirname, 'main.cjs');
let electronProcess;

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

if (electronExe && typeof electronExe === 'string' && fs.existsSync(electronExe)) {
  electronProcess = spawn(electronExe, [mainScript], {
    cwd: rootDir,
    env: childEnv,
    stdio: 'inherit',
  });
} else {
  const electronCli = path.resolve(rootDir, 'node_modules', 'electron', 'cli.js');
  electronProcess = spawn(process.execPath, [electronCli, mainScript], {
    cwd: rootDir,
    env: childEnv,
    stdio: 'inherit',
  });
}

electronProcess.on('exit', (code) => {
  console.log(`[LedgerStore] App closed (code ${code || 0})`);
  process.exit(code || 0);
});
