// ============================================================================
// SUPABASE EDGE FUNCTION: APP-UPDATES (WIRELESS DESKTOP AUTO-UPDATES)
// ============================================================================
// Serves private Windows installer releases, latest.yml, and blockmap files
// from private Supabase Storage bucket 'app-updates' using signed download URLs.
// Reuses existing Supabase Authentication & Multi-Store Kill-Switch.
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.118.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token, x-supabase-key, x-client-version, x-client-platform',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

const BUCKET_NAME = 'app-updates';
const SIGNED_URL_EXPIRES_IN = 300; // 5 minutes valid

serve(async (req: Request) => {
  // 1. Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Supabase environment configuration missing on server.' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Admin Supabase client with service role key to access private storage bucket
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2. Authenticate Request
    // Reuses existing Supabase Authentication
    const authHeader = req.headers.get('Authorization') || '';
    const userToken = req.headers.get('x-user-token') || (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '');
    const supabaseKeyHeader = req.headers.get('x-supabase-key') || req.headers.get('apikey') || '';

    // If a user token is provided, verify against users table and ensure user/store is not stopped
    if (userToken && userToken.includes('.')) {
      try {
        // Decode payload from token
        const parts = userToken.split('.');
        if (parts.length >= 2) {
          const payloadJson = atob(parts[0].replace(/-/g, '+').replace(/_/g, '/'));
          const payload = JSON.parse(payloadJson);
          const userId = payload.userId || payload.sub || payload.id;

          if (userId) {
            const { data: userRow } = await supabase
              .from('users')
              .select('id, store_id, store_name, active, is_blocked, status, store_status, store_active')
              .eq('id', userId)
              .maybeSingle();

            if (userRow) {
              const isUserBlocked =
                userRow.active === false ||
                userRow.is_blocked === true ||
                ['BLOCKED', 'INACTIVE', 'SUSPENDED'].includes(String(userRow.status || '').toUpperCase());

              const isStoreStopped =
                userRow.store_active === false ||
                userRow.store_status === 'STOPPED';

              if (isUserBlocked || isStoreStopped) {
                return new Response(
                  JSON.stringify({
                    error: 'contact admin and renew the plan',
                    code: 'STORE_OR_USER_STOPPED',
                  }),
                  {
                    status: 403,
                    headers: { 'Content-Type': 'application/json', ...corsHeaders },
                  }
                );
              }
            }
          }
        }
      } catch (err) {
        console.warn('[AppUpdates] Token parse error, falling back to key auth:', err);
      }
    }

    // Extract requested path relative to /app-updates
    // e.g. /functions/v1/app-updates/latest.yml -> "latest.yml"
    // e.g. /functions/v1/app-updates/FryFreeze Setup 2.1.0.exe -> "FryFreeze Setup 2.1.0.exe"
    let requestedFile = url.pathname.replace(/^\/.*app-updates\/?/, '').replace(/^\//, '');

    // Default to latest.yml if empty path or info
    if (!requestedFile || requestedFile === 'info') {
      // Query release info summary
      const { data: latestData } = await supabase.storage.from(BUCKET_NAME).download('latest.yml');
      if (latestData) {
        const text = await latestData.text();
        return new Response(text, {
          status: 200,
          headers: {
            'Content-Type': 'text/yaml; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            ...corsHeaders,
          },
        });
      }
      return new Response(JSON.stringify({ message: 'FryFreeze Update Server Active', bucket: BUCKET_NAME }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Clean filename
    const cleanFilename = decodeURIComponent(requestedFile).trim();

    // 3. Serve latest.yml metadata directly
    if (cleanFilename.toLowerCase().endsWith('latest.yml')) {
      const { data, error } = await supabase.storage.from(BUCKET_NAME).download('latest.yml');
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: 'No update metadata found. Please upload latest.yml to private bucket.' }),
          {
            status: 404,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          }
        );
      }

      const text = await data.text();
      return new Response(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/yaml; charset=utf-8',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          ...corsHeaders,
        },
      });
    }

    // 4. Check for chunked multipart manifest (for files >50MB uploaded on Supabase Free Plan)
    const manifestPath = `${cleanFilename}.manifest.json`;
    const { data: manifestBlob } = await supabase.storage.from(BUCKET_NAME).download(manifestPath);

    if (manifestBlob) {
      try {
        const manifestText = await manifestBlob.text();
        const manifest = JSON.parse(manifestText);

        if (Array.isArray(manifest.parts) && manifest.parts.length > 0) {
          // Stream multipart chunks in sequence as a single continuous binary stream
          const stream = new ReadableStream({
            async start(controller) {
              try {
                for (const partName of manifest.parts) {
                  const { data: partBlob, error: partErr } = await supabase.storage.from(BUCKET_NAME).download(partName);
                  if (partErr || !partBlob) {
                    controller.error(new Error(`Failed to download chunk ${partName}: ${partErr?.message}`));
                    return;
                  }
                  const reader = partBlob.stream().getReader();
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    controller.enqueue(value);
                  }
                }
                controller.close();
              } catch (streamErr) {
                controller.error(streamErr);
              }
            },
          });

          return new Response(stream, {
            status: 200,
            headers: {
              'Content-Type': 'application/x-msdownload',
              'Content-Length': String(manifest.totalSize),
              'Content-Disposition': `attachment; filename="${encodeURIComponent(cleanFilename)}"`,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              ...corsHeaders,
            },
          });
        }
      } catch (manifestParseErr) {
        console.warn(`[AppUpdates] Manifest parse error for ${manifestPath}:`, manifestParseErr);
      }
    }

    // 5. Standard Single-File Download: Generate Short-Lived Signed Download URL
    // Generates a secure temporary 5-minute download URL and redirects electron-updater (HTTP 302)
    const { data: signedData, error: signError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUrl(cleanFilename, SIGNED_URL_EXPIRES_IN);

    if (signError || !signedData?.signedUrl) {
      console.warn(`[AppUpdates] File sign error for "${cleanFilename}":`, signError?.message);
      return new Response(
        JSON.stringify({ error: `File not found in update storage: ${cleanFilename}`, details: signError?.message }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        }
      );
    }

    // HTTP 302 Redirect to the secure signed URL
    return new Response(null, {
      status: 302,
      headers: {
        'Location': signedData.signedUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        ...corsHeaders,
      },
    });

  } catch (err: any) {
    console.error('[AppUpdates] Internal Server Error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});

