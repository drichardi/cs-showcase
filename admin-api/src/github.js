/* Talking to GitHub as the "Punahou CS Work Dashboard" app.

   The app's private key (GITHUB_APP_KEY, base64 PKCS#8) signs a short JWT that
   proves we are the app; GitHub trades it for an installation token that works on
   cs-student-work only, for an hour. Read-only work asks for a read-only token. */
import { HttpError, requireSettings, utf8, b64url, b64urlJson } from './http.js';

const API = 'https://api.github.com';
const tokens = {};                  // { read|write: { token, expires } }, reused for ~55 min

export function repoParts(env) {
  const [owner, name] = env.GITHUB_REPO.split('/');
  return { owner, name };
}

async function appJwt(env) {
  // base64 of the PKCS#8 key (PEM armour and line breaks tolerated)
  const der = Uint8Array.from(atob(env.GITHUB_APP_KEY.replace(/-----[^-]+-----|\s/g, '')), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const signed = `${b64urlJson({ alg: 'RS256', typ: 'JWT' })}.${b64urlJson({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID })}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, utf8(signed));
  return `${signed}.${b64url(new Uint8Array(sig))}`;
}

export async function installationToken(env, access = 'read') {
  requireSettings(env, ['GITHUB_APP_ID', 'GITHUB_INSTALLATION_ID', 'GITHUB_REPO', 'GITHUB_APP_KEY']);
  const cached = tokens[access];
  if (cached && cached.expires - Date.now() > 5 * 60 * 1000) return cached.token;
  const res = await fetch(`${API}/app/installations/${env.GITHUB_INSTALLATION_ID}/access_tokens`, {
    method: 'POST',
    headers: headers(await appJwt(env)),
    body: JSON.stringify({
      repositories: [repoParts(env).name],
      permissions: access === 'write' ? { contents: 'write', actions: 'read' } : { contents: 'read', actions: 'read' }
    })
  });
  if (!res.ok) throw githubError(res.status, await res.text());
  const body = await res.json();
  tokens[access] = { token: body.token, expires: Date.parse(body.expires_at) };
  return body.token;
}

/* REST call on the repo's API. path is relative to /repos/<owner>/<name>. */
export async function gh(env, path, { method = 'GET', body, access = 'read', accept, raw = false } = {}) {
  const res = await fetch(`${API}/repos/${env.GITHUB_REPO}${path}`, {
    method,
    headers: { ...headers(await installationToken(env, access)), ...(accept ? { Accept: accept } : {}) },
    body: body instanceof Blob ? body : body && JSON.stringify(body)   // a Blob goes as is
  });
  if (!res.ok) throw githubError(res.status, await res.text());
  return raw ? res : res.json();
}

export async function graphql(env, query, variables = {}) {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: headers(await installationToken(env, 'read')),
    body: JSON.stringify({ query, variables })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.errors) throw githubError(res.status, JSON.stringify(body.errors || body));
  return body.data;
}

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'cs-work-dashboard'
  };
}

function githubError(status, detail) {
  console.error('GitHub', status, String(detail).slice(0, 500));
  const e = new HttpError(502, 'github_error', status === 404
    ? "The student-work repo couldn't be found. Is the dashboard app still installed on it?"
    : `GitHub didn't answer as expected (${status}). Try again in a minute.`);
  e.githubStatus = status;           // callers can treat a missing file as their own 404
  return e;
}
