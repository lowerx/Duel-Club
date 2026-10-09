/* Duel Club: real-time knockout games with custom packs. No frontend build step. */
const $ = selector => document.querySelector(selector);
const app = $('#app');
const modalRoot = $('#modal-root');
const socket = io({ reconnection: true });
const CATEGORIES = ['Other', 'Entertainment', 'Music', 'Gaming', 'Sports', 'Food', 'Travel', 'Lifestyle', 'People', 'Movies', 'Anime'];
const state = {
  name: localStorage.getItem('duelclub:name') || '',
  playerId: localStorage.getItem('duelclub:playerId') || crypto.randomUUID(),
  packs: [], pack: null, room: null, pageToken: 0,
  builder: null, uploading: 0, saving: false, draft: null, studioUploading: 0
};
localStorage.setItem('duelclub:playerId', state.playerId);
let modalState = null;
let toastTimer;

const esc = input => String(input ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
function isVideo(item) {
  return item?.kind === 'video' || (item?.kind !== 'image' && /\.(mp4|webm|mov)(?:[?#]|$)/i.test(item?.image || ''));
}
function image(item, className = '', playable = false) {
  if (!item?.image) return `<span>${esc(item?.emoji || '✨')}</span>`;
  if (isVideo(item)) return `<video src="${esc(item.image)}" ${playable ? 'controls' : ''} playsinline preload="metadata" ${playable ? '' : 'muted'} loop class="${className}" aria-label="${esc(item.name || 'Video contender')}"></video>`;
  return `<img src="${esc(item.image)}" alt="${esc(item.name || '')}" loading="lazy" class="${className}">`;
}
function tile(item, className = 'preview-tile') { return `<div class="${className}">${image(item)}</div>`; }
function toast(message, bad = false) {
  const el = $('#toast'); el.textContent = message; el.className = `toast visible${bad ? ' error' : ''}`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('visible'), 3400);
}
function route() {
  const parts = location.pathname.split('/').filter(Boolean);
  return { type: parts[0] || 'home', id: parts[1] || '' };
}
function navigate(url) { closeModal(); history.pushState(null, '', url); window.scrollTo(0,0); showPage(); }
async function api(path, options) {
  const response = await fetch(path, options);
  let data;
  try { data = await response.json(); } catch { throw Error('The server did not respond correctly.'); }
  if (!response.ok) throw Error(data.error || 'Request failed.');
  return data;
}
function rpc(event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(9000).emit(event, payload, (err, response) => {
      if (err) return reject(Error('Connection timed out. Check your internet connection.'));
      if (!response?.ok) return reject(Error(response?.error || 'Something went wrong.'));
      resolve(response);
    });
  });
}
function refreshNameChip() { $('#name-chip-text').textContent = state.name || 'Your name'; }
function updateNav() {
  $('#discover-link').classList.toggle('active', route().type === 'home');
  $('#create-link').classList.toggle('active', route().type === 'create');
}

function previewCover(pack) {
  const first = pack.items?.[0];
  const img = first?.image ? image(first) : `<div class="cover-emoji">${esc(first?.emoji || '🎲')}</div>`;
  const theme = pack.category === 'Food' ? 'food' : pack.category === 'Lifestyle' ? 'life' : '';
  return `<div class="pack-cover card-placeholder ${theme}">${img}<span class="cover-category">✦ ${esc(pack.category)}</span><span class="cover-count">${pack.itemCount} contenders</span></div>`;
}
function packCard(pack) {
  return `<button class="pack-card" data-pack="${esc(pack.id)}">${previewCover(pack)}
    <div class="pack-info"><h3>${esc(pack.title)}</h3><p>${esc(pack.description || 'Pick your favourites and settle the debate together.')}</p>
    <div class="pack-meta"><span>✦ by ${esc(pack.author)}</span><b>Play now ↗</b></div></div></button>`;
}
function homeHtml() {
  return `<section class="hero">
    <div class="hero-copy"><span class="eyebrow"><span class="tiny-star">✳</span> THE GROUP DECIDES</span>
      <h1>Big debates.<br>Bold picks.<br><span class="gradient-text">One winner.</span></h1>
      <p>Create your own head-to-head rankings, invite your friends, and vote your way to the ultimate champion. Prepare to disagree.</p>
      <div class="hero-actions"><button class="button button-primary button-large" data-action="create">✳ Create a pack <span>↗</span></button><button class="button button-secondary button-large" data-action="create-together">👥 Make one together</button>
      <button class="button button-secondary button-large" data-action="join">Join a room <span>→</span></button></div>
      <div class="hero-proof"><div class="avatar-stack"><span>😎</span><span>😼</span><span>👾</span><span>🫶</span></div><span>Built for your friends and their questionable opinions.</span></div>
    </div>
    <div class="hero-stage"><div class="stage-glow"></div><div class="floating-icon">✳</div>
      <div class="showcase"><div class="showcase-header"><span><i class="live-dot"></i> THE GREAT TRAVEL DEBATE</span><span class="showcase-round">ROUND 3 / 4</span></div>
      <div class="showcase-cards"><div class="showcase-card"><img src="https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=600&q=80" alt="Paris"><strong>Paris</strong></div><div class="showcase-card"><img src="https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=600&q=80" alt="Tokyo"><strong>Tokyo</strong></div><div class="showcase-vs">VS</div></div>
      <div class="showcase-footer"><span>⚡ EVERY VOTE COUNTS</span><div class="showcase-progress"><span></span></div><span>64% COMPLETE</span></div></div>
      <div class="floating-label">🏆 NO EASY CHOICES</div>
    </div>
  </section>
  <section class="steps-strip"><div class="step"><div class="step-icon">🎨</div><div><strong>01 · Make your pack</strong><span>Add photos, GIFs, videos, or links — alone or together.</span></div></div>
  <div class="step"><div class="step-icon">🔗</div><div><strong>02 · Invite the squad</strong><span>Send a room code. No accounts needed.</span></div></div>
  <div class="step"><div class="step-icon">🏆</div><div><strong>03 · Crown a winner</strong><span>Vote together in a live knockout tournament.</span></div></div></section>
  <section class="section" id="explore"><div class="section-head"><div><span class="eyebrow">✳ READY TO PLAY?</span><h2>Pick your next debate.</h2><p class="subhead">Start with a pack below, or make one that's completely yours.</p></div><button class="button button-secondary button-small" data-action="create">+ New pack</button></div>
  <div class="pack-grid">${state.packs.map(packCard).join('') || `<div class="empty-state">No packs yet — create the first one!</div>`}</div></section>
  <section class="cta-banner"><div><h2>Your group chat needs a verdict. ✳</h2><p>Photos, food, people, movies — if you can rank it, you can duel it.</p></div><button class="button" data-action="create">Make your own pack ↗</button></section>`;
}
async function showPage() {
  const myToken = ++state.pageToken;
  const page = route(); updateNav();
  if (page.type === 'home') {
    app.innerHTML = `<div class="loading">✳ Loading the good stuff…</div>`;
    try { state.packs = await api('/api/packs'); if (myToken === state.pageToken) app.innerHTML = homeHtml(); }
    catch (err) { if (myToken === state.pageToken) app.innerHTML = `<div class="empty-state">Couldn't load packs. ${esc(err.message)} <button class="button button-secondary" data-action="refresh">Try again</button></div>`; }
  } else if (page.type === 'create') {
    if (!state.builder) resetBuilder();
    renderBuilder();
  } else if (page.type === 'studio' && page.id) {
    if (state.draft?.code === page.id.toUpperCase()) renderStudio();
    else app.innerHTML = `<div class="loading">✳ Joining shared studio ${esc(page.id.toUpperCase())}…</div>`;
    joinStudioFromLink(page.id.toUpperCase());
  } else if (page.type === 'pack' && page.id) {
    app.innerHTML = '<div class="loading">✳ Getting the contenders ready…</div>';
    try { const pack = await api(`/api/packs/${encodeURIComponent(page.id)}`); if (myToken === state.pageToken) { state.pack = pack; renderPack(pack); } }
    catch (err) { if (myToken === state.pageToken) renderNotFound(err.message); }
  } else if (page.type === 'room' && page.id) {
    if (state.room?.code === page.id.toUpperCase()) renderRoom();
    else app.innerHTML = `<div class="loading">✳ Connecting to room ${esc(page.id.toUpperCase())}…</div>`;
    joinRoomFromLink(page.id.toUpperCase());
  } else renderNotFound();
}
function renderNotFound(message = 'We could not find that page.') {
  app.innerHTML = `<div class="not-found"><div style="font-size:60px">🔎</div><h1>Nothing to duel here.</h1><p class="subhead">${esc(message)}</p><button class="button button-primary" data-action="home" style="margin-top:25px">Back to packs →</button></div>`;
}
function renderPack(pack) {
  const shown = pack.items.slice(0, 4);
  app.innerHTML = `<div class="page"><a href="/" data-link class="back-link">← Back to all packs</a>
  <div class="pack-detail"><div class="detail-cover">${shown.map(item => tile(item)).join('')}</div>
  <div class="detail-copy"><span class="eyebrow">✳ ${esc(pack.category.toUpperCase())} · WORLD CUP BRACKET</span><h1>${esc(pack.title)}<span class="decor-line">✳</span></h1>
  <p class="lead">${esc(pack.description || 'Time to discover your ultimate favourite!')}</p><div class="detail-chips"><span>👤 Made by ${esc(pack.author)}</span><span>⚔ ${pack.itemCount} contenders</span><span>👥 Up to 30 friends</span></div>
  <div class="hero-actions"><button class="button button-primary button-large" data-action="host" data-id="${esc(pack.id)}">✳ Host a room ↗</button>
  <button class="button button-secondary button-large" data-action="join">Join a room</button></div><p class="sidebar-caption">Play with friends in real time, or start alone. Sharing a link is all it takes.</p></div></div>
  <div class="section-divider"></div><h2 class="detail-item-label">Meet the contenders <span class="subhead">(${pack.itemCount})</span></h2>
  <div class="detail-items">${pack.items.map(item => `<div class="detail-item">${tile(item)}<strong>${esc(item.name)}</strong></div>`).join('')}</div></div>`;
}
function resetBuilder() { state.builder = { title: '', description: '', category: 'Other', items: [blankEntry(), blankEntry()] }; }
function blankEntry() { return { key: crypto.randomUUID(), name: '', image: '', kind: 'image', emoji: '✨' }; }
function renderBuilder() {
  if (!state.builder) resetBuilder();
  const b = state.builder;
  const preview = b.items.filter(x => x.name || x.image).slice(0, 4);
  while (preview.length < 4) preview.push({ emoji: ['🎨','✨','🏆','🎯'][preview.length] });
  app.innerHTML = `<div class="page"><a href="/" data-link class="back-link">← Back to explore</a>
  <div class="page-head"><div><span class="eyebrow">✳ THE CREATOR STUDIO</span><h1>Make your own pack.</h1><p class="subhead">Give your friends some impossible choices.</p><button class="button button-secondary button-small" data-action="create-together">👥 Build together with friends ↗</button></div></div>
  <div class="builder-layout"><section class="panel"><h2 class="panel-title">01 / The basics <span style="font-size:20px">✍️</span></h2>
  <div class="field"><label for="pack-title">Pack name *</label><input id="pack-title" data-form-field="title" maxlength="70" placeholder="e.g. Most iconic movie characters" value="${esc(b.title)}"></div>
  <div class="field"><label for="pack-description">Description</label><textarea id="pack-description" data-form-field="description" maxlength="240" placeholder="What's everyone voting on?">${esc(b.description)}</textarea></div>
  <div class="field"><label for="pack-category">Category</label><select id="pack-category" data-form-field="category">${CATEGORIES.map(cat => `<option ${cat === b.category ? 'selected' : ''}>${esc(cat)}</option>`).join('')}</select></div>
  <div class="section-divider"></div><div class="entry-head"><div><h3>02 / The contenders <span style="color:var(--lime)">${b.items.length}/64</span></h3><p>At least 2 choices. Add photos, animated GIFs, videos, or direct media links.</p></div></div>
  <div class="entries-list">${b.items.map((item, index) => `<div class="entry-row"><span class="entry-number">${index + 1}</span>${tile(item, 'entry-thumb')}
  <div class="entry-fields"><input aria-label="Contender name ${index + 1}" data-entry="${esc(item.key)}" data-entry-field="name" maxlength="60" placeholder="Contender name" value="${esc(item.name)}">
  <input aria-label="Media URL ${index + 1}" data-entry="${esc(item.key)}" data-entry-field="image" placeholder="Paste image / GIF / video URL" value="${esc(item.image)}"><select aria-label="Media type ${index + 1}" data-entry="${esc(item.key)}" data-entry-field="kind"><option value="image" ${!isVideo(item) ? 'selected' : ''}>Photo / GIF</option><option value="video" ${isVideo(item) ? 'selected' : ''}>Video</option></select></div>
  <button class="icon-button" type="button" data-remove="${esc(item.key)}" title="Remove contender" aria-label="Remove contender">×</button></div>`).join('')}</div>
  <div class="entry-add-actions"><button type="button" class="button button-secondary button-small" data-action="add-entry">+ Add contender</button>
  <label class="button button-secondary button-small upload-button">🎞️ Upload media<input type="file" id="file-upload" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mov" multiple aria-label="Upload contender pictures"></label></div>
  <p class="hint">Supports JPG, PNG, WebP, GIF (15 MB max), MP4, WebM, MOV (40 MB max). MOV playback varies by browser. You can also use direct media links.</p>
  ${state.uploading ? `<p class="eyebrow">↻ Uploading ${state.uploading} file(s)…</p>` : ''}
  </section><aside class="panel sticky-panel"><h2 class="panel-title">Live preview <span>✨</span></h2>
  <div class="preview-stack">${preview.map(item => tile(item)).join('')}</div>
  <h3 style="font-family:var(--display);font-size:23px;letter-spacing:-1px;margin:20px 0 6px">${esc(b.title || 'Your epic showdown')}</h3><p class="subhead">${esc(b.description || 'Which choice will come out on top?')}</p>
  <div class="sidebar-info"><p><strong>⚡ How it works</strong><br>After saving your pack, you can host a private room, share the invite link, and vote live with your friends.</p></div>
  <button class="button button-primary full-button" data-action="save-pack" ${state.saving || state.uploading ? 'disabled' : ''}>${state.saving ? 'Saving your pack…' : 'Save my pack →'}</button>
  <p class="hint" style="text-align:center">No account needed · Publicly accessible pack links</p></aside></div></div>`;
}
async function uploadFiles(fileList) {
  const files = [...fileList];
  // If the creator is still showing the two empty starter rows, replace them with uploads.
  if (state.builder.items.every(item => !item.name.trim() && !item.image)) state.builder.items = [];
  const remaining = 64 - state.builder.items.length;
  if (!remaining) return toast('The pack is full (64 contenders max).', true);
  if (files.length > remaining) toast(`Only the first ${remaining} photos will be added.`, true);
  const selected = files.slice(0, remaining);
  for (const file of selected) {
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { toast(`Skipped ${file.name}: unsupported file.`, true); continue; }
    state.uploading++;
    const record = { key: crypto.randomUUID(), name: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0,60), image: '', kind: file.type.startsWith('video/') ? 'video' : 'image', emoji: '📸' };
    state.builder.items.push(record);
    renderBuilder();
    try {
      const form = new FormData(); form.append('file', file);
      const response = await api('/api/upload', { method: 'POST', body: form });
      record.image = response.url; record.kind = response.kind;
    } catch (err) { toast(`${file.name}: ${err.message}`, true); }
    finally { state.uploading--; renderBuilder(); }
  }
  if (selected.length) toast(`Added ${selected.length} contender${selected.length !== 1 ? 's' : ''}.`);
}
async function savePack() {
  const b = state.builder;
  const items = b.items.filter(x => x.name.trim());
  if (b.title.trim().length < 3) return toast('Your pack needs a title (3+ characters).', true);
  if (items.length < 2) return toast('Add at least two named contenders.', true);
  if (items.length !== b.items.length) return toast('Name all contenders or remove empty rows.', true);
  if (state.uploading) return toast('Finish uploading your photos first.', true);
  state.saving = true; renderBuilder();
  try {
    const pack = await api('/api/packs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: b.title, description: b.description, category: b.category, author: state.name || 'Anonymous', items }) });
    state.saving = false; state.builder = null;
    navigate(`/pack/${encodeURIComponent(pack.id)}`); toast('Your pack is ready! 🎉');
  } catch (err) { state.saving = false; renderBuilder(); toast(err.message, true); }
}

// Shared pack studio: all clients edit one server-backed draft through Socket.IO.
async function createStudio() {
  if (!state.name) return openModal({ type: 'name', title: 'Create together',
    caption: 'Choose your nickname, then share a link so your friends can add contenders.', onConfirm: createStudio });
  try {
    const { code } = await rpc('draft:create', { playerId: state.playerId, name: state.name });
    navigate(`/studio/${code}`);
  } catch (err) { toast(err.message, true); }
}
async function joinStudioFromLink(code) {
  if (route().type !== 'studio' || route().id.toUpperCase() !== code) return;
  if (!state.name) return openModal({ type: 'name', title: 'Join your friends',
    caption: 'Pick the name others will see as you add photos, GIFs and videos.', onConfirm: () => joinStudioFromLink(code) });
  try { await rpc('draft:join', { code, playerId: state.playerId, name: state.name }); }
  catch (err) { if (route().type === 'studio') renderNotFound(err.message); toast(err.message, true); }
}
function studioHtml(d) {
  const isHost = d.hostId === state.playerId;
  const isEditing = d.status === 'editing';
  const permitted = item => isEditing && (isHost || item.addedBy === state.playerId);
  return `<div class="page studio-page"><a href="/" data-link class="back-link">← Explore packs</a>
  <div class="page-head studio-header"><div><span class="eyebrow">✳ COLLABORATIVE PACK STUDIO · ${esc(d.code)}</span>
  <h1>Better together. <span class="gradient-text">✳</span></h1>
  <p class="subhead">Everyone in this studio can add contenders at the same time. Changes appear live.</p></div>
  <button class="button button-primary" data-action="copy-studio">🔗 Invite friends</button></div>
  <div class="studio-grid"><div class="panel studio-main">
    ${d.status === 'published' ? `<div class="studio-published"><h2>🏆 Pack published!</h2><p>You're all done. Open the pack to start voting.</p><a class="button button-primary" href="/pack/${esc(d.packId)}" data-link>Play this pack →</a></div>` : ''}
    <h2 class="panel-title">01 / Pack details <span>✍️</span></h2>
    <div class="field"><label>Pack title ${isHost ? '(only you can edit)' : '(set by host)'}</label><input data-studio-meta="title" maxlength="70" placeholder="Most iconic characters ever" value="${esc(d.title)}" ${!isHost || !isEditing ? 'disabled' : ''}></div>
    <div class="field"><label>Description</label><textarea data-studio-meta="description" maxlength="240" placeholder="What should we rank?" ${!isHost || !isEditing ? 'disabled' : ''}>${esc(d.description)}</textarea></div>
    <div class="field"><label>Category</label><select data-studio-meta="category" ${!isHost || !isEditing ? 'disabled' : ''}>${CATEGORIES.map(cat => `<option ${cat === d.category ? 'selected' : ''}>${esc(cat)}</option>`).join('')}</select></div>
    <div class="section-divider"></div>
    <div class="entry-head"><div><h3>02 / All contenders <span style="color:var(--lime)">${d.items.length}/64</span></h3><p>Everyone's additions appear here in real time. Edit your own entries; the host can edit all entries.</p></div></div>
    <div class="entries-list">${d.items.map((item, index) => `<div class="entry-row"><span class="entry-number">${index + 1}</span>${tile(item, 'entry-thumb')}
      <div class="entry-fields"><input aria-label="Contender ${index + 1}" data-studio-entry="${esc(item.id)}" data-studio-field="name" maxlength="60" value="${esc(item.name)}" ${permitted(item) ? '' : 'disabled'}>
      <input aria-label="Media link" data-studio-entry="${esc(item.id)}" data-studio-field="image" placeholder="Image / GIF / video URL" value="${esc(item.image)}" ${permitted(item) ? '' : 'disabled'}>
      <select aria-label="Media type" data-studio-entry="${esc(item.id)}" data-studio-field="kind" ${permitted(item) ? '' : 'disabled'}><option value="image" ${!isVideo(item) ? 'selected' : ''}>Photo / GIF</option><option value="video" ${isVideo(item) ? 'selected' : ''}>Video</option></select>
      <span class="entry-credit">Added by ${esc(item.addedByName || 'Friend')}</span></div>
      ${permitted(item) ? `<button class="icon-button" data-studio-remove="${esc(item.id)}" title="Remove">×</button>` : ''}</div>`).join('') || `<div class="empty-state">Nothing yet! Upload media or add a contender below.</div>`}</div>
    ${isEditing ? `<div class="entry-add-actions"><button class="button button-secondary button-small" data-action="studio-add">+ Add by name / URL</button>
      <label class="button button-secondary button-small upload-button">🎞️ Add photos, GIFs & videos<input id="studio-upload" type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.mov" multiple></label></div>
      <p class="hint">Images/GIFs up to 15 MB; MP4/WebM/MOV up to 40 MB. Uploaded files appear as you add them. You can also add direct media URLs.</p>
      ${state.studioUploading ? `<p class="eyebrow">↻ Uploading ${state.studioUploading} file(s)…</p>` : ''}` : ''}
  </div><aside class="panel studio-sidebar"><h2 class="panel-title">👥 Your collaborators</h2>
  <div class="studio-code">${esc(d.code)}</div><p class="hint">Share this studio link — everyone can add entries immediately, no account needed.</p>
  <button class="button button-secondary full-button" data-action="copy-studio">🔗 Copy invite link</button>
  ${d.editors.map(editor => `<div class="studio-person"><span class="player-avatar">${esc(editor.name[0]?.toUpperCase() || '?')}</span><b>${esc(editor.name)}${editor.id === state.playerId ? ' (you)' : ''}</b>${editor.id === d.hostId ? '<span class="host-pill">HOST</span>' : ''}<span class="studio-online ${editor.online ? '' : 'offline'}">${editor.online ? '●' : '○'}</span></div>`).join('')}
  <div class="sidebar-division"></div><p class="sidebar-caption">${isHost ? 'You control the pack title and can publish when at least 2 contenders have been added.' : 'Add as many contenders as you like. The studio host can publish the final pack.'}</p>
  ${isHost && isEditing ? `<button class="button button-primary full-button" data-action="studio-publish" ${state.studioUploading ? 'disabled' : ''}>Publish shared pack →</button>` : isEditing ? '<p class="hint">⏳ Waiting for the creator to publish…</p>' : ''}
  </aside></div></div>`;
}
function renderStudio() {
  const d = state.draft;
  if (!d || route().type !== 'studio' || route().id.toUpperCase() !== d.code) return;
  // Keep caret and scroll position when another editor adds or updates an entry.
  const active = document.activeElement;
  const attr = active?.dataset?.studioMeta ? 'studioMeta' : active?.dataset?.studioEntry ? 'studioEntry' : null;
  const identity = attr && active.dataset[attr];
  const field = active?.dataset?.studioField;
  const start = active?.selectionStart, end = active?.selectionEnd;
  const scroll = window.scrollY;
  app.innerHTML = studioHtml(d);
  if (identity) {
    const newField = [...app.querySelectorAll(attr === 'studioMeta' ? '[data-studio-meta]' : '[data-studio-entry]')]
      .find(el => el.dataset[attr] === identity && (!field || el.dataset.studioField === field));
    if (newField && !newField.disabled) { newField.focus({ preventScroll:true });
      try { if (start != null) newField.setSelectionRange(start, end); } catch { /* Select input */ } }
  }
  window.scrollTo(0, scroll);
}
async function copyStudio() {
  const url = `${location.origin}/studio/${state.draft.code}`;
  try { await navigator.clipboard.writeText(url); toast('Studio invite copied!'); }
  catch { window.prompt('Share this link:', url); }
}
async function studioAction(name, payload = {}) {
  try { return await rpc(`draft:${name}`, payload); }
  catch (err) { toast(err.message, true); return null; }
}
async function uploadStudioFiles(fileList) {
  const files = [...fileList];
  let added = 0;
  for (const file of files) {
    if (route().type !== 'studio' || state.draft?.status !== 'editing') break;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) { toast(`Unsupported file: ${file.name}`, true); continue; }
    if (state.draft.items.length >= 64) { toast('The studio has 64 contenders already.', true); break; }
    state.studioUploading++;
    try {
      const form = new FormData(); form.append('file', file);
      const media = await api('/api/upload', { method:'POST', body:form });
      const item = { name: file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g,' ').slice(0,60), image: media.url, kind: media.kind, emoji:'🎞️' };
      const result = await studioAction('add', { item });
      if (result) added++;
    } catch (err) { toast(`${file.name}: ${err.message}`, true); }
    finally { state.studioUploading--; renderStudio(); }
  }
  if (added) toast(`Added ${added} contender${added !== 1 ? 's' : ''} to the shared pack!`);
}
const studioChanges = new Map();
async function sendStudioChange(key, pending) {
  clearTimeout(pending.timer);
  const payload = pending.type === 'meta' ? { field: pending.field, value:pending.value }
    : { id: pending.id, field: pending.field, value:pending.value };
  const result = await studioAction(pending.type, payload);
  if (studioChanges.get(key) === pending) studioChanges.delete(key);
  return !!result;
}
function changeStudioField(type, id, field, value) {
  const key = `${type}:${id}:${field}`;
  const older = studioChanges.get(key);
  if (older) clearTimeout(older.timer);
  const pending = { type, id, field, value, timer:null };
  pending.timer = setTimeout(() => sendStudioChange(key, pending), 450);
  studioChanges.set(key, pending);
}
async function flushStudioChanges() {
  const pending = [...studioChanges.entries()];
  const results = await Promise.all(pending.map(([key, value]) => sendStudioChange(key, value)));
  return results.every(Boolean);
}
function restorePendingStudioFields(draft) {
  for (const pending of studioChanges.values()) {
    if (pending.type === 'meta') draft[pending.field] = pending.value;
    else {
      const entry = draft.items.find(item => item.id === pending.id);
      if (entry) entry[pending.field] = pending.value;
    }
  }
}

function roomHeader(room) {
  return `<a href="/" class="back-link" data-link>← Exit to packs</a><div class="room-header"><div><span class="eyebrow">✳ LIVE ROOM · ${esc(room.code)}</span>
  <h1>${esc(room.pack?.title || 'The big debate')}</h1><p>Hosted by ${esc(room.players.find(p => p.id === room.hostId)?.name || 'Host')} · ${room.players.filter(p => p.online).length} online</p></div>
  <button class="room-tag" data-action="copy-room">🔗 ${esc(room.code)} <span>↗</span></button></div>`;
}
function playerList(room, game = false) {
  return `<div class="participants">${room.players.map(p => `<div class="participant"><div class="player-avatar">${esc(p.name.charAt(0).toUpperCase())}</div>
  <span class="player-name">${esc(p.name)}${p.id === state.playerId ? ' (you)' : ''}</span>${p.id === room.hostId ? '<span class="host-pill">HOST</span>' : ''}
  <span class="player-status ${p.online && (!game || p.voted) ? 'ready' : ''}">${!p.online ? 'Offline' : game ? p.voted ? '✓ Voted' : 'Choosing…' : '● Here'}</span></div>`).join('')}</div>`;
}
function lobbyHtml(room) {
  const isHost = room.hostId === state.playerId;
  return `<div class="page">${roomHeader(room)}<div class="lobby-grid"><section class="lobby-hero"><div><span class="eyebrow">🪩 YOUR PRIVATE PARTY LOBBY</span>
  <h2>Let's get the<br><span class="gradient-text">debate started.</span></h2><p>Share this code or invite link with your friends. Everyone joins on their own device and votes on the same contenders.</p>
  <div class="room-code">${esc(room.code)}</div><div class="room-actions"><button class="button button-secondary" data-action="copy-room">🔗 Copy invite link</button>
  <button class="button button-secondary" data-action="join">⌨ Join another room</button></div></div>
  <div style="margin-top:29px">${isHost ? `<button class="button button-primary button-large" data-action="start">Start tournament →</button>` : `<span class="eyebrow">⏳ Waiting for host to start…</span>`}</div></section>
  <aside class="panel lobby-panel"><h3>👥 Players in the room <span style="color:var(--lime)">${room.players.filter(p => p.online).length}/30</span></h3>${playerList(room)}
  <div class="sidebar-division"></div><p class="sidebar-caption">🎮 ${room.pack.itemCount} contenders · ${room.totalMatches} head-to-head matches<br><br>Everyone gets one vote per match. The most votes advance. The host controls the pace.</p></aside></div></div>`;
}
function contenderButton(item, room, side) {
  const match = room.match;
  const picked = match.myVote === item.id;
  const winner = match.revealed && match.outcome.winner.id === item.id;
  const lost = match.revealed && !winner;
  const votes = match.scores ? match.scores[side] : null;
  return `<div class="contender ${picked ? 'picked' : ''} ${winner ? 'winner' : ''} ${lost ? 'loser' : ''}">
  ${picked ? '<span class="selected-mark">✓ YOUR PICK</span>' : ''}
  <div class="contender-media">${image(item, '', true)}</div>
  <div class="contender-footer"><strong>${esc(item.name)}</strong>
  <span>${match.revealed ? `${votes} vote${votes === 1 ? '' : 's'} ${winner ? '· 🏆 WINS' : ''}` : picked ? 'You voted for this contender' : 'Watch the clip or make your choice'}</span>
  <button type="button" class="button ${picked ? 'button-primary' : 'button-secondary'} vote-pick" data-vote="${esc(item.id)}" ${match.revealed ? 'disabled' : ''}>${match.revealed ? winner ? '🏆 Winner' : 'Eliminated' : picked ? '✓ Selected' : 'Vote for this →'}</button></div></div>`;
}
function gameHtml(room) {
  const match = room.match;
  if (!match) return `<div class="page">${roomHeader(room)}<div class="loading">Preparing the next round…</div></div>`;
  const isHost = room.hostId === state.playerId;
  const online = room.players.filter(p => p.online).length;
  const label = room.round === 1 ? 'OPENING ROUND' : room.totalMatches - room.completed === 1 ? 'THE GRAND FINAL' : `ROUND ${room.round}`;
  const isLast = room.completed + 1 === room.totalMatches;
  return `<div class="page">${roomHeader(room)}<div class="game-layout"><section class="game-main">
  <div class="progress-row"><span>${label} · MATCH ${room.matchIndex + 1}/${room.roundMatchCount}</span><span>${room.completed} / ${room.totalMatches} MATCHES COMPLETE</span></div>
  <div class="progress-track"><div class="progress-fill" style="width:${Math.round((room.completed / Math.max(1,room.totalMatches)) * 100)}%"></div></div>
  <div class="game-prompt"><span class="eyebrow">${match.revealed ? '🏆 THE PEOPLE HAVE SPOKEN' : '⚔ FACE-OFF'}</span>
  <h2>${match.revealed ? 'And the winner is…' : 'Who gets your vote?'}</h2><p>${match.revealed ? esc(match.outcome.tiebreak || 'Moving one step closer to the crown.') : 'Tap your favourite contender below. You can change your vote until reveal.'}</p></div>
  <div class="versus-grid">${contenderButton(match.a, room, 'a')}${contenderButton(match.b, room, 'b')}<div class="versus-badge">VS</div></div>
  ${match.revealed ? `<div class="reveal-banner">✳ <span>${esc(match.outcome.winner.name)}</span> advances to the next round!</div>` : ''}
  <div class="action-row">${isHost ? match.revealed
    ? `<button class="button button-primary button-large" data-action="next">${isLast ? 'Reveal champion 🏆' : 'Next matchup →'}</button>`
    : `<button class="button button-primary button-large" data-action="reveal" ${match.voteCount ? '' : 'disabled'}>Reveal votes ✳</button><span class="waiting-message">${match.voteCount} vote${match.voteCount === 1 ? '' : 's'} cast</span>`
    : `<p class="waiting-message">${match.revealed ? 'Waiting for the host to move to the next matchup…' : match.myVote ? '✓ Vote locked in. Waiting for the host to reveal…' : 'Pick a contender to cast your vote.'}</p>`}</div>
  </section><aside class="panel game-sidebar"><h3>⚡ Match day</h3><div class="vote-stat"><span>Votes cast</span><strong>${match.voteCount}<span style="font-size:15px"> / ${online}</span></strong></div>
  <div class="vote-stat"><span>Round</span><strong>${room.round}</strong></div>
  <h3 style="margin-top:28px">👥 Your squad</h3>${playerList(room, true)}<div class="sidebar-division"></div>
  <button class="button button-secondary full-button" data-action="copy-room">🔗 Invite a friend</button><p class="sidebar-caption">${isHost ? 'You are the host! You reveal votes and advance the tournament when everyone is ready.' : 'Votes stay secret until the host reveals them. You can change your pick before the reveal.'}</p></aside></div></div>`;
}
function finishHtml(room) {
  const champ = room.champion;
  const isHost = room.hostId === state.playerId;
  const reversed = [...room.history].reverse();
  return `<div class="page">${roomHeader(room)}<div class="champion-page"><div class="champion-icon">🏆</div><span class="eyebrow">✳ THE ULTIMATE CHAMPION</span>
  <h2>We have a <span class="gradient-text">winner!</span></h2><p class="subhead">${room.totalMatches} matchups. One undisputed champion. Unless the group chat disagrees.</p>
  <div class="champion-card"><div class="contender-media">${image(champ)}</div><strong>${esc(champ.name)} ✳</strong></div>
  <div class="hero-actions" style="justify-content:center;margin-top:23px">${isHost ? `<button class="button button-primary" data-action="play-again">Play again ↗</button>` : ''}
  <button class="button button-secondary" data-action="share-winner">🔗 Share results</button><button class="button button-secondary" data-action="home">Explore more packs</button></div>
  <h3 class="detail-item-label" style="text-align:left;margin-top:45px">Match history</h3><div class="recap-list">${reversed.map(m => `<div class="recap-row">
  <div><span class="re-title">ROUND ${m.round} · ${m.scores.a} – ${m.scores.b} votes</span><div style="margin-top:5px">${esc(m.a.name)} <span style="color:var(--muted)">vs</span> ${esc(m.b.name)}</div></div><b>🏆 ${esc(m.winner.name)}</b></div>`).join('')}</div></div></div>`;
}
function renderRoom() {
  const room = state.room;
  if (!room || route().type !== 'room' || route().id.toUpperCase() !== room.code) return;
  app.innerHTML = room.status === 'lobby' ? lobbyHtml(room) : room.status === 'playing' ? gameHtml(room) : finishHtml(room);
}
async function joinRoomFromLink(code) {
  if (route().type !== 'room' || route().id.toUpperCase() !== code) return;
  if (!state.name) {
    openModal({ type: 'name', title: 'Before you jump in…', caption: `Choose the name your friends will see in room ${code}.`, onConfirm: () => joinRoomFromLink(code) });
    return;
  }
  try { await rpc('room:join', { code, name: state.name, playerId: state.playerId }); }
  catch (err) { if (route().id.toUpperCase() === code) renderNotFound(err.message); toast(err.message, true); }
}
async function hostPack(packId) {
  if (!state.name) {
    openModal({ type: 'name', title: 'What should we call you?', caption: 'You will be the host. Your friends will see this name.', onConfirm: () => hostPack(packId) });
    return;
  }
  try {
    const response = await rpc('room:create', { packId, name: state.name, playerId: state.playerId });
    navigate(`/room/${response.code}`);
  } catch (err) { toast(err.message, true); }
}
async function roomAction(action, data = {}) {
  try { await rpc(`room:${action}`, data); }
  catch (err) { toast(err.message, true); }
}
async function copyRoom(winner = false) {
  const room = state.room;
  if (!room) return;
  const link = `${location.origin}/room/${room.code}`;
  const contents = winner ? `🏆 ${room.champion.name} won "${room.pack.title}" on Duel Club! ${link}` : link;
  try { await navigator.clipboard.writeText(contents); toast(winner ? 'Results copied to clipboard!' : 'Invite link copied!'); }
  catch { window.prompt('Copy this link:', contents); }
}

function openModal(config) { modalState = config; renderModal(); }
function closeModal() { modalState = null; modalRoot.innerHTML = ''; }
function renderModal() {
  if (!modalState) return;
  const type = modalState.type;
  const join = type === 'join';
  modalRoot.innerHTML = `<div class="modal-backdrop" id="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <button type="button" class="modal-close" data-modal-close aria-label="Close">×</button><div class="modal-art">${join ? '🔗' : '👋'}</div>
  <h2 id="modal-title">${esc(modalState.title || (join ? 'Join the party.' : 'What should we call you?'))}</h2>
  <p>${esc(modalState.caption || (join ? 'Enter your room code and nickname. No account, no hassle.' : 'Your friends will see this nickname in the room.'))}</p>
  <form class="join-form" id="modal-form">${join ? `<label for="modal-code">Room code</label><input id="modal-code" name="code" value="${esc(modalState.code || '')}" maxlength="6" placeholder="e.g. AB2CD3" required autocomplete="off">` : ''}
  <label for="modal-name">Your nickname</label><input id="modal-name" name="name" value="${esc(state.name)}" maxlength="24" placeholder="e.g. Vlad" required autocomplete="nickname">
  <button class="button button-primary" type="submit">${join ? 'Join room →' : 'Continue →'}</button></form>
  ${join ? '<div class="modal-alternative">Want your own showdown? <a href="/create" data-link>Create a pack ↗</a></div>' : ''}</div></div>`;
  setTimeout(() => $(join ? '#modal-code' : '#modal-name')?.focus(), 0);
}
async function modalSubmit(ev) {
  ev.preventDefault();
  // The submit listener is delegated from document, so currentTarget is document.
  // Read the submitted <form> from target instead (otherwise Continue appears to do nothing).
  const form = ev.target;
  const nickname = form.elements.name.value.trim().slice(0,24);
  if (!nickname) return toast('Enter a nickname first.', true);
  state.name = nickname; localStorage.setItem('duelclub:name', nickname); refreshNameChip();
  const existingModal = modalState;
  if (existingModal.type === 'join') {
    const code = form.elements.code.value.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
    if (code.length !== 6) return toast('Room codes contain 6 characters.', true);
    closeModal(); navigate(`/room/${code}`);
  } else {
    closeModal();
    if (existingModal.onConfirm) existingModal.onConfirm();
    else if (route().type === 'room') joinRoomFromLink(route().id.toUpperCase());
    else if (route().type === 'studio') joinStudioFromLink(route().id.toUpperCase());
    else toast('Nickname saved!');
  }
}

// Delegation: the page is re-rendered every time the room state changes.
document.addEventListener('click', event => {
  const link = event.target.closest('a[data-link]');
  if (link) { event.preventDefault(); navigate(link.getAttribute('href')); return; }
  if (event.target.closest('[data-modal-close]') || event.target.id === 'modal-backdrop') { closeModal(); return; }
  const pack = event.target.closest('[data-pack]');
  if (pack) { navigate(`/pack/${encodeURIComponent(pack.dataset.pack)}`); return; }
  const studioRemove = event.target.closest('[data-studio-remove]');
  if (studioRemove) { studioAction('remove', { id: studioRemove.dataset.studioRemove }); return; }
  const remove = event.target.closest('[data-remove]');
  if (remove && state.builder) { state.builder.items = state.builder.items.filter(x => x.key !== remove.dataset.remove); renderBuilder(); return; }
  const vote = event.target.closest('[data-vote]');
  if (vote && !vote.disabled) { roomAction('vote', { choice: vote.dataset.vote }); return; }
  const actionNode = event.target.closest('[data-action]');
  if (!actionNode) return;
  const action = actionNode.dataset.action;
  if (action === 'home') navigate('/');
  else if (action === 'create') { state.builder = null; navigate('/create'); }
  else if (action === 'create-together') createStudio();
  else if (action === 'copy-studio') copyStudio();
  else if (action === 'studio-add') { const name = window.prompt('Name your contender:'); if (name?.trim()) studioAction('add', { item: { name: name.trim(), image:'', kind:'image' } }); }
  else if (action === 'studio-publish') {
    if (state.studioUploading) return toast('Wait for uploads to finish.', true);
    flushStudioChanges().then(ok => { if (ok) studioAction('publish'); });
  }
  else if (action === 'refresh') showPage();
  else if (action === 'join') openModal({ type: 'join' });
  else if (action === 'host') hostPack(actionNode.dataset.id);
  else if (action === 'add-entry') { if (state.builder.items.length >= 64) toast('64 contenders max.', true); else { state.builder.items.push(blankEntry()); renderBuilder(); } }
  else if (action === 'save-pack') savePack();
  else if (action === 'copy-room') copyRoom();
  else if (action === 'start' || action === 'reveal' || action === 'next') roomAction(action);
  else if (action === 'play-again') hostPack(state.room.pack.id);
  else if (action === 'share-winner') copyRoom(true);
});
document.addEventListener('input', event => {
  const target = event.target;
  if (route().type === 'studio' && state.draft?.status === 'editing') {
    if (target.dataset.studioMeta) {
      state.draft[target.dataset.studioMeta] = target.value;
      if (target.dataset.studioMeta !== 'category') changeStudioField('meta', '', target.dataset.studioMeta, target.value);
    } else if (target.dataset.studioEntry) {
      const entry = state.draft.items.find(x => x.id === target.dataset.studioEntry);
      if (entry) { entry[target.dataset.studioField] = target.value;
        changeStudioField('edit', entry.id, target.dataset.studioField, target.value); }
    }
    return;
  }
  if (!state.builder || route().type !== 'create') return;
  if (target.dataset.formField) {
    state.builder[target.dataset.formField] = target.value;
    if (target.dataset.formField === 'title') {
      const heading = $('.sticky-panel h3'); if (heading) heading.textContent = target.value || 'Your epic showdown';
    }
    if (target.dataset.formField === 'description') {
      const p = $('.sticky-panel .subhead'); if (p) p.textContent = target.value || 'Which choice will come out on top?';
    }
  }
  if (target.dataset.entry) {
    const row = state.builder.items.find(x => x.key === target.dataset.entry);
    if (row) row[target.dataset.entryField] = target.value;
  }
});
document.addEventListener('change', event => {
  if (event.target.id === 'file-upload' && state.builder) uploadFiles(event.target.files);
  if (event.target.id === 'studio-upload' && state.draft) uploadStudioFiles(event.target.files);
  if (route().type === 'studio' && state.draft?.status === 'editing' && event.target.dataset.studioEntry) {
    const entry = state.draft.items.find(x => x.id === event.target.dataset.studioEntry);
    if (entry && event.target.dataset.studioField === 'kind') {
      entry.kind = event.target.value; studioAction('edit', { id: entry.id, field:'kind', value: entry.kind });
    } else if (entry && event.target.dataset.studioField === 'image') {
      if (/\.(mp4|webm|mov)(?:[?#]|$)/i.test(entry.image)) { entry.kind = 'video'; studioAction('edit', { id: entry.id, field:'kind', value:'video' }); }
    }
  }
  if (route().type === 'studio' && state.draft?.status === 'editing' && event.target.dataset.studioMeta === 'category') {
    studioAction('meta', { field:'category', value:event.target.value });
  }
  if (event.target.dataset.formField === 'category' && state.builder) state.builder.category = event.target.value;
  if (event.target.dataset.entryField === 'image' && state.builder) {
    const row = state.builder.items.find(x => x.key === event.target.dataset.entry);
    if (row && /\.(mp4|webm|mov)(?:[?#]|$)/i.test(row.image)) row.kind = 'video';
    renderBuilder();
  }
  if (event.target.dataset.entryField === 'kind' && state.builder) {
    const row = state.builder.items.find(x => x.key === event.target.dataset.entry);
    if (row) row.kind = event.target.value;
    renderBuilder();
  }
});
document.addEventListener('submit', event => { if (event.target.id === 'modal-form') modalSubmit(event); });
$('#join-top').addEventListener('click', () => openModal({ type: 'join' }));
$('#name-chip').addEventListener('click', () => openModal({ type: 'name', title: 'Your player nickname', caption: 'Set the name everyone sees when you join games.' }));
window.addEventListener('popstate', showPage);
socket.on('draft:state', draft => {
  if (route().type === 'studio' && route().id.toUpperCase() === draft.code) {
    const published = draft.status === 'published' && state.draft?.status !== 'published';
    restorePendingStudioFields(draft);
    state.draft = draft; renderStudio();
    if (published) toast('Pack published! 🎉');
  }
});
socket.on('room:state', room => {
  if (route().type === 'room' && route().id.toUpperCase() === room.code) { state.room = room; renderRoom(); }
});
socket.on('connect', () => { const r = route(); if (r.type === 'room' && r.id && state.name) joinRoomFromLink(r.id.toUpperCase());
  if (r.type === 'studio' && r.id && state.name) joinStudioFromLink(r.id.toUpperCase()); });
socket.on('disconnect', () => { if (['room', 'studio'].includes(route().type)) toast('Connection lost. Reconnecting…', true); });
refreshNameChip();
showPage();
