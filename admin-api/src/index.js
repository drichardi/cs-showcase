/* ============================================================
   CS Work dashboard API — a Cloudflare Worker.

   Step 1: sign-in.
     POST /session  { credential }  Google ID token from "Sign in with Google"
                    -> { token, user, expires }  an 8-hour dashboard session,
                    only for a verified account in ALLOWED_DOMAIN that is on
                    the teacher list (ALLOWED_EMAILS).
     GET  /me       Authorization: Bearer <token>  -> { user }

   Settings (wrangler.toml [vars]): GOOGLE_CLIENT_ID, ALLOWED_DOMAIN, ALLOWED_ORIGINS
   Secrets (wrangler secret put):   SESSION_SECRET, ALLOWED_EMAILS
   The teacher list is a secret so it never sits in the public repo.

   No dependencies: Google's signature and our session are checked with WebCrypto.
   ============================================================ */

const GOOGLE_CERTS = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const SESSION_HOURS = 8;
const CLOCK_SKEW = 60;              // seconds of leeway on token times

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    }
    try {
      checkConfig(env);
      const { pathname } = new URL(request.url);
      if (pathname === '/session' && request.method === 'POST') {
        return json(await createSession(request, env), 200, cors);
      }
      if (pathname === '/me' && request.method === 'GET') {
        return json({ user: await requireUser(request, env) }, 200, cors);
      }
      return json({ error: 'not_found' }, 404, cors);
    } catch (e) {
      if (e instanceof HttpError) {
        return json({ error: e.code, message: e.message, ...e.extra }, e.status, cors);
      }
      console.error(e);
      return json({ error: 'server_error', message: 'Something went wrong on the server.' }, 500, cors);
    }
  }
};

/* ---------- sign-in ---------- */

async function createSession(request, env) {
  const body = await request.json().catch(() => ({}));
  if (typeof body.credential !== 'string' || !body.credential) {
    throw new HttpError(400, 'bad_request', 'No Google sign-in was sent.');
  }
  const claims = await verifyGoogleToken(body.credential, env);
  const email = claims.email.toLowerCase();
  if (!teacherList(env).includes(email)) {
    throw new HttpError(403, 'not_on_list', `${email} isn't on the teacher list.`, { email });
  }
  const now = Math.floor(Date.now() / 1000), exp = now + SESSION_HOURS * 3600;
  const user = { email, name: claims.name || email, picture: claims.picture || '' };
  const token = await signSession({ sub: email, name: user.name, picture: user.picture, iat: now, exp }, env);
  return { token, user, expires: exp };
}

/* A session is good while it hasn't expired and its teacher is still on the list,
   so taking someone off the list locks them out at their next request. */
async function requireUser(request, env) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) throw new HttpError(401, 'signed_out', 'Please sign in.');
  const claims = await verifySession(m[1], env);
  if (!teacherList(env).includes(claims.sub)) {
    throw new HttpError(403, 'not_on_list', `${claims.sub} isn't on the teacher list.`, { email: claims.sub });
  }
  return { email: claims.sub, name: claims.name, picture: claims.picture };
}

/* Google's ID token: signed by Google (RS256, key from its published certs), meant
   for our app (aud), current, with a verified email in the school's domain (hd). */
async function verifyGoogleToken(jwt, env) {
  const { header, claims, signed, signature } = parseJwt(jwt);
  if (header.alg !== 'RS256' || !header.kid) throw invalid();
  const jwk = await googleKey(header.kid);
  const key = await crypto.subtle.importKey('jwk', jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, signed)) throw invalid();

  const now = Date.now() / 1000;
  if (!GOOGLE_ISSUERS.includes(claims.iss)) throw invalid();
  if (claims.aud !== env.GOOGLE_CLIENT_ID) throw invalid();
  if (typeof claims.exp !== 'number' || claims.exp < now - CLOCK_SKEW) {
    throw new HttpError(401, 'expired', 'That sign-in has expired. Please sign in again.');
  }
  if (typeof claims.iat === 'number' && claims.iat > now + 300) throw invalid();
  if (claims.email_verified !== true || typeof claims.email !== 'string') throw invalid();
  if ((claims.hd || '').toLowerCase() !== env.ALLOWED_DOMAIN.toLowerCase()) {
    throw new HttpError(403, 'wrong_domain', `Please sign in with your @${env.ALLOWED_DOMAIN} account.`,
      { email: claims.email.toLowerCase() });
  }
  return claims;
}

let certCache = { keys: [], until: 0 };
async function googleKey(kid, refreshed = false) {
  if (Date.now() > certCache.until || refreshed) {
    const res = await fetch(GOOGLE_CERTS);
    if (!res.ok) throw new Error(`Google certs: ${res.status}`);
    const maxAge = Number((res.headers.get('Cache-Control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
    certCache = { keys: (await res.json()).keys || [], until: Date.now() + maxAge * 1000 };
  }
  const key = certCache.keys.find(k => k.kid === kid);
  if (key) return key;
  if (!refreshed) return googleKey(kid, true);   // Google rotated its keys
  throw invalid();
}

/* ---------- our own session token (HS256 with SESSION_SECRET) ---------- */

async function signSession(claims, env) {
  const signed = `${b64urlJson({ alg: 'HS256', typ: 'JWT' })}.${b64urlJson(claims)}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), utf8(signed));
  return `${signed}.${b64url(new Uint8Array(sig))}`;
}

async function verifySession(token, env) {
  let parts;
  try { parts = parseJwt(token); } catch (e) { throw signedOut(); }
  if (parts.header.alg !== 'HS256') throw signedOut();
  if (!await crypto.subtle.verify('HMAC', await hmacKey(env), parts.signature, parts.signed)) throw signedOut();
  if (typeof parts.claims.exp !== 'number' || parts.claims.exp < Date.now() / 1000) throw signedOut();
  return parts.claims;
}

function hmacKey(env) {
  return crypto.subtle.importKey('raw', utf8(env.SESSION_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

/* ---------- helpers ---------- */

class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    Object.assign(this, { status, code, extra });
  }
}
const invalid = () => new HttpError(401, 'invalid_token', "That sign-in couldn't be checked. Please sign in again.");
const signedOut = () => new HttpError(401, 'signed_out', 'Your session has ended. Please sign in again.');

function teacherList(env) {
  return (env.ALLOWED_EMAILS || '').split(/[\s,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
}

function checkConfig(env) {
  const missing = ['GOOGLE_CLIENT_ID', 'ALLOWED_DOMAIN', 'ALLOWED_EMAILS', 'SESSION_SECRET'].filter(k => !env[k]);
  if (missing.length) throw new HttpError(500, 'not_configured', `Server is missing: ${missing.join(', ')}`);
  if (env.SESSION_SECRET.length < 32) throw new HttpError(500, 'not_configured', 'SESSION_SECRET must be at least 32 characters.');
}

/* Only the dashboard's own pages may call the API from a browser. */
function corsHeaders(request, env) {
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

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(cors || {}) }
  });
}

function parseJwt(jwt) {
  const parts = String(jwt).split('.');
  if (parts.length !== 3) throw invalid();
  try {
    return {
      header: JSON.parse(utf8Decode(b64urlBytes(parts[0]))),
      claims: JSON.parse(utf8Decode(b64urlBytes(parts[1]))),
      signed: utf8(`${parts[0]}.${parts[1]}`),
      signature: b64urlBytes(parts[2])
    };
  } catch (e) { throw invalid(); }
}

const utf8 = s => new TextEncoder().encode(s);
const utf8Decode = b => new TextDecoder().decode(b);
const b64urlJson = o => b64url(utf8(JSON.stringify(o)));
function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlBytes(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4));
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}
