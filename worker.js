const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const validWorkspace = value => /^[0-9a-f-]{36}$/i.test(value || '');
const validToken = value => /^[A-Za-z0-9_-]{43}$/.test(value || '');
const digest = async value => {
  const bytes = new TextEncoder().encode(value);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
};

async function syncRequest(request, env) {
  const workspaceId = request.headers.get('x-pmcc-workspace') || '';
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!validWorkspace(workspaceId) || !validToken(token)) return json({ error: 'Invalid sync credentials.' }, 401);
  const tokenHash = await digest(token);
  const existing = await env.DB.prepare('SELECT token_hash, payload, revision, updated_at FROM sync_workspaces WHERE id = ?')
    .bind(workspaceId).first();

  if (request.method === 'GET') {
    if (!existing || existing.token_hash !== tokenHash) return json({ error: 'Sync workspace not found.' }, 404);
    return json({ payload: JSON.parse(existing.payload), revision: existing.revision, updatedAt: existing.updated_at });
  }

  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.payload !== 'object' || typeof body.payload.iv !== 'string' || typeof body.payload.ciphertext !== 'string') return json({ error: 'Invalid encrypted payload.' }, 400);
    if (body.payload.ciphertext.length > 900000) return json({ error: 'Encrypted payload is too large.' }, 413);
    if (existing && existing.token_hash !== tokenHash) return json({ error: 'Sync workspace not found.' }, 404);
    const expectedRevision = Number(body.expectedRevision || 0);
    if (existing && expectedRevision !== Number(existing.revision)) return json({ error: 'Remote data changed.', revision: existing.revision }, 409);
    const revision = existing ? Number(existing.revision) + 1 : 1;
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO sync_workspaces (id, token_hash, payload, revision, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, revision = excluded.revision, updated_at = excluded.updated_at`)
      .bind(workspaceId, tokenHash, JSON.stringify(body.payload), revision, updatedAt).run();
    return json({ revision, updatedAt }, existing ? 200 : 201);
  }
  return json({ error: 'Method not allowed.' }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/sync' && ['GET', 'PUT'].includes(request.method)) return syncRequest(request, env);
    return env.ASSETS.fetch(request);
  }
};
