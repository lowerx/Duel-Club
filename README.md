# Duel Club – cloud persistence patch

This patch keeps the latest Afterhours design, collaborative creation, 256-contender balanced brackets, stats, and no-crop fullscreen voting, but moves durable state and uploaded media out of Render's temporary filesystem.

## Install

See **UPDATE-INSTRUCTIONS.md**. Main requirements:
- Supabase project with `SETUP-SUPABASE.sql` run and a **public** bucket called `duel-media`.
- Render env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (server-only), and optionally `PACK_ADMIN_KEY` to restore legacy backups.
- Replace `server.js` and add `persistent-store.js` at repository root.

Native Node 22 `fetch` is used; no new npm dependencies, build commands, or app settings.

### Data layout

In Supabase, `public.duel_store` stores three JSONB documents: `packs`, `stats`, and `drafts`. Every change is saved before the API/Socket.IO action confirms success, with serial per-key writes. All new media is uploaded to a public `duel-media` storage bucket with unpredictable generated filenames.

`SUPABASE_URL` or `SUPABASE_SECRET_KEY` is missing: local file-based mode remains available for running Duel Club locally. An incomplete pair of variables or a failed cloud connection causes startup to fail, never quietly overwrite your cloud packs with sample packs.

### Tests

Run `node --test` (no dependencies needed for source/storage tests). No live Supabase credentials are included or used in tests.

### Privacy / limitations

Content you publish and files uploaded to the public bucket are viewable publicly by URL. Browser-held creator keys aren't user accounts; don't share your private admin key, ownership backup, or secret key. Studio membership/creator proof still depends on the original browser. Live game rooms aren't persistent; deployments interrupt a tournament in progress.
