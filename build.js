import { build as viteBuild } from 'vite';
import * as esbuild from 'esbuild';
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

// Clean and optimize SQLite starter database before packaging
const dbFile = path.resolve('data', 'ledgerstore.db');
if (fs.existsSync(dbFile)) {
  try {
    const db = new DatabaseSync(dbFile);
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
    db.exec('VACUUM;');
    db.close();
    console.log('✅ SQLite starter database checkpointed and vacuumed.');
  } catch (err) {
    console.warn('Notice: Could not vacuum database:', err);
  }
}

console.log('Building Vite client bundle...');
await viteBuild();

console.log('Bundling server API for Vercel/Node...');
await esbuild.build({
  entryPoints: ['server/apiApp.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: 'api/index.js',
});

console.log('Bundling production server runner...');
await esbuild.build({
  entryPoints: ['server.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: 'dist/server.js',
});

console.log('Bundling embedded server for Electron...');
await esbuild.build({
  entryPoints: ['server/embeddedServer.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  minify: true,
  treeShaking: true,
  external: ['node:sqlite'],
  outfile: 'dist/server.cjs',
});

console.log('Build completed successfully!');
