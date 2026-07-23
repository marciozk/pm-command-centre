const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

const digestBytes = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
const digest = async value => {
  return [...await digestBytes(value)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
};

const toBase64 = bytes => btoa(String.fromCharCode(...bytes));
const fromBase64 = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));
const toBase64Url = bytes => toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const fromBase64Url = value => fromBase64(value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4));
const cookie = (name, value, options = '') => `${name}=${value}; Path=/; Secure; HttpOnly; SameSite=Lax${options}`;
const cookies = request => Object.fromEntries((request.headers.get('cookie') || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(parts => parts.length === 2));
function navigationPage(target, title, setCookie) {
  const safeTarget = JSON.stringify(target).replace(/</g, '\\u003c');
  const headers = new Headers({
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff'
  });
  if (setCookie) headers.set('set-cookie', setCookie);
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center;margin:0;background:#f8fafc;color:#172033}main{max-width:32rem;padding:2rem;text-align:center}a{color:#2457d6}</style><main><h1>${title}</h1><p>Please wait. If nothing happens, <a id="continue">continue here</a>.</p></main><script>const target=${safeTarget};document.querySelector('#continue').href=target;window.location.replace(target);</script></html>`, {
    status: 200,
    headers
  });
}
function githubLoginPage(env, url) {
  const state = toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const target = new URL('https://github.com/login/oauth/authorize');
  target.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  target.searchParams.set('redirect_uri', `${url.origin}/auth/callback`);
  target.searchParams.set('scope', 'read:user');
  target.searchParams.set('state', state);
  return navigationPage(target.toString(), 'Signing in with GitHub', cookie('pmcc_oauth_state', state, '; Max-Age=600'));
}
async function sessionKey(env) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function createSession(env, user) {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ id: user.id, login: user.login, exp: Date.now() + 30 * 86400000 })));
  const signature = toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', await sessionKey(env), new TextEncoder().encode(payload))));
  return `${payload}.${signature}`;
}
async function readSession(request, env) {
  try {
    const [payload, signature] = (cookies(request).pmcc_session || '').split('.');
    if (!payload || !signature || !await crypto.subtle.verify('HMAC', await sessionKey(env), fromBase64Url(signature), new TextEncoder().encode(payload))) return null;
    const user = JSON.parse(new TextDecoder().decode(fromBase64Url(payload)));
    return user.exp > Date.now() && String(user.login).toLowerCase() === String(env.GITHUB_ALLOWED_LOGIN).toLowerCase() ? user : null;
  } catch { return null; }
}
async function encryptionKey(env, email) {
  return crypto.subtle.importKey('raw', await digestBytes(`${env.SYNC_SECRET}:${email}`), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function encryptPayload(env, email, value) {
  const key = await encryptionKey(env, email), iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(value)));
  return JSON.stringify({ iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(encrypted)) });
}
async function decryptPayload(env, email, value) {
  const payload = JSON.parse(value), key = await encryptionKey(env, email);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(payload.iv) }, key, fromBase64(payload.ciphertext));
  return JSON.parse(new TextDecoder().decode(decrypted));
}

async function syncRequest(request, env) {
  const user = await readSession(request, env);
  if (!user) return json({ error: 'Sign-in required.' }, 401);
  const identity = `github:${user.id}`, workspaceId = await digest(identity), tokenHash = 'github-oauth';
  const existing = await env.DB.prepare('SELECT token_hash, payload, revision, updated_at FROM sync_workspaces WHERE id = ?')
    .bind(workspaceId).first();

  if (request.method === 'GET') {
    if (!existing) return json({ error: 'Sync workspace not found.' }, 404);
    return json({ data: await decryptPayload(env, identity, existing.payload), revision: existing.revision, updatedAt: existing.updated_at });
  }

  if (request.method === 'PUT') {
    const body = await request.json().catch(() => null);
    if (!body || typeof body.data !== 'object') return json({ error: 'Invalid sync payload.' }, 400);
    const encryptedPayload = await encryptPayload(env, identity, body.data);
    if (encryptedPayload.length > 900000) return json({ error: 'Encrypted payload is too large.' }, 413);
    const expectedRevision = Number(body.expectedRevision || 0);
    if (existing && expectedRevision !== Number(existing.revision)) return json({ error: 'Remote data changed.', revision: existing.revision }, 409);
    const revision = existing ? Number(existing.revision) + 1 : 1;
    const updatedAt = new Date().toISOString();
    await env.DB.prepare(`INSERT INTO sync_workspaces (id, token_hash, payload, revision, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, revision = excluded.revision, updated_at = excluded.updated_at`)
      .bind(workspaceId, tokenHash, encryptedPayload, revision, updatedAt).run();
    return json({ revision, updatedAt }, existing ? 200 : 201);
  }
  return json({ error: 'Method not allowed.' }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (['/service-worker.js', '/manifest.webmanifest', '/assets/icon-192.png', '/assets/icon-512.png'].includes(url.pathname)) return env.ASSETS.fetch(request);
    if (url.pathname === '/auth/login') return githubLoginPage(env, url);
    if (url.pathname === '/auth/callback') {
      const state = cookies(request).pmcc_oauth_state;
      if (!state || state !== url.searchParams.get('state') || !url.searchParams.get('code')) return new Response('Invalid sign-in request.', { status: 400 });
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ client_id: env.GITHUB_CLIENT_ID, client_secret: env.GITHUB_CLIENT_SECRET, code: url.searchParams.get('code'), redirect_uri: `${url.origin}/auth/callback` }) });
      const token = await tokenResponse.json();if (!token.access_token) return new Response('GitHub sign-in failed.', { status: 401 });
      const userResponse = await fetch('https://api.github.com/user', { headers: { authorization: `Bearer ${token.access_token}`, accept: 'application/vnd.github+json', 'user-agent': 'PM-Command-Centre' } });
      const user = await userResponse.json();if (String(user.login).toLowerCase() !== String(env.GITHUB_ALLOWED_LOGIN).toLowerCase()) return new Response('This GitHub account is not allowed.', { status: 403 });
      return navigationPage('/', 'Sign-in complete', cookie('pmcc_session', await createSession(env, user), '; Max-Age=2592000'));
    }
    if (url.pathname === '/auth/logout') return navigationPage('/', 'Signed out', cookie('pmcc_session', '', '; Max-Age=0'));
    if (url.pathname === '/api/sync' && ['GET', 'PUT'].includes(request.method)) return syncRequest(request, env);
    if (!await readSession(request, env)) return githubLoginPage(env, url);
    return env.ASSETS.fetch(request);
  }
};
