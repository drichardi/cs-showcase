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
    // A note for the public pages (no sign-in details): a teacher is signed in here
    // until then, so they show a switch back to the dashboard.
    try { s ? localStorage.setItem('cs-teacher', JSON.stringify({ expires: s.expires })) : localStorage.removeItem('cs-teacher'); } catch (e) { /* blocked */ }
  }

  async function api(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (session) headers.Authorization = 'Bearer ' + session.token;
    let res;
    try { res = await fetch(API + path, { ...options, headers }); }
    catch (e) { throw { error: 'offline', message: "The dashboard's server didn't answer. Check your connection and try again." }; }
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && path !== '/session') throw expired(body);
    if (!res.ok) throw { status: res.status, ...body };
    return body;
  }

  /* A picture from the (private) repo, fetched with the session and handed back
     as a local object URL for an <img>. */
  async function file(path) {
    if (!session) throw expired({});
    const res = await fetch(API + '/file?path=' + encodeURIComponent(path),
      { headers: { Authorization: 'Bearer ' + session.token } });
    if (res.status === 401) throw expired({});
    if (!res.ok) throw { status: res.status };
    return URL.createObjectURL(await res.blob());
  }

  /* ---------- when the sign-in runs out ----------
     A session lasts 8 hours. If it runs out with the dashboard open, a "Sign in
     again" box covers the page instead of signing out, so a half-filled form isn't
     lost; after signing in, the teacher presses Publish (or whatever it was) again. */
  let reauth = null, expiryTimer;
  function expired(body) {
    if (root.dataset.state !== 'signed-in') { signOut(); return { status: 401, error: 'signed_out', ...body }; }
    openReauth();
    return { status: 401, error: 'signed_out',
      message: 'Your sign-in ran out. Sign in again in the box on screen, then try that again. Nothing on this page is lost.' };
  }
  function watchExpiry() {
    clearTimeout(expiryTimer);
    if (session) expiryTimer = setTimeout(openReauth, Math.max(0, session.expires * 1000 - Date.now()));
  }
  function openReauth() {
    if (reauth || root.dataset.state !== 'signed-in') return;
    reauth = document.createElement('div');
    reauth.className = 'admin-modal';
    reauth.innerHTML = `<section class="admin-card" role="dialog" aria-modal="true" aria-labelledby="reauthTitle">
        <h2 id="reauthTitle">Sign in again</h2>
        <p>Your sign-in ran out (it lasts 8 hours). Sign in again to carry on. Nothing on this page is lost.</p>
        <div id="reauthButton" class="admin-google"></div>
        <p class="admin-note" id="reauthNote" aria-live="polite">${googleLoaded ? '' : 'Loading Google sign-in…'}</p>
        <button class="btn btn-ghost" id="reauthOut">Sign out instead</button>
      </section>`;
    document.body.appendChild(reauth);
    renderGoogleButton(reauth.querySelector('#reauthButton'));
    reauth.querySelector('#reauthOut').addEventListener('click', () => {
      if (unsaved() && !confirm('Sign out and lose what you haven\'t saved on this page?')) return;
      closeReauth(); signOut();
    });
  }
  function closeReauth() { if (reauth) { reauth.remove(); reauth = null; } }
  async function finishReauth(response) {
    reauth.querySelector('#reauthNote').textContent = 'Signing you in…';
    try {
      save(await api('/session', { method: 'POST', body: JSON.stringify({ credential: response.credential }) }));
      closeReauth(); watchExpiry();
      if (!root.querySelector('.add-head')) show('signed-in');    // on the list: reload it
    } catch (e) {
      if (e.error === 'not_on_list' || e.error === 'wrong_domain') { closeReauth(); save(null); return show('refused', e); }
      reauth.querySelector('#reauthNote').textContent = e.message || 'That didn\'t work. Try again.';
    }
  }

  /* ---------- unsaved work ----------
     The add, edit and class-set pages set window.AdminDirty to say whether they hold
     changes not yet saved; leaving or closing the tab then asks first. */
  const unsaved = () => !!(window.AdminDirty && window.AdminDirty());
  window.addEventListener('beforeunload', e => { if (unsaved()) { e.preventDefault(); e.returnValue = ''; } });

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
          <p class="admin-note">Only CS teachers on the dashboard's list can sign in.
            New here? <a href="guide.html">Read the teacher guide</a>.</p>
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
          <a class="btn btn-ghost" href="guide.html" target="_blank" rel="noopener">Teacher guide</a>
          <button class="btn btn-ghost" id="signOut">Sign out</button>
        </section>
        <section class="admin-projects" id="projects"></section>`
    }[state]();

    if (state === 'signed-out') renderGoogleButton();
    if (state === 'signed-in') { watchExpiry(); window.AdminProjects.mount(document.getElementById('projects'), { api, file }); }
    else clearTimeout(expiryTimer);
    const again = document.getElementById('tryAgain');
    if (again) again.addEventListener('click', signOut);
    const out = document.getElementById('signOut');
    if (out) out.addEventListener('click', () => {
      if (unsaved() && !confirm('Sign out and lose what you haven\'t saved on this page?')) return;
      signOut();
    });
  }

  /* ---------- Google ---------- */
  function renderGoogleButton(el = document.getElementById('googleButton')) {
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
    if (reauth) { reauth.querySelector('#reauthNote').textContent = ''; renderGoogleButton(reauth.querySelector('#reauthButton')); }
  }

  async function onCredential(response) {
    if (reauth) return finishReauth(response);
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
    window.AdminDirty = null;
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
