/* Shared by every page: the design (skin) and day/night mode, the nav's menus, and
   the switch between the public site and the teacher dashboard. */
(function () {
  const K_SKIN = 'cs-skin', K_MODE = 'cs-mode', K_TEACHER = 'cs-teacher';
  const root = document.documentElement;
  const VALID = ['a', 'b', 'c'];
  const NAMES = { a: 'Catalog', b: 'Survey', c: 'Wayfinding' };

  /* The three designs all stay in the CSS. Everyone sees Survey; ?skin=a|b|c in the
     URL previews another for that page. To bring the picker back for feedback, set
     SHOW_DESIGN_PICKER to true (and put the .fb strip back in the pages). */
  const DEFAULT_SKIN = 'b', SHOW_DESIGN_PICKER = false;
  const q = new URLSearchParams(location.search).get('skin');
  const stored = SHOW_DESIGN_PICKER ? localStorage.getItem(K_SKIN) : null;
  const skin = VALID.includes(q) ? q : VALID.includes(stored) ? stored : DEFAULT_SKIN;
  const mode = localStorage.getItem(K_MODE) || 'day';

  root.setAttribute('data-skin', skin);
  root.setAttribute('data-mode', mode);

  function setSkin(s) {
    root.setAttribute('data-skin', s);
    localStorage.setItem(K_SKIN, s);
    document.querySelectorAll('[data-setskin]').forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.setskin === s));
    if (window.Topo) window.Topo.build();
    if (window.CSMap) setTimeout(window.CSMap.drawConnectors, 60);
  }
  function setMode(m) {
    root.setAttribute('data-mode', m);
    localStorage.setItem(K_MODE, m);
    const b = document.getElementById('modeBtn');
    if (b) b.textContent = m === 'day' ? 'Night' : 'Day';
    if (window.Topo) window.Topo.build();
  }

  /* Pages in admin/ link back up a level. */
  const inAdmin = /\/admin\//.test(location.pathname);
  const up = inAdmin ? '../' : '';

  document.addEventListener('DOMContentLoaded', () => {
    const ctl = document.querySelector('.ctl');
    if (ctl) {
      ctl.innerHTML = `
        ${SHOW_DESIGN_PICKER ? `<select id="skinSel" aria-label="Design direction">
          ${VALID.map(s => `<option value="${s}">${NAMES[s]}</option>`).join('')}
        </select>` : ''}
        <button id="modeBtn" aria-label="Toggle day and night"></button>`;
      const sel = ctl.querySelector('#skinSel');
      if (sel) {
        sel.value = root.getAttribute('data-skin');
        sel.addEventListener('change', e => setSkin(e.target.value));
      }
      ctl.querySelector('#modeBtn').addEventListener('click', () =>
        setMode(root.getAttribute('data-mode') === 'day' ? 'night' : 'day'));
      setMode(root.getAttribute('data-mode'));
    }

    const strip = document.querySelector('.fb .pick');
    if (strip && SHOW_DESIGN_PICKER) {
      strip.innerHTML = VALID.map(s =>
        `<button data-setskin="${s}" aria-pressed="${s === skin}">${NAMES[s]}</button>`).join('');
      strip.addEventListener('click', e => {
        const b = e.target.closest('[data-setskin]');
        if (b) setSkin(b.dataset.setskin);
      });
    }

    menus();
    courseMenu();
    viewSwitch();
  });

  /* ---------- nav menus (Courses, Course planning) ----------
     A button opens its list; a click elsewhere, Escape, or picking a link closes it. */
  function menus() {
    const all = [...document.querySelectorAll('.menu')];
    if (!all.length) return;
    const close = (except) => all.forEach(m => {
      if (m === except) return;
      m.querySelector('.menu-btn').setAttribute('aria-expanded', 'false');
      m.querySelector('.menu-list').hidden = true;
    });
    all.forEach(m => {
      const btn = m.querySelector('.menu-btn'), list = m.querySelector('.menu-list');
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') !== 'true';
        close(m);
        btn.setAttribute('aria-expanded', String(open));
        list.hidden = !open;
      });
      list.addEventListener('click', e => { if (e.target.closest('a')) close(); });
      m.addEventListener('keydown', e => {
        if (e.key === 'Escape' && !list.hidden) { close(); btn.focus(); }
      });
    });
    document.addEventListener('click', e => { if (!e.target.closest('.menu')) close(); });
  }

  /* The Courses menu lists every course, in the order of data/courses.json. */
  async function courseMenu() {
    const list = document.querySelector('[data-course-menu]');
    if (!list) return;
    try {
      const data = await (await fetch(up + 'data/courses.json', { cache: 'no-cache' })).json();
      const color = c => (data.lines.find(l => l.id === c.line) || {}).color || 'var(--accent)';
      const here = new URLSearchParams(location.search).get('c');
      list.innerHTML = data.courses.map(c =>
        `<a href="${up}course.html?c=${encodeURIComponent(c.slug)}"${c.slug === here ? ' aria-current="page"' : ''}>
          <span class="menu-dot" style="background:${esc(color(c))}"></span>${esc(c.name)}</a>`).join('');
    } catch (e) { /* the menu keeps its link to the course map */ }
  }

  /* ---------- public site / dashboard switch ----------
     The dashboard leaves a note (no sign-in details, just "a teacher signed in here,
     until…") so the public pages can offer a way back to it. */
  function viewSwitch() {
    const ctl = document.querySelector('.nav .ctl');
    if (!ctl) return;
    let teacher = inAdmin;
    if (!teacher) {
      try { const t = JSON.parse(localStorage.getItem(K_TEACHER) || 'null'); teacher = !!t && t.expires > Date.now() / 1000; }
      catch (e) { teacher = false; }
    }
    if (!teacher) return;
    const sw = document.createElement('span');
    sw.className = 'view-switch';
    sw.setAttribute('role', 'group');
    sw.setAttribute('aria-label', 'Switch view');
    const onDashboard = /\/admin\/(index\.html)?$/.test(location.pathname);
    sw.innerHTML = inAdmin
      ? `<a href="${up}index.html">Public site</a>${onDashboard
          ? '<a href="#" aria-current="page">Dashboard</a>' : '<a href="./">Dashboard</a>'}`
      : `<a href="#" aria-current="page">Public site</a><a href="admin/">Dashboard</a>`;
    sw.querySelectorAll('a[aria-current]').forEach(a => a.addEventListener('click', e => e.preventDefault()));
    ctl.before(sw);
  }

  window.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const esc = window.esc;
  /* A course's student quote shows unless it's switched off: for all courses
     (meta.showQuotes: false in courses.json) or for that course (quote.show: false). */
  window.showQuote = (data, c) => !!(c.quote && c.quote.text) &&
    (data.meta || {}).showQuotes !== false && c.quote.show !== false;
  window.tagChip = (key, label, href) =>
    `<a class="tag" href="${href || ('index.html#tag=' + encodeURIComponent(key))}">#${esc(label || key)}</a>`;
})();
