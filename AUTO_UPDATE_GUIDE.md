# FryFreeze Wireless Auto-Updates Guide (Supabase Storage + Edge Functions)

This guide explains how FryFreeze delivers **automatic, wireless desktop updates** to client terminals without risk of data loss.

---

## 1. System Architecture

```
[ Private GitHub Repo ]
        │
        ▼ (Builds Windows NSIS Release v2.1.0)
[ installer-output/ ]
  ├── FryFreeze Setup 2.1.0.exe
  ├── latest.yml (Cryptographic SHA-512 & blockmap hashes)
  └── FryFreeze Setup 2.1.0.exe.blockmap
        │
        ▼ (npm run release:publish)
[ Private Supabase Storage: 'app-updates' ] (Locked down, no public access)
        ▲
        │ (Short-lived 5-min signed download URLs)
[ Supabase Edge Function: 'app-updates' ]
  ├── Reuses existing Supabase Authentication
  ├── Enforces Remote Kill-Switch (Stopped shop = No updates)
  └── Generates signed URLs & redirects electron-updater (HTTP 302)
        ▲
        │ (Checks every 45 min + on startup)
[ Electron Desktop App (electron-updater) ]
  ├── Verifies SHA-512 cryptographic checksum
  ├── Shows in-app progress bar: "Downloading update... 45%"
  ├── Prompts cashier: "Restart & Update Now"
  └── SQLite DB in %APPDATA%\FryFreezeDesktop\data (NEVER OVERWRITTEN)
```

---

## 2. Supabase Storage Setup (One-Time)

1. Open your [Supabase SQL Editor](https://supabase.com/dashboard/project/_/sql).
2. Run [`supabase_storage_update_setup.sql`](file:///D:/frozonbowl/local-billsree-main/supabase_storage_update_setup.sql):
   - Creates the private storage bucket `app-updates` with `public = false`.
   - Confines access exclusively to the `service_role` (Edge Function and deploy script).

---

## 3. Deploying the Supabase Edge Function

The Edge Function code is located in [`supabase/functions/app-updates/index.ts`](file:///D:/frozonbowl/local-billsree-main/supabase/functions/app-updates/index.ts).

To deploy it to your Supabase project:
```bash
# Log in to Supabase CLI (if not already logged in)
npx supabase login

# Link your project (Project Ref: qruqelexhfgqmdlsrlug)
npx supabase link --project-ref qruqelexhfgqmdlsrlug

# Deploy the Edge Function
npx supabase functions deploy app-updates --no-verify-jwt
```

The function will be live at:
`https://qruqelexhfgqmdlsrlug.supabase.co/functions/v1/app-updates`

---

## 4. How to Publish a New Update

Whenever you prepare a new release (e.g. from v2.1.0 to v2.2.0):

1. **Bump Version in `package.json`**:
   Change `"version": "2.2.0"`.

2. **Build the Installer**:
   ```bash
   npm run build:nsis
   ```
   This generates `installer-output/FryFreeze Setup 2.2.0.exe`, `latest.yml`, and `*.blockmap`.

3. **Publish to Supabase in 1 Command**:
   ```bash
   npm run release:publish
   ```
   This executes [`scripts/upload-release-to-supabase.mjs`](file:///D:/frozonbowl/local-billsree-main/scripts/upload-release-to-supabase.mjs), which:
   - Authenticates with Supabase using `SUPABASE_SERVICE_ROLE_KEY`.
   - Uploads `latest.yml`, the `.exe`, and `.blockmap` to `app-updates`.
   - Verifies signed URL generation.

---

## 5. Client Behavior on Client Computers

- **Automatic Background Checks**:
  Every 45 minutes and 12 seconds after launch, the app contacts the Edge Function.
- **Offline Safety**:
  If the computer has no internet, the check silently skips without any disruption to cashier sales, thermal printing, or offline billing.
- **Data Protection**:
  The SQLite database is kept in `%APPDATA%\FryFreezeDesktop\data\ledgerstore.db`. NSIS installer updates never touch this folder, so sales, bills, and products are permanently preserved.
- **In-App Progress Bar**:
  A floating notification appears:
  - *"Downloading Wireless Update v2.1.0 (45%)"*
  - Once complete: *"Update Ready to Install! [Restart & Update Now]"*
- **Developer Console**:
  The Developer Console (`http://127.0.0.1:9876/developer`) includes a **Wireless Cloud Updates** panel with manual *"Check for Updates"* and progress stats.

