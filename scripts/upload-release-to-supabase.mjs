#!/usr/bin/env node
// ============================================================================
// RELEASE PUBLISHER: UPLOAD DESKTOP UPDATES TO SUPABASE STORAGE
// ============================================================================
// Uploads 'installer-output/latest.yml', 'FryFreeze Setup <version>.exe',
// and blockmap files to the private Supabase Storage bucket 'app-updates'.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

// Load environment variables
dotenv.config({ path: path.join(rootDir, '.env') });

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)?.trim();

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const BUCKET_NAME = 'app-updates';
const outputDir = path.join(rootDir, 'installer-output');

async function publishRelease() {
  console.log('\n=============================================================');
  console.log('🚀 FRYFREEZE WIRELESS UPDATE RELEASE PUBLISHER');
  console.log(`🌐 Supabase Target: ${supabaseUrl}`);
  console.log(`📦 Storage Bucket: ${BUCKET_NAME} (Private)`);
  console.log('=============================================================\n');

  if (!fs.existsSync(outputDir)) {
    console.error(`❌ Output directory "${outputDir}" not found. Please run "npm run build:nsis" first.`);
    process.exit(1);
  }

  const latestYmlPath = path.join(outputDir, 'latest.yml');
  if (!fs.existsSync(latestYmlPath)) {
    console.error(`❌ latest.yml not found in "${outputDir}". Please run "npm run build:nsis" first.`);
    process.exit(1);
  }

  const latestContent = fs.readFileSync(latestYmlPath, 'utf8');
  const versionMatch = latestContent.match(/version:\s*([^\s]+)/);
  const targetVersion = versionMatch ? versionMatch[1].trim() : '2.1.0';

  console.log(`🎯 Publishing Release: Version ${targetVersion}`);

  // 1. Ensure private bucket exists or prompt setup
  console.log(`[1/3] Checking Supabase Storage bucket "${BUCKET_NAME}"...`);
  try {
    const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
    if (bucketError) {
      console.warn(`[Notice] Bucket query: ${bucketError.message}. Proceeding with direct upload.`);
    } else {
      const exists = buckets.some((b) => b.name === BUCKET_NAME);
      if (!exists) {
        console.log(`Creating private bucket "${BUCKET_NAME}"...`);
        const { error: createErr } = await supabase.storage.createBucket(BUCKET_NAME, {
          public: false,
        });
        if (createErr && !createErr.message.includes('already exists')) {
          console.warn(`[Notice] If bucket creation fails, run "supabase_storage_update_setup.sql" in Supabase SQL Editor.`);
        } else {
          console.log(`✅ Private bucket "${BUCKET_NAME}" ready.`);
        }
      } else {
        console.log(`✅ Private bucket "${BUCKET_NAME}" confirmed.`);
      }
    }
  } catch (err) {
    console.warn(`[Notice] Bucket check exception:`, err.message);
  }

  // 2. Scan installer output files for the current version
  console.log(`\n[2/3] Scanning release artifacts for v${targetVersion}...`);
  const files = fs.readdirSync(outputDir);
  const artifactsToUpload = files.filter((f) => {
    const lower = f.toLowerCase();
    if (lower === 'latest.yml') return true;
    if (f.includes(targetVersion)) return true;
    return false;
  });

  if (artifactsToUpload.length === 0) {
    console.error(`❌ No release artifacts found for v${targetVersion} in "${outputDir}".`);
    process.exit(1);
  }

  console.log(`Found ${artifactsToUpload.length} artifacts to upload for v${targetVersion}:`);
  artifactsToUpload.forEach((f) => console.log(`  • ${f}`));

  // 3. Upload files to private Supabase bucket
  console.log(`\n[3/3] Uploading artifacts to private Supabase Storage...`);
  for (const filename of artifactsToUpload) {
    const filePath = path.join(outputDir, filename);
    const stat = fs.statSync(filePath);
    const sizeMb = (stat.size / (1024 * 1024)).toFixed(2);

    console.log(`⬆️  Uploading "${filename}" (${sizeMb} MB)...`);
    const fileBuffer = fs.readFileSync(filePath);

    let mimeType = 'application/octet-stream';
    if (filename.endsWith('.yml')) mimeType = 'text/yaml';
    else if (filename.endsWith('.exe')) mimeType = 'application/x-msdownload';

    // If file is larger than 45 MB, upload in chunks to bypass Supabase Free tier 50 MB gateway cap
    const MAX_SINGLE_UPLOAD_SIZE = 45 * 1024 * 1024; // 45 MB
    const CHUNK_SIZE = 35 * 1024 * 1024; // 35 MB per part

    if (stat.size > MAX_SINGLE_UPLOAD_SIZE) {
      console.log(`📦 File size (${sizeMb} MB) exceeds single upload threshold. Initiating multipart chunking (35 MB parts)...`);
      const totalParts = Math.ceil(stat.size / CHUNK_SIZE);
      const partNames = [];

      let uploadSuccess = true;
      for (let i = 0; i < totalParts; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, stat.size);
        const partBuffer = fileBuffer.subarray(start, end);
        const partName = `${filename}.part${i}`;
        const partSizeMb = (partBuffer.length / (1024 * 1024)).toFixed(2);

        console.log(`   ⬆️  Uploading part ${i + 1}/${totalParts}: "${partName}" (${partSizeMb} MB)...`);
        
        let uploadAttempt = 0;
        let partError = null;
        while (uploadAttempt < 3) {
          uploadAttempt++;
          const res = await supabase.storage
            .from(BUCKET_NAME)
            .upload(partName, partBuffer, {
              contentType: 'application/octet-stream',
              upsert: true,
            });
          partError = res.error;
          if (!partError) break;
          console.warn(`   ⚠️ Part ${i + 1} attempt ${uploadAttempt} notice: ${partError.message || partError}. Retrying in 2s...`);
          await new Promise((r) => setTimeout(r, 2000));
        }

        if (partError) {
          console.error(`   ❌ Failed to upload ${partName} after 3 attempts:`, partError.message || partError);
          uploadSuccess = false;
          break;
        }
        partNames.push(partName);
        console.log(`   ✅ Part ${i + 1}/${totalParts} uploaded!`);
      }

      if (!uploadSuccess) {
        console.error(`\n❌ Multipart upload aborted due to error.`);
        process.exit(1);
      }

      // Upload multipart manifest
      const manifest = {
        filename,
        totalSize: stat.size,
        chunkSize: CHUNK_SIZE,
        partCount: partNames.length,
        parts: partNames,
        uploadedAt: new Date().toISOString(),
      };

      const manifestBuffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');
      const manifestName = `${filename}.manifest.json`;
      console.log(`   ⬆️  Uploading manifest "${manifestName}"...`);
      const { error: manifestErr } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(manifestName, manifestBuffer, {
          contentType: 'application/json',
          upsert: true,
        });

      if (manifestErr) {
        console.error(`   ❌ Failed to upload manifest:`, manifestErr.message);
        process.exit(1);
      }

      console.log(`   ✅ "${filename}" uploaded completely across ${totalParts} chunks with manifest!`);
      continue;
    }

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(filename, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error(`\n❌ Upload failed for "${filename}": ${uploadError.message}`);
      console.log(`💡 Tip: Run "supabase_storage_update_setup.sql" in your Supabase SQL Editor to grant storage bucket permissions.`);
      process.exit(1);
    }
    console.log(`   ✅ "${filename}" uploaded successfully!`);
  }

  // 4. Test signed URL generation
  const exeFile = artifactsToUpload.find((f) => f.endsWith('.exe')) || 'latest.yml';
  const { data: testSign } = await supabase.storage
    .from(BUCKET_NAME)
    .createSignedUrl(exeFile, 300);

  console.log('\n=============================================================');
  console.log(`🎉 RELEASE v${targetVersion} PUBLISHED TO SUPABASE CLOUD!`);
  console.log(`📡 Edge Function Update Feed: ${supabaseUrl}/functions/v1/app-updates`);
  if (testSign?.signedUrl) {
    console.log(`🔗 Signed Download Verification (5 min valid):\n   ${testSign.signedUrl.slice(0, 95)}...`);
  }
  console.log('=============================================================\n');
}

publishRelease().catch((err) => {
  console.error('Fatal error publishing release:', err);
  process.exit(1);
});
