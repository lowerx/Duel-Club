// Duel Club persistent data + media adapter. Uses native Node.js fetch: no extra npm dependency.
// All privileged Supabase requests happen server-side; NEVER expose SUPABASE_SECRET_KEY.
import fs from 'node:fs/promises';

export function makePersistentStore(env = process.env, transport = fetch) {
  const base = (env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!!base !== !!key) throw new Error('Set BOTH SUPABASE_URL and SUPABASE_SECRET_KEY on Render.');
  const enabled = !!base && !!key;
  if (enabled && !/^https:\/\/[^/?#]+\.supabase\.co$/i.test(base)) {
    throw new Error('SUPABASE_URL must be a Supabase HTTPS project URL.');
  }
  const bucket = 'duel-media';
  const queues = new Map();

  async function request(route, { method = 'GET', json, body, headers = {} } = {}) {
    const response = await transport(`${base}${route}`, {
      method,
      headers: {
        apikey: key,
        // New sb_secret_ keys are NOT JWTs; do not send them in Authorization.
        ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}),
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers
      },
      body: json !== undefined ? JSON.stringify(json) : body,
      signal: AbortSignal.timeout(30000)
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 350);
      throw new Error(`Supabase ${method} ${route.split('?')[0]} failed (${response.status}): ${detail}`);
    }
    if (response.status === 204) return null;
    const contentType = response.headers.get('content-type') || '';
    return contentType.includes('application/json') ? response.json() : response.text();
  }

  async function load() {
    if (!enabled) return null;
    const rows = await request('/rest/v1/duel_store?select=id,value');
    if (!Array.isArray(rows)) throw new Error('Supabase duel_store returned unexpected data');
    return Object.fromEntries(rows.map(row => [row.id, row.value]));
  }

  function save(id, value) {
    if (!enabled) return Promise.resolve();
    // Queue snapshots in order, so simultaneous studio edits cannot overwrite newer edits.
    const snapshot = structuredClone(value);
    const prior = queues.get(id) || Promise.resolve();
    const pending = prior.catch(() => {}).then(() => request('/rest/v1/duel_store?on_conflict=id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      json: { id, value: snapshot }
    }));
    queues.set(id, pending);
    return pending;
  }

  async function uploadMedia(filePath, filename, mimeType) {
    if (!enabled) throw new Error('Cloud upload not configured.');
    const bytes = await fs.readFile(filePath);
    const objectPath = `uploads/${filename}`;
    await request(`/storage/v1/object/${bucket}/${objectPath}`, {
      method: 'POST',
      headers: { 'Content-Type': mimeType, 'Cache-Control': '3600' },
      body: bytes
    });
    return `${base}/storage/v1/object/public/${bucket}/${objectPath}`;
  }

  return { enabled, load, save, uploadMedia };
}
