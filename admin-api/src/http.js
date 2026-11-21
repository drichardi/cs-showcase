/* Small pieces shared by every route. */

export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    Object.assign(this, { status, code, extra });
  }
}

/* Only the dashboard's own pages may call the API from a browser. */
export function corsHeaders(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return null;
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  };
}

export function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(cors || {}) }
  });
}

export function requireSettings(env, names) {
  const missing = names.filter(k => !env[k]);
  if (missing.length) throw new HttpError(500, 'not_configured', `Server is missing: ${missing.join(', ')}`);
}

/* ---------- base64url and UTF-8 ---------- */
export const utf8 = s => new TextEncoder().encode(s);
export const utf8Decode = b => new TextDecoder().decode(b);
export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlBytes(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
export const b64urlJson = o => b64url(utf8(JSON.stringify(o)));
