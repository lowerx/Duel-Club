import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import multer from 'multer';
import { startRound, roundLabel, score, resolveWinner } from './game-logic.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const storeFile = path.join(dataDir, 'packs.json');
const draftsFile = path.join(dataDir, 'drafts.json');

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
// Creator keys are private capabilities; only the hash is saved with each pack.
function makeOwnerKey() { return crypto.randomBytes(32).toString('hex'); }
function keyDigest(value) { return crypto.createHash('sha256').update(value).digest(); }
function secureKeyMatch(provided, expectedHash) {
  if (typeof provided !== 'string' || !/^[a-f0-9]{64}$/.test(provided) || !/^[a-f0-9]{64}$/.test(expectedHash || '')) return false;
  return crypto.timingSafeEqual(keyDigest(provided), Buffer.from(expectedHash, 'hex'));
}
function adminKeyMatch(provided) {
  const expected = process.env.PACK_ADMIN_KEY || '';
  if (typeof provided !== 'string' || expected.length < 16 || provided.length !== expected.length) return false;
  return crypto.timingSafeEqual(keyDigest(provided), keyDigest(expected));
}
function safeString(value, max = 100) { return String(value ?? '').trim().slice(0, max); }
const MAX_PACK_ITEMS = 256;
function safeMedia(value) {
  const s = safeString(value, 1000);
  if (!s) return '';
  // Prevent script/data URLs; uploaded media are always generated server-side.
  if (/^https?:\/\/[^\s]+$/i.test(s) || /^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp|gif|mp4|webm|mov)$/i.test(s)) return s;
  return '';
}
function mediaKind(item) {
  if (item?.kind === 'video') return 'video';
  return /\.(mp4|webm|mov)(?:[?#]|$)/i.test(item?.image || '') ? 'video' : 'image';
}
function cleanItem(item, id = crypto.randomUUID()) {
  return { id, name: safeString(item?.name, 60), image: safeMedia(item?.image),
    kind: mediaKind(item), emoji: safeString(item?.emoji, 4) || '⭐' };
}
function validatePack(title, items) {
  if (title.length < 3) return 'Give your pack a title (at least 3 characters).';
  if (!Array.isArray(items) || items.length < 2 || items.length > MAX_PACK_ITEMS) return `Packs need between 2 and ${MAX_PACK_ITEMS} contenders.`;
  if (items.some(item => !item.name)) return 'Every contender needs a name.';
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
  const items = Array.isArray(body.items) ? body.items.map(item => cleanItem(item)) : [];
  const validation = validatePack(title, items);
  if (validation) return res.status(400).json({ error: validation });
  const ownerKey = makeOwnerKey();
  const pack = { id: crypto.randomUUID(), title, description, category, author, createdAt: new Date().toISOString(), items, ownerKeyHash: keyDigest(ownerKey).toString('hex') };
  packs.push(pack);
  savePacks();
  // The key is returned ONLY on creation, never via public pack listings or detail routes.
  res.status(201).json({ ...publicPack(pack, { full: true }), ownerKey });
});

app.delete('/api/packs/:id', (req, res) => {
  const index = packs.findIndex(pack => pack.id === req.params.id);
  if (index < 0) return res.status(404).json({ error: 'Pack not found or already deleted.' });
  const pack = packs[index];
  // No authentication by nickname, author string, or guessable public pack ID.
  const ownerKey = req.body?.ownerKey;
  const adminKey = req.body?.adminKey;
  const owned = secureKeyMatch(ownerKey, pack.ownerKeyHash);
  if (!owned && !adminKeyMatch(adminKey)) return res.status(403).json({
    error: pack.ownerKeyHash
      ? 'This pack belongs to another browser. Use its original creator browser or the admin delete key.'
      : 'Older packs require the admin delete key from your Render environment (PACK_ADMIN_KEY).'
  });
  if ([...rooms.values()].some(room => room.packId === pack.id && ['lobby', 'playing'].includes(room.status))) {
    return res.status(409).json({ error: 'This pack is being used in an active game room. Finish the game before deleting it.' });
  }
  packs.splice(index, 1);
  savePacks();
  // Published studios may still be open in other tabs; update their status.
  for (const draft of drafts.values()) {
    if (draft.packId === pack.id) {
      draft.status = 'deleted';
      draft.packId = null;
      broadcastDraft(draft);
    }
  }
  saveDrafts();
  // Media uploads remain untouched: the same URL may be used in another pack/draft.
  res.json({ ok: true, id: pack.id });
});

const allowedMime = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov'
};
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + allowedMime[file.mimetype])
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter: (req, file, cb) => cb(null, !!allowedMime[file.mimetype])
});
// Quick signature check prevents mislabelled HTML/scripts from being served as media.
function mediaSignatureValid(file) {
  const fd = fs.openSync(file.path, 'r');
  const header = Buffer.alloc(32);
  try { fs.readSync(fd, header, 0, header.length, 0); }
  finally { fs.closeSync(fd); }
  const mime = file.mimetype;
  if (mime === 'image/jpeg') return header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  if (mime === 'image/png') return header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === 'image/gif') return ['GIF87a','GIF89a'].includes(header.toString('ascii',0,6));
  if (mime === 'image/webp') return header.toString('ascii',0,4) === 'RIFF' && header.toString('ascii',8,12) === 'WEBP';
  if (mime === 'video/webm') return header.subarray(0,4).equals(Buffer.from([0x1a,0x45,0xdf,0xa3]));
  if (mime === 'video/mp4' || mime === 'video/quicktime') return header.toString('ascii',4,8) === 'ftyp';
  return false;
}
app.post('/api/upload', (req, res) => {
  upload.single('file')(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds the 40 MB upload limit.' : 'Media upload failed.' });
    if (!req.file) return res.status(400).json({ error: 'Choose a JPG, PNG, WebP, GIF, MP4, WebM or MOV file.' });
    const isVideo = req.file.mimetype.startsWith('video/');
    let verified = false;
    try { verified = mediaSignatureValid(req.file); } catch { verified = false; }
    if (req.file.size > (isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES) || !verified) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: isVideo ? 'Use a valid MP4, WebM or MOV video under 40 MB.' : 'Use a valid JPG, PNG, WebP or GIF under 15 MB.' });
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}`, kind: isVideo ? 'video' : 'image' });
  });
});
app.use('/uploads', express.static(uploadsDir, { maxAge: '1d', index: false, dotfiles: 'deny' }));
app.use(express.static(path.join(root, 'public')));
app.get(['/room/:code', '/pack/:id', '/create', '/studio/:code'], (_req, res) => res.sendFile(path.join(root, 'public', 'index.html')));
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
    roundLabel: room.roundEntrants ? roundLabel(room) : null,
    isPreliminary: !!room.isPreliminary, playInByes: room.byes?.length ?? 0,
    roundTarget: room.roundTarget ?? 0,
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


// Collaborative pack studios. An invite code grants edit access; hosts publish the final pack.
const drafts = new Map();
try {
  const storedDrafts = JSON.parse(fs.readFileSync(draftsFile, 'utf8'));
  if (Array.isArray(storedDrafts)) for (const draft of storedDrafts) {
    if (draft?.code && draft?.createdAt && Array.isArray(draft.items)) {
      drafts.set(draft.code, { ...draft, editors: new Map(), updatedAt: Date.now() });
    }
  }
} catch { /* First launch; empty draft store. */ }
function saveDrafts() {
  const stored = [...drafts.values()].map(({ editors, ...draft }) => draft);
  const temp = `${draftsFile}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(stored));
  fs.renameSync(temp, draftsFile);
}
function makeDraftCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 7 }, () => alphabet[crypto.randomInt(alphabet.length)]).join(''); }
  while (drafts.has(code));
  return code;
}
function draftState(draft) {
  return { code: draft.code, hostId: draft.hostId, status: draft.status,
    packId: draft.packId || null, title: draft.title, description: draft.description,
    category: draft.category, items: draft.items, editors: [...draft.editors.values()].map(editor => ({
      id: editor.id, name: editor.name, online: editor.sockets.size > 0
    })) };
}
function broadcastDraft(draft) {
  draft.updatedAt = Date.now();
  io.to(`draft:${draft.code}`).emit('draft:state', draftState(draft));
}
function leaveDraft(socket) {
  const old = drafts.get(socket.data.draftCode);
  if (!old) return;
  const editor = old.editors.get(socket.data.playerId);
  editor?.sockets.delete(socket.id);
  socket.leave(`draft:${old.code}`);
  socket.data.draftCode = null;
  broadcastDraft(old);
}
function joinDraft(socket, draft, id, name) {
  if (socket.data.draftCode && socket.data.draftCode !== draft.code) leaveDraft(socket);
  let editor = draft.editors.get(id);
  if (!editor) { editor = { id, name, sockets: new Set() }; draft.editors.set(id, editor); }
  editor.name = name;
  editor.sockets.add(socket.id);
  socket.data.draftCode = draft.code;
  socket.data.playerId = id;
  socket.join(`draft:${draft.code}`);
}
function studioFor(socket) {
  const draft = drafts.get(socket.data.draftCode);
  return draft?.editors.has(socket.data.playerId) ? draft : null;
}
io.on('connection', socket => {
  socket.on('draft:create', (data, ack) => {
    const id = safeString(data?.playerId, 80);
    const name = safeString(data?.name, 24);
    if (!id || !name) return error(ack, 'Choose a nickname first.');
    const code = makeDraftCode();
    const draft = { code, hostId: id, status: 'editing', packId: null,
      title: '', description: '', category: 'Other', items: [],
      createdAt: new Date().toISOString(), updatedAt: Date.now(), editors: new Map() };
    drafts.set(code, draft);
    joinDraft(socket, draft, id, name);
    saveDrafts();
    reply(ack, { ok: true, code }); broadcastDraft(draft);
  });
  socket.on('draft:join', (data, ack) => {
    const code = safeString(data?.code, 12).toUpperCase();
    const id = safeString(data?.playerId, 80);
    const name = safeString(data?.name, 24);
    if (!id || !name) return error(ack, 'Choose a nickname first.');
    const draft = drafts.get(code);
    if (!draft) return error(ack, 'Pack studio not found. Ask your friend for a new invite link.');
    if (!draft.editors.has(id) && draft.editors.size >= 30) return error(ack, 'This studio is full (30 editors).');
    joinDraft(socket, draft, id, name);
    reply(ack, { ok: true, code }); broadcastDraft(draft);
  });
  socket.on('draft:meta', (data, ack) => {
    const draft = studioFor(socket);
    if (!draft || draft.hostId !== socket.data.playerId) return error(ack, 'Only the studio creator can edit pack details.');
    if (draft.status !== 'editing') return error(ack, 'This pack is already published.');
    const field = data?.field;
    if (!['title','description','category'].includes(field)) return error(ack, 'Invalid field.');
    draft[field] = safeString(data?.value, field === 'title' ? 70 : field === 'description' ? 240 : 24);
    saveDrafts(); reply(ack, { ok: true }); broadcastDraft(draft);
  });
  socket.on('draft:add', (data, ack) => {
    const draft = studioFor(socket);
    if (!draft || draft.status !== 'editing') return error(ack, 'This studio is not open for editing.');
    if (draft.items.length >= MAX_PACK_ITEMS) return error(ack, `A pack can have at most ${MAX_PACK_ITEMS} contenders.`);
    const entry = cleanItem(data?.item);
    if (!entry.name) return error(ack, 'Every contender needs a name.');
    entry.addedBy = socket.data.playerId;
    entry.addedByName = draft.editors.get(socket.data.playerId).name;
    draft.items.push(entry);
    saveDrafts(); reply(ack, { ok: true, id: entry.id }); broadcastDraft(draft);
  });
  socket.on('draft:edit', (data, ack) => {
    const draft = studioFor(socket);
    if (!draft || draft.status !== 'editing') return error(ack, 'This studio is not open for editing.');
    const entry = draft.items.find(item => item.id === data?.id);
    if (!entry) return error(ack, 'Contender was removed.');
    if (entry.addedBy !== socket.data.playerId && draft.hostId !== socket.data.playerId) return error(ack, 'You can only edit your entries.');
    const field = data?.field;
    if (!['name', 'image', 'kind'].includes(field)) return error(ack, 'Invalid field.');
    if (field === 'kind') entry.kind = data?.value === 'video' ? 'video' : 'image';
    else if (field === 'image') entry.image = safeMedia(data?.value);
    else entry.name = safeString(data?.value, 60);
    saveDrafts(); reply(ack, { ok: true }); broadcastDraft(draft);
  });
  socket.on('draft:remove', (data, ack) => {
    const draft = studioFor(socket);
    if (!draft || draft.status !== 'editing') return error(ack, 'This studio is not open for editing.');
    const entry = draft.items.find(item => item.id === data?.id);
    if (!entry) return error(ack, 'Contender was removed.');
    if (entry.addedBy !== socket.data.playerId && draft.hostId !== socket.data.playerId) return error(ack, 'You can only remove your entries.');
    draft.items = draft.items.filter(item => item.id !== entry.id);
    saveDrafts(); reply(ack, { ok: true }); broadcastDraft(draft);
  });
  socket.on('draft:publish', (_data, ack) => {
    const draft = studioFor(socket);
    if (!draft || draft.hostId !== socket.data.playerId) return error(ack, 'Only the creator can publish.');
    if (draft.status !== 'editing') return error(ack, 'This pack is already published.');
    const items = draft.items.map(item => cleanItem(item));
    const validation = validatePack(draft.title, items);
    if (validation) return error(ack, validation);
    const ownerKey = makeOwnerKey();
    const pack = { id: crypto.randomUUID(), title: draft.title, description: draft.description,
      category: draft.category, author: draft.editors.get(draft.hostId)?.name || 'Duel Club',
      createdAt: new Date().toISOString(), items, ownerKeyHash: keyDigest(ownerKey).toString('hex') };
    packs.push(pack); savePacks();
    draft.packId = pack.id; draft.status = 'published'; saveDrafts();
    reply(ack, { ok: true, packId: pack.id, ownerKey }); broadcastDraft(draft);
  });
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
      // Preliminary winners join everyone who received a bye to form a full
      // power-of-two bracket. Shuffle once for a fair regular-bracket draw.
      const entrants = [...room.roundWinners, ...(room.byes ?? [])];
      const wasPreliminary = room.isPreliminary;
      if (entrants.length === 1) { room.champion = entrants[0]; room.status = 'finished'; room.matches = []; }
      else { room.round += 1; startRound(room, wasPreliminary ? shuffle(entrants) : entrants); }
    }
    reply(ack, { ok: true }); broadcast(room);
  });
  socket.on('disconnect', () => { removeFromOldRoom(socket); leaveDraft(socket); });
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
// Game room state is in memory; packs, uploads and collaborative studio drafts persist to DATA_DIR.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.updatedAt > 24 * 60 * 60 * 1000) rooms.delete(code);
  }
}, 60 * 60 * 1000).unref();

const port = Number(process.env.PORT) || 3000;
if (process.env.NODE_ENV !== 'test') server.listen(port, '0.0.0.0', () => console.log(`Duel Club running on http://localhost:${port}`));
export { app, server, io, rooms, startRound, score };
