import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import multer from 'multer';
import { startRound, score, resolveWinner } from './game-logic.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const storeFile = path.join(dataDir, 'packs.json');

const trips = [
  ['Paris', 'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=960&q=80'],
  ['Tokyo', 'https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=960&q=80'],
  ['New York', 'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=960&q=80'],
  ['Rome', 'https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=960&q=80'],
  ['Barcelona', 'https://images.unsplash.com/photo-1539037116277-4db20889f2d4?w=960&q=80'],
  ['Santorini', 'https://images.unsplash.com/photo-1613395877344-13d4a8e0d49e?w=960&q=80'],
  ['Swiss Alps', 'https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=960&q=80'],
  ['Bali', 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=960&q=80']
].map(([name, image]) => ({ id: crypto.randomUUID(), name, image, emoji: '🌍' }));
const food = [
  ['Pizza','🍕'], ['Sushi','🍣'], ['Burger','🍔'], ['Tacos','🌮'],
  ['Pasta','🍝'], ['Ramen','🍜'], ['Dumplings','🥟'], ['Croissant','🥐']
].map(([name,emoji]) => ({ id: crypto.randomUUID(), name, emoji, image: '' }));
const plans = [
  ['Movie night','🎬'], ['Beach day','🏖️'], ['Gaming marathon','🎮'], ['Road trip','🚗'],
  ['Concert','🎤'], ['House party','🪩'], ['Hiking','🥾'], ['Sleep all day','😴']
].map(([name,emoji]) => ({ id: crypto.randomUUID(), name, emoji, image: '' }));
const seedPacks = [
  { id: 'dream-destinations', title: 'Dream destinations', description: 'Only one place gets the plane ticket. Where are we going?', category: 'Travel', author: 'Duel Club', createdAt: new Date().toISOString(), items: trips },
  { id: 'ultimate-food-fight', title: 'The ultimate food fight', description: 'Settle the most important dinner debate of all time.', category: 'Food', author: 'Duel Club', createdAt: new Date().toISOString(), items: food },
  { id: 'perfect-weekend', title: 'The perfect weekend', description: 'Eight plans. One undefeated way to spend a Saturday.', category: 'Lifestyle', author: 'Duel Club', createdAt: new Date().toISOString(), items: plans }
];
let packs;
try {
  packs = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  if (!Array.isArray(packs)) throw new Error('Invalid file');
} catch {
  packs = seedPacks;
  savePacks();
}
function savePacks() {
  const tmp = `${storeFile}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(packs, null, 2));
  fs.renameSync(tmp, storeFile);
}
function publicPack(pack, { full = false } = {}) {
  const { id, title, description, category, author, createdAt, items } = pack;
  return { id, title, description, category, author, createdAt, itemCount: items.length,
    items: full ? items : items.slice(0, 4) };
}
function safeString(value, max = 100) { return String(value ?? '').trim().slice(0, max); }
function safeImage(value) {
  const s = safeString(value, 1000);
  if (!s) return '';
  if (/^https?:\/\//i.test(s) || /^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp|gif)$/i.test(s)) return s;
  return '';
}
function shuffle(items) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/packs', (_req, res) => res.json(packs.slice().reverse().map(p => publicPack(p))));
app.get('/api/packs/:id', (req, res) => {
  const pack = packs.find(p => p.id === req.params.id);
  if (!pack) return res.status(404).json({ error: 'This pack was not found.' });
  res.json(publicPack(pack, { full: true }));
});
app.post('/api/packs', (req, res) => {
  const body = req.body ?? {};
  const title = safeString(body.title, 70);
  const description = safeString(body.description, 240);
  const author = safeString(body.author, 32) || 'Anonymous';
  const category = safeString(body.category, 24) || 'Other';
  if (title.length < 3) return res.status(400).json({ error: 'Give your pack a title (at least 3 characters).' });
  if (!Array.isArray(body.items) || body.items.length < 2 || body.items.length > 64) {
    return res.status(400).json({ error: 'Packs need between 2 and 64 contenders.' });
  }
  const items = body.items.map((item) => ({
    id: crypto.randomUUID(),
    name: safeString(item?.name, 60),
    image: safeImage(item?.image),
    emoji: safeString(item?.emoji, 4) || '⭐'
  }));
  if (items.some(item => !item.name)) return res.status(400).json({ error: 'Every contender needs a name.' });
  const pack = { id: crypto.randomUUID(), title, description, category, author, createdAt: new Date().toISOString(), items };
  packs.push(pack);
  savePacks();
  res.status(201).json(publicPack(pack, { full: true }));
});

const allowedMime = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + allowedMime[file.mimetype])
  }),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, !!allowedMime[file.mimetype])
});
app.post('/api/upload', (req, res, next) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Images must be smaller than 6 MB.' : 'Image upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'Please choose a JPG, PNG, WebP or GIF image.' });
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });
});
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d', index: false, dotfiles: 'deny' }));
app.use(express.static(path.join(root, 'public')));
app.get(['/room/:code', '/pack/:id', '/create'], (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid request data.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });
const rooms = new Map();
const MAX_PLAYERS = 30;
function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join(''); }
  while (rooms.has(code));
  return code;
}
function currentMatch(room) { return room.matches?.[room.matchIndex] ?? null; }
function serializeRoom(room, playerId) {
  const pack = packs.find(p => p.id === room.packId);
  const match = currentMatch(room);
  const players = [...room.players.values()].map(p => ({ id: p.id, name: p.name, online: p.sockets.size > 0, voted: !!match?.votes[p.id] }));
  return {
    code: room.code, status: room.status, pack: pack && publicPack(pack, { full: true }),
    hostId: room.hostId, players, round: room.round ?? 0,
    matchIndex: room.matchIndex ?? 0, roundMatchCount: room.matches?.length ?? 0,
    completed: room.completed ?? 0, totalMatches: pack ? pack.items.length - 1 : 0,
    match: match ? { a: match.a, b: match.b, voteCount: Object.keys(match.votes).length,
      myVote: match.votes[playerId] ?? null,
      scores: room.revealed ? score(match) : null,
      revealed: room.revealed, outcome: room.outcome } : null,
    champion: room.champion ?? null,
    history: room.history ?? []
  };
}
function broadcast(room) {
  room.updatedAt = Date.now();
  for (const player of room.players.values()) {
    for (const socketId of player.sockets) io.to(socketId).emit('room:state', serializeRoom(room, player.id));
  }
}
function asSocketPlayer(socket, room) {
  if (socket.data.roomCode !== room.code || !socket.data.playerId || !room.players.has(socket.data.playerId)) return null;
  return room.players.get(socket.data.playerId);
}
function removeFromOldRoom(socket) {
  const old = rooms.get(socket.data.roomCode);
  if (!old) return;
  const person = old.players.get(socket.data.playerId);
  person?.sockets.delete(socket.id);
  socket.leave(old.code);
  if (person && old.hostId === person.id && person.sockets.size === 0) {
    const replacement = [...old.players.values()].find(p => p.sockets.size > 0);
    if (replacement) old.hostId = replacement.id;
  }
  broadcast(old);
}
function reply(ack, payload) { if (typeof ack === 'function') ack(payload); }
function error(ack, message) { reply(ack, { ok: false, error: message }); }

io.on('connection', socket => {
  socket.on('room:create', (data, ack) => {
    const pack = packs.find(p => p.id === data?.packId);
    if (!pack) return error(ack, 'This pack no longer exists.');
    const id = safeString(data?.playerId, 80);
    const name = safeString(data?.name, 24);
    if (!id || !name) return error(ack, 'Enter your name before hosting.');
    removeFromOldRoom(socket);
    const code = makeCode();
    const room = { code, packId: pack.id, hostId: id, players: new Map(), status: 'lobby',
      updatedAt: Date.now(), completed: 0, history: [] };
    rooms.set(code, room);
    joinSocket(socket, room, id, name);
    reply(ack, { ok: true, code });
    broadcast(room);
  });
  socket.on('room:join', (data, ack) => {
    const code = safeString(data?.code, 16).toUpperCase();
    const id = safeString(data?.playerId, 80);
    const name = safeString(data?.name, 24);
    if (!id || !name) return error(ack, 'Choose a name to join the room.');
    const room = rooms.get(code);
    if (!room) return error(ack, 'Room not found. Check the code or ask your friend for a new link.');
    if (room.status === 'finished' && !room.players.has(id)) return error(ack, 'This tournament has finished. Ask the host to start a new room.');
    if (!room.players.has(id) && room.players.size >= MAX_PLAYERS) return error(ack, 'This room is full.');
    if (socket.data.roomCode && socket.data.roomCode !== code) removeFromOldRoom(socket);
    joinSocket(socket, room, id, name);
    reply(ack, { ok: true, code });
    broadcast(room);
  });
  socket.on('room:start', (_data, ack) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId) return error(ack, 'Only the host can start.');
    if (room.status !== 'lobby') return error(ack, 'Already started.');
    const pack = packs.find(p => p.id === room.packId);
    room.status = 'playing'; room.round = 1; room.completed = 0; room.history = []; room.champion = null;
    startRound(room, shuffle(pack.items));
    reply(ack, { ok: true }); broadcast(room);
  });
  socket.on('room:vote', (data, ack) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || !asSocketPlayer(socket, room)) return error(ack, 'Join the room first.');
    const match = currentMatch(room);
    if (room.status !== 'playing' || !match || room.revealed) return error(ack, 'Voting is closed.');
    if (![match.a.id, match.b.id].includes(data?.choice)) return error(ack, 'Invalid choice.');
    match.votes[socket.data.playerId] = data.choice;
    reply(ack, { ok: true }); broadcast(room);
  });
  socket.on('room:reveal', (_data, ack) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId) return error(ack, 'Only the host can reveal the vote.');
    if (room.status !== 'playing' || room.revealed) return error(ack, 'Not ready to reveal.');
    const match = currentMatch(room);
    if (!match) return error(ack, 'No current match.');
    const votes = score(match);
    if (!votes.total) return error(ack, 'At least one person must vote first.');
    const { winner, tiebreak } = resolveWinner(match, room.hostId);
    room.revealed = true;
    room.outcome = { winner, tiebreak };
    reply(ack, { ok: true }); broadcast(room);
  });
  socket.on('room:next', (_data, ack) => {
    const room = rooms.get(socket.data.roomCode);
    if (!room || room.hostId !== socket.data.playerId) return error(ack, 'Only the host can continue.');
    if (room.status !== 'playing' || !room.revealed) return error(ack, 'Reveal the result first.');
    const match = currentMatch(room);
    room.roundWinners.push(room.outcome.winner);
    room.history.push({ round: room.round, a: match.a, b: match.b,
      winner: room.outcome.winner, scores: score(match) });
    room.completed += 1;
    room.matchIndex += 1;
    room.revealed = false;
    room.outcome = null;
    if (room.matchIndex >= room.matches.length) {
      const entrants = [...room.roundWinners];
      if (room.bye) entrants.push(room.bye);
      if (entrants.length === 1) { room.champion = entrants[0]; room.status = 'finished'; room.matches = []; }
      else { room.round += 1; startRound(room, entrants); }
    }
    reply(ack, { ok: true }); broadcast(room);
  });
  socket.on('disconnect', () => removeFromOldRoom(socket));
});
function joinSocket(socket, room, id, name) {
  let person = room.players.get(id);
  if (!person) { person = { id, name, sockets: new Set() }; room.players.set(id, person); }
  person.name = name;
  person.sockets.add(socket.id);
  socket.data.playerId = id;
  socket.data.roomCode = room.code;
  socket.join(room.code);
}
// Room state is intentionally in memory; uploaded images and packs are persisted to DATA_DIR.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > 24 * 60 * 60 * 1000) rooms.delete(code);
  }
}, 60 * 60 * 1000).unref();

const port = Number(process.env.PORT) || 3000;
if (process.env.NODE_ENV !== 'test') server.listen(port, '0.0.0.0', () => console.log(`Duel Club running on http://localhost:${port}`));
export { app, server, io, rooms, startRound, score };
