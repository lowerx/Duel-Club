# ✳ Duel Club

A responsive, multiplayer, UwUFUFU-inspired knockout-ranking website. Create photo packs and debate them with friends, live.

## Features

- Create a pack with 2–64 contenders: names, emojis, uploaded photos, or direct image URLs.
- Share a pack through its direct URL.
- Create a private room with a six-character code and shareable invite link.
- Up to 30 players per room; no accounts needed, just nicknames.
- Live, synchronized voting: each person votes once per matchup, and can change their choice before the reveal.
- A host reveals votes and advances a randomized elimination bracket; byes work for non-power-of-two pack sizes.
- Ties use the host's vote (or a random tiebreak if the host abstains).
- Winner and match-history recap.
- Packs and photo uploads are stored on disk; rooms are stored in memory.

## Run on your Mac / computer

Install [Node.js](https://nodejs.org/) 20 or newer. In Terminal:

```bash
cd duel-club
npm install
npm start
```

Open **http://localhost:3000** in your browser. `npm run dev` restarts automatically when server files change.

To try the multiplayer experience from other devices **on the same Wi-Fi**, use your computer's local IP address instead of `localhost`, e.g. `http://192.168.1.50:3000`. Allow incoming traffic through your firewall. For friends elsewhere, deploy it to the Internet (below).

## Quickest way to play with friends online (from your Mac)

Once the local site is running with `npm start`, you can temporarily put it online without signing up for hosting. Install [cloudflared](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) (on a Mac with Homebrew: `brew install cloudflared`), then **open a second Terminal window** and run:

```bash
cloudflared tunnel --url http://localhost:3000
```

Cloudflare will print a temporary HTTPS address ending in `trycloudflare.com`. Open that URL and share **that URL** with friends. Then start a room and send the room invite link from inside the site. Keep **both terminals** running while you play; the link stops working when you close the tunnel. Quick Tunnels are meant for testing, not 24/7 hosting. This tunnel supports the app's WebSocket-based live voting.

## Deploy it so friends can join anywhere

This is a normal long-running **Node.js WebSocket server**; static-only hosting (GitHub Pages, Netlify static) cannot run multiplayer by itself.

### Railway or other container hosting

1. Create a GitHub repository and upload these source files (don't upload `node_modules`).
2. Create a new web service on a platform that supports Node.js and WebSockets, for example [Railway](https://railway.com/) or [Render](https://render.com/). Connect your repository. The included Dockerfile works without build configuration.
3. Set `DATA_DIR=/app/data` and attach **persistent storage at `/app/data`** (a volume/disk) if you want packs and photos to survive redeployment.
4. Deploy and open the HTTPS domain assigned by the host. The application automatically listens on `PORT` (or 3000).
5. Create a pack → **Host a room** → **Copy invite link** → share it with friends.

If your host uses an ephemeral disk, packs and uploaded images will **disappear** after a redeploy/restart. Without persistent disk, it's suitable for a quick demo only.

### On any computer with Docker

```bash
docker compose up --build -d
```

This uses a named volume to keep packs and photos. You must still configure DNS, HTTPS, a reverse proxy, and networking if friends are joining over the Internet.

## Important limitations of this starter version

- Not a public SaaS service: no accounts, privacy controls, moderation, or abuse prevention. Pack links are unlisted but accessible to anyone with the link; uploaded packs appear on the explore page. Do not upload private or sensitive pictures without consent.
- Rooms, votes, and brackets live in server memory and reset on restart. Host and players can reconnect during a normal connection interruption.
- One server instance only. Do **not** scale to multiple replicas without a shared store and Socket.IO adapter.
- The room code is not a secure password. Host identity is based on a locally stored random ID, not authenticated user accounts.
- External image URLs rely on the external website allowing hotlinking. Uploaded pictures are more reliable.
- Suitable for a personal friend group, not hardened for untrusted public use. Production hardening would include authentication, rate limiting, file validation/processing, privacy settings, moderation, and a database + object storage.

## Project structure

```
server.js                 Express APIs + Socket.IO rooms / voting
game-logic.js             Bracket pairing, counts, tiebreaks
tests/                    Automated bracket tests
public/index.html         App shell
public/styles.css         Responsive styling
public/app.js             Homepage, creator, lobby, voting, results
Dockerfile                Container deployment
docker-compose.yml        Local Docker + persistent volume
```

## Fix in updated version (October 9, 2026)

Fixed the **Continue** button in the host/join nickname dialog: delegated form submission now reads the submitted form correctly. The original handler mistakenly read `event.currentTarget` (the document), which could make clicking Continue appear to do nothing.

If you're updating an existing copy, replace only `public/app.js` with the updated file and refresh the browser; **keep your `data/` folder** to preserve your custom packs and uploads. Restart `npm start` if necessary. Run `npm test` to verify the bracket and nickname-dialog tests.
