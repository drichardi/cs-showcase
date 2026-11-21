/* ============================================================
   Teacher dashboard. Step 1: signing in.

   "Sign in with Google" hands us a signed token from Google; the dashboard's
   server program (admin-api) checks it and the teacher list, and returns an
   8-hour session. The session lives in this browser tab only.
   ============================================================ */
(function () {
  const cfg = window.ADMIN_CONFIG;
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const API = (local ? cfg.LOCAL_API_BASE : cfg.API_BASE || '').replace(/\/+$/, '');
  const root = document.getElementById('admin');
  const KEY = 'cs-dashboard-session';
  let googleLoaded = false, session = load();

  /* ---------- session ---------- */
  function load() {
    try {
      const s = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      return s && s.expires > Date.now() / 1000 + 60 ? s : null;
    } catch (e) { return null; }
  }
  function save(s) {
    session = s;
    try { s ? sessionStorage.setItem(KEY, JSON.stringify(s)) : sessionStorage.removeItem(KEY); } catch (e) { /* private mode */ }
  }

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (session) headers.Authorization = 'Bearer ' + session.token;
    let res;
    try { res = await fetch(API + path, { ...options, headers }); }
    catch (e) { throw { error: 'offline' }; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw { status: res.status, ...body };
    return body;
  }

  /* ---------- views ---------- */
  const esc = window.esc;
  function show(state, data = {}) {
    root.dataset.state = state;
    root.innerHTML = {
      'not-connected': () => `
        <section class="admin-card">
          <h1>Teacher dashboard</h1>
          <p>The dashboard's server isn't set up yet, so nobody can sign in.</p>
        </section>`,
      'signed-out': () => `
        <section class="admin-card">
          <p class="mono admin-eyebrow">CS showcase · student work</p>
          <h1>Teacher dashboard</h1>
          <p>Add and update the student projects on the showcase. Sign in with your
             Punahou Google account.</p>
          <div id="googleButton" class="admin-google"></div>
          ${googleLoaded ? '' : '<p class="admin-note">Loading Google sign-in…</p>'}
          <p class="admin-note">Only CS teachers on the dashboard's list can sign in.</p>
        </section>`,
      'checking': () => `
        <section class="admin-card"><h1>Teacher dashboard</h1><p>Signing you in…</p></section>`,
      'refused': () => `
        <section class="admin-card">
          <h1>Not on the teacher list</h1>
          <p>${data.error === 'wrong_domain'
            ? `Please sign in with your <b>@${esc(cfg.SCHOOL_DOMAIN)}</b> account${data.email ? ` (you used ${esc(data.email)})` : ''}.`
            : `<b>${esc(data.email || 'That account')}</b> isn't on the dashboard's teacher list. If you teach CS,
               ask to be added.`}</p>
          <button class="btn btn-primary" id="tryAgain">Use a different account</button>
        </section>`,
      'error': () => `
        <section class="admin-card">
          <h1>Couldn't sign you in</h1>
          <p>${data.error === 'offline'
            ? "The dashboard's server didn't answer. Check your connection and try again in a minute."
            : esc(data.message || 'Something went wrong. Try again in a minute.')}</p>
          <button class="btn btn-primary" id="tryAgain">Try again</button>
        </section>`,
      'signed-in': () => `
        <section class="admin-card admin-me">
          ${session.user.picture ? `<img class="admin-avatar" src="${esc(session.user.picture)}" alt="" referrerpolicy="no-referrer">` : ''}
          <div>
            <p class="mono admin-eyebrow">Signed in</p>
            <h1>Hi, ${esc(session.user.name.split(' ')[0])}</h1>
            <p class="admin-who">${esc(session.user.email)}</p>
          </div>
          <button class="btn btn-ghost" id="signOut">Sign out</button>
        </section>
        <section class="admin-card admin-soon">
          <h2>Projects</h2>
          <p>Sign-in works. The list of projects, and adding and editing them, come next.</p>
        </section>`
    }[state]();

    if (state === 'signed-out') renderGoogleButton();
    const again = document.getElementById('tryAgain');
    if (again) again.addEventListener('click', signOut);
    const out = document.getElementById('signOut');
    if (out) out.addEventListener('click', signOut);
  }

  /* ---------- Google ---------- */
  function renderGoogleButton() {
    const el = document.getElementById('googleButton');
    if (!el || !googleLoaded) return;
    google.accounts.id.renderButton(el, { theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', width: 280 });
  }

  function googleReady() {
    googleLoaded = true;
    google.accounts.id.initialize({
      client_id: cfg.GOOGLE_CLIENT_ID,
      callback: onCredential,
      hd: cfg.SCHOOL_DOMAIN,        // only offers school accounts in the chooser
      auto_select: true,            // one click when you've signed in here before
      cancel_on_tap_outside: true
    });
    if (root.dataset.state === 'signed-out') show('signed-out');
  }

  async function onCredential(response) {
    show('checking');
    try {
      save(await api('/session', { method: 'POST', body: JSON.stringify({ credential: response.credential }) }));
      show('signed-in');
    } catch (e) {
      save(null);
      show(e.error === 'not_on_list' || e.error === 'wrong_domain' ? 'refused' : 'error', e);
    }
  }

  function signOut() {
    save(null);
    if (googleLoaded) google.accounts.id.disableAutoSelect();
    show('signed-out');
  }

  /* ---------- start ---------- */
  async function start() {
    if (!API) return show('not-connected');
    if (!session) return show('signed-out');
    show('checking');
    try {
      const { user } = await api('/me');      // still valid, and still on the list?
      save({ ...session, user });
      show('signed-in');
    } catch (e) {
      save(null);
      show(e.error === 'offline' ? 'error' : e.error === 'not_on_list' ? 'refused' : 'signed-out', e);
    }
  }

  window.AdminSignIn = { googleReady };
  if (window.google && google.accounts) googleReady();
  start();
})();
