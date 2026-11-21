/* Sign-in tests: node --test test/
   Plays Google's part with a key made here, and checks every rule the API enforces. */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/index.js';

const env = {
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  ALLOWED_DOMAIN: 'punahou.edu',
  ALLOWED_ORIGINS: 'https://drichardi.github.io,http://localhost:8123',
  ALLOWED_EMAILS: 'teacher.one@punahou.edu, teacher.two@punahou.edu',
  SESSION_SECRET: 'x'.repeat(48)
};
const ORIGIN = 'https://drichardi.github.io';
let googleKeys, otherKeys;

const b64url = bytes => Buffer.from(bytes).toString('base64url');
const enc = o => b64url(Buffer.from(JSON.stringify(o)));

async function rsaPair() {
  return crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
}

async function googleToken(over = {}, keys = googleKeys, kid = 'test-kid') {
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, sub: '123',
    email: 'teacher.one@punahou.edu', email_verified: true, hd: 'punahou.edu', name: 'Teacher One',
    picture: 'https://example.com/p.png', iat: now, exp: now + 3600, ...over };
  const signed = `${enc({ alg: 'RS256', kid, typ: 'JWT' })}.${enc(claims)}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', keys.privateKey, Buffer.from(signed));
  return `${signed}.${b64url(new Uint8Array(sig))}`;
}

function call(path, { method = 'GET', body, token, origin = ORIGIN } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) headers.Origin = origin;
  if (token) headers.Authorization = `Bearer ${token}`;
  return worker.fetch(new Request(`https://api.test${path}`,
    { method, headers, body: body && JSON.stringify(body) }), env);
}
const signIn = async credential => call('/session', { method: 'POST', body: { credential } });

before(async () => {
  googleKeys = await rsaPair();
  otherKeys = await rsaPair();
  const jwk = { ...(await crypto.subtle.exportKey('jwk', googleKeys.publicKey)), kid: 'test-kid', alg: 'RS256', use: 'sig' };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, ...rest) => String(url).startsWith('https://www.googleapis.com/oauth2/v3/certs')
    ? new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'Cache-Control': 'max-age=600' } })
    : realFetch(url, ...rest);
});

test('a teacher on the list gets a session, and /me knows them', async () => {
  const res = await signIn(await googleToken());
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.user.email, 'teacher.one@punahou.edu');
  assert.equal(body.user.name, 'Teacher One');
  assert.ok(body.expires > Date.now() / 1000 + 7 * 3600);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);

  const me = await call('/me', { token: body.token });
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.email, 'teacher.one@punahou.edu');
});

test('the list is case-insensitive and holds both teachers', async () => {
  const res = await signIn(await googleToken({ email: 'Teacher.Two@Punahou.edu' }));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).user.email, 'teacher.two@punahou.edu');
});

test('a school account not on the list is turned away by name', async () => {
  const res = await signIn(await googleToken({ email: 'student@punahou.edu' }));
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error, 'not_on_list');
  assert.equal(body.email, 'student@punahou.edu');
});

test('an account from another domain is refused, even if its email matches', async () => {
  const res = await signIn(await googleToken({ hd: undefined, email: 'teacher.one@punahou.edu' }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).error, 'wrong_domain');
  const res2 = await signIn(await googleToken({ hd: 'gmail.com' }));
  assert.equal((await res2.json()).error, 'wrong_domain');
});

test('tokens meant for another app, from another issuer, or unverified are refused', async () => {
  for (const over of [{ aud: 'someone-else' }, { iss: 'https://evil.example' }, { email_verified: false }]) {
    const res = await signIn(await googleToken(over));
    assert.equal(res.status, 401, JSON.stringify(over));
    assert.equal((await res.json()).error, 'invalid_token');
  }
});

test('an expired Google token is refused', async () => {
  const now = Math.floor(Date.now() / 1000);
  const res = await signIn(await googleToken({ iat: now - 7200, exp: now - 3600 }));
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'expired');
});

test('a token not signed by Google, or tampered with, is refused', async () => {
  const forged = await signIn(await googleToken({}, otherKeys));
  assert.equal(forged.status, 401);
  const good = await googleToken();
  const [h, , s] = good.split('.');
  const tampered = `${h}.${enc({ email: 'teacher.one@punahou.edu', hd: 'punahou.edu', aud: env.GOOGLE_CLIENT_ID })}.${s}`;
  assert.equal((await signIn(tampered)).status, 401);
  assert.equal((await signIn('not-a-jwt')).status, 401);
  assert.equal((await call('/session', { method: 'POST', body: {} })).status, 400);
});

test('sessions: missing, forged, or for someone removed from the list', async () => {
  assert.equal((await call('/me')).status, 401);
  const { token } = await (await signIn(await googleToken())).json();
  const [h, p, s] = token.split('.');
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  const forged = `${h}.${enc({ ...claims, sub: 'teacher.two@punahou.edu' })}.${s}`;
  assert.equal((await call('/me', { token: forged })).status, 401);

  const removed = await worker.fetch(new Request('https://api.test/me',
    { headers: { Authorization: `Bearer ${token}`, Origin: ORIGIN } }),
    { ...env, ALLOWED_EMAILS: 'teacher.two@punahou.edu' });
  assert.equal(removed.status, 403);
});

test('only the dashboard pages may call it from a browser', async () => {
  const pre = await call('/session', { method: 'OPTIONS' });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.match(pre.headers.get('Access-Control-Allow-Headers'), /Authorization/);

  const evil = await call('/session', { method: 'OPTIONS', origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('Access-Control-Allow-Origin'), null);
  const evilPost = await call('/session', { method: 'POST', body: { credential: await googleToken() }, origin: 'https://evil.example' });
  assert.equal(evilPost.headers.get('Access-Control-Allow-Origin'), null);
});

test('a missing setting is reported plainly', async () => {
  const res = await worker.fetch(new Request('https://api.test/me'), { ...env, SESSION_SECRET: '' });
  assert.equal(res.status, 500);
  assert.match((await res.json()).message, /SESSION_SECRET/);
});
