/* ============================================================
   CS Work dashboard API — a Cloudflare Worker.

     POST /session   { credential }  Google sign-in -> 8-hour dashboard session
                                     (teacher list + school domain only)
     GET  /me        who is signed in
     GET  /projects  every project in cs-student-work, shown or hidden, plus
                     sketch folders that still need a project.yml
     GET  /file?path=…  a cover image or video from the (private) repo
     POST /projects  add a project: details + files in, one commit out
     GET  /status?commit=…  is that save published on the site yet?

   Everything except POST /session needs  Authorization: Bearer <session>.

   Settings (wrangler.toml [vars]): GOOGLE_CLIENT_ID, ALLOWED_DOMAIN, ALLOWED_ORIGINS,
     GITHUB_APP_ID, GITHUB_INSTALLATION_ID, GITHUB_REPO, GITHUB_BRANCH
   Secrets (wrangler secret put): SESSION_SECRET, ALLOWED_EMAILS, GITHUB_APP_KEY
   ============================================================ */
import { HttpError, corsHeaders, json } from './http.js';
import { createSession, requireUser } from './auth.js';
import { listProjects, readFile } from './projects.js';
import { createProject, publishStatus } from './write.js';

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    }
    try {
      const url = new URL(request.url);
      const route = `${request.method} ${url.pathname}`;

      if (route === 'POST /session') return json(await createSession(request, env), 200, cors);
      if (route === 'GET /me') return json({ user: await requireUser(request, env) }, 200, cors);
      if (route === 'GET /projects') {
        await requireUser(request, env);
        return json(await listProjects(env), 200, cors);
      }
      if (route === 'POST /projects') {
        const user = await requireUser(request, env);
        return json(await createProject(request, env, user), 200, cors);
      }
      if (route === 'GET /status') {
        await requireUser(request, env);
        return json(await publishStatus(env, url.searchParams.get('commit')), 200, cors);
      }
      if (route === 'GET /file') {
        await requireUser(request, env);
        const res = await readFile(env, url.searchParams.get('path'));
        for (const [k, v] of Object.entries(cors || {})) res.headers.set(k, v);
        return res;
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
