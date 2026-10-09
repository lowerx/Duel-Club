# Update your existing GitHub / Render website

1. Unzip `duel-club-v2-update.zip`.
2. In your `lowerx/Duel-Club` GitHub repository, replace these three existing paths with the files in this ZIP:
   - `server.js`
   - `public/app.js`
   - `public/styles.css`
3. Commit the three changes on branch `main`. Render will usually deploy automatically.
4. Keep your existing `package.json` and `package-lock.json` (and `npm ci` build command). This update adds no new dependencies.
5. When Render shows **Live**, hard-refresh the page (Cmd+Shift+R on Mac).
6. Click **Make one together**, share the studio link, and have friends contribute GIFs/videos/photos.

IMPORTANT: Render Free's local disk is ephemeral: uploaded files, published custom packs, and collaborative drafts can disappear on restarts or redeploys. For permanent storage, you'll need a persistent volume or hosted database/media storage. See README.md in the complete version.
