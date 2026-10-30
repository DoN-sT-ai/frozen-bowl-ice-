import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Multi-path dotenv resolution (supports local dev, packaged Electron, and custom data dirs)
const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR, '.env') : null,
  path.resolve(currentDir, '..', '.env'),
  path.resolve(currentDir, '..', '..', '.env'),
].filter(Boolean) as string[];

for (const envFile of envCandidates) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile });
    break;
  }
}

export const DEFAULT_SUPABASE_URL = 'https://sxzaalvmkkdnczrtzitd.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_0eosb1s_HO_94uv-4Rnlkw_9CVWYBGM';

export function getResolvedSupabaseConfig() {
  let url = (process.env.SUPABASE_URL || '').trim();
  let key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

  // If not in process.env, try loading from local SQLite developer_configs
  if (!url || !key) {
    try {
      const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
      const dbPath = path.resolve(dataDir, 'ledgerstore.db');
      if (fs.existsSync(dbPath)) {
        const { DatabaseSync } = require('node:sqlite');
        const db = new DatabaseSync(dbPath);
        const urlRow = db.prepare('SELECT value FROM developer_configs WHERE key = ?').get('SUPABASE_URL') as any;
        const keyRow = db.prepare('SELECT value FROM developer_configs WHERE key = ?').get('SUPABASE_ANON_KEY') as any;
        db.close();
        if (urlRow?.value) url = urlRow.value.trim();
        if (keyRow?.value) key = keyRow.value.trim();
      }
    } catch (_) {}
  }

  // Fallback to project defaults
  if (!url || url.includes('your-project-id')) {
    url = DEFAULT_SUPABASE_URL;
  }
  if (!key || key.includes('your-supabase')) {
    key = DEFAULT_SUPABASE_KEY;
  }

  // Synchronize process.env
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_ANON_KEY = key;
  process.env.SUPABASE_SERVICE_ROLE_KEY = key;

  return { url, key };
}

const { url: initialUrl, key: initialKey } = getResolvedSupabaseConfig();

export const isSupabaseConfigured = Boolean(
  initialUrl &&
  initialKey &&
  !initialUrl.includes('your-project-id') &&
  !initialKey.includes('your-supabase')
);

export const supabase: SupabaseClient = createClient(initialUrl, initialKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});



