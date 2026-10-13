# Duel Club — Permanent storage update (Render + Supabase)

This is an update for your **existing** Duel Club repository. It leaves the design, favicon, fullscreen voting, balanced brackets, stats and 256-contender features alone.

## IMPORTANT — before touching Render or GitHub

**Back up any packs still visible on your live website before redeploying or changing Render Environment variables.** Render Free loses local uploads and JSON files on redeploy/restart, including a deploy triggered by a settings change.

If you have **no existing custom packs left to save**, skip directly to Step 1.

If you **do** have existing custom packs:

1. Open the current, working Duel Club page on Render in **the browser you used to create the packs**.
2. Open Developer Tools → Console (Mac Chrome/Brave: Cmd + Option + J).
3. Open `migration/BACKUP-OLD-SITE.js` from this ZIP in a text editor; copy its whole contents and paste into the Console, then press Enter.
4. It fetches every publicly listed pack and its stats, shared studios remembered in this browser, and your locally uploaded images/GIFs/videos, and downloads one large `duel-club-backup-YYYY-MM-DD.json` file.
5. **Confirm the download actually finished before continuing.** The JSON may be very large for video-heavy packs. It contains your private creator keys — do not share it or upload it to a public GitHub repository. If it fails, DO NOT update the server until you have another copy of important packs/media.
6. When the permanent-storage version is running, use `migration/RESTORE-ON-NEW-SITE.js` as described in Step 5. If a studio wasn't saved in this browser's recent studio list, you'll need its invite link and/or manually recreate it.

> Already lost by previous Render restarts? The update cannot recover erased server files.

## Step 1 — Create free cloud storage

1. Sign in at https://supabase.com/dashboard and create a new project. Choose a strong **database password**; you don't need to paste that password into Render.
2. Go to **SQL Editor → New query**. Copy the entire `SETUP-SUPABASE.sql` file and click **Run**. It creates an RLS-protected `duel_store` table for packs, unfinished studios and vote statistics.
3. Go to **Storage → New bucket**. Name the bucket **`duel-media`** (exactly), and turn on **Public bucket** so that photos/videos can display for friends who view packs. Do not give visitors general upload access: the backend uses the secret key. You can use the default bucket file-size limit; the app itself accepts up to 40 MB videos and 15 MB images.

## Step 2 — Get Supabase credentials

In Supabase **Project Settings → API Keys** (or the Connect dialog), copy:

- **Project URL** — like `https://abcxyz.supabase.co`.
- **Secret key** (`sb_secret_...`) — NOT the publishable/anon key.

**Never paste the secret key into GitHub, frontend JavaScript, a public message, or a screenshot.** The server reads it from Render only.

## Step 3 — Set Render Environment variables

Open your EXISTING Render Web Service → **Environment**, and add:

| Key | Value |
| --- | --- |
| `SUPABASE_URL` | your Supabase project URL |
| `SUPABASE_SECRET_KEY` | your private Supabase **secret** key |
| `PACK_ADMIN_KEY` | existing admin key for old packs, or make a new random secret at least 16 characters (needed for backup restoration) |

Save. This may trigger an automatic redeploy; only do it AFTER finishing the backup above. Your existing `npm ci`, `npm start`, and Node 22 settings can stay unchanged.

## Step 4 — Upload only two code files to GitHub

At https://github.com/lowerx/Duel-Club on `main`, upload/replace:

```text
server.js            (REPLACE)
persistent-store.js  (NEW, in repository ROOT next to server.js)
```

Commit. Render will redeploy. **Do not delete** the `public/` folder, `game-logic.js`, `package.json`, `package-lock.json` or any icons; you do NOT need a new Render service.

When deployment is live, visit:

`https://YOUR-SITE.onrender.com/api/health`

You should see exactly the important part: `"storage":"supabase"`. If it says `local`, at least one environment setting is missing. If the new server won't start, check Render logs for `Startup refused` and confirm the SQL table, bucket, URL and secret key. It deliberately refuses to fall back to empty local storage when Supabase fails.

## Step 5 — Restore old content (only if you created a backup)

1. Open the **updated** Duel Club site, preferably in the same browser as before.
2. Open Developer Tools → Console (Cmd + Option + J).
3. Copy/paste all of `migration/RESTORE-ON-NEW-SITE.js` and press Enter.
4. Select your saved backup JSON and enter `PACK_ADMIN_KEY` when prompted.
5. The script reuploads local media, restores packs, statistics, collaborative studios and browser-local owner keys. Wait for the completion confirmation, then refresh.

**Do not** put the backup or admin key on GitHub. If restoring hundreds of videos exceeds your Supabase quota, you'll need to use smaller media files or upgrade storage. The restore script skips pack IDs/studio codes already in the database to avoid duplicates; if a restore fails midway, fix the issue and rerun (you may have leftover media uploads).

## What is kept vs what still resets?

| Data | After the change |
| --- | --- |
| Published custom packs | Stored in Supabase Postgres, survive new GitHub/Render deployments |
| Shared studio entries and status | Stored in Supabase Postgres |
| Match win rates, vote counts, trophies | Stored in Supabase Postgres |
| New JPG/PNG/WebP/GIF/MP4/WebM/MOV uploads | Stored in Supabase Storage, not Render's temporary disk |
| Live rooms / ongoing games | Memory only — a server restart still ends active sessions |
| My Space ownership, personal solo draft | Browser localStorage — same browser only, unless you export it |

## Cost and storage limits

Supabase Free currently includes about **500 MB of Postgres database data**, **1 GB total file storage** and a **50 MB max upload file size**; a free project may pause after approximately one week of inactivity. Pausing is not the same as deleting your packs; visit the Supabase dashboard to resume if needed. Keep independent backups of important media and pack data.

Render Free still sleeps after 15 minutes of inactivity; Supabase stores data separately, so sleeping/redeploying your website no longer erases cloud packs and photos. **The app has not been tested with your live Supabase project**; verify by creating one small test pack and redeploying after setup.

For a simpler paid alternative: Render paid Web Service + persistent disk mounted at `/opt/render/project/src/data` with `DATA_DIR=/opt/render/project/src/data` can also preserve current local storage (set up before adding new content). Free Render services **cannot** attach persistent disks.
