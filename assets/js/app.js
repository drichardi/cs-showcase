/* Home page. Student work is the page itself; Courses and Plan a route are tabs
   in the nav that swap it out. One view is shown at a time. */
(function () {
  /* ---------- views ----------
     The URL hash picks the view, so links from course pages (index.html#map),
     shared routes (#route=…), tag filters (#tag=…) and the back button all land
     on the right one. No hash (or #work) is the student work home page. */
  const VIEWS = ['work', 'map', 'plan'];
  function viewFor(hash) {
    const h = (hash || '').replace(/^#/, '');
    if (VIEWS.includes(h)) return h;
    if (h === 'courses' || /^tag=/.test(h)) return 'map';
    if (/^route=/.test(h)) return 'plan';
    return 'work';
  }

  let current = null;
  const enter = {}, leave = {};          // per-view hooks, filled in once data loads
  function showView(view) {
    if (view === current) return;
    if (current && leave[current]) leave[current]();
    current = view;
    document.querySelectorAll('[data-view]').forEach(v => { v.hidden = v.dataset.view !== view; });
    document.querySelectorAll('[data-tab]').forEach(a => {
      if (a.dataset.tab === view) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
    if (enter[view]) enter[view]();
  }
  addEventListener('hashchange', () => showView(viewFor(location.hash)));
  showView(viewFor(location.hash));

  // The site name goes home. On this page that's a view switch, not a reload.
  document.querySelector('.brand').addEventListener('click', e => {
    e.preventDefault();
    if (current === 'work') { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    history.pushState(null, '', location.pathname + location.search);
    showView('work');
  });

  (async function () {
    let data;
    try { data = await (await fetch('data/courses.json', { cache: 'no-cache' })).json(); }
    catch (e) { document.getElementById('mapGrid').innerHTML = '<p style="color:var(--ink-3)">Could not load data/courses.json.</p>'; return; }

    document.getElementById('stat-courses').textContent = data.courses.length;
    await window.Work.load();
    const course = s => data.courses.find(c => c.slug === s);

    /* ---------- Courses: map and tag filter ---------- */
    const used = [...new Set(data.courses.flatMap(c => c.skills || []))].sort();
    document.getElementById('tagBar').innerHTML =
      `<span class="lbl">Filter by</span>` +
      used.map(k => `<button class="tag" data-tag="${esc(k)}">#${esc(k)}</button>`).join('') +
      `<a class="clear" href="#" data-tag="">show all</a>`;

    document.getElementById('tagBar').addEventListener('click', e => {
      const t = e.target.closest('[data-tag]'); if (!t) return;
      e.preventDefault();
      const tag = t.dataset.tag || null;
      window.CSMap.filter(tag === window.__tag ? null : tag);
      window.__tag = (tag === window.__tag) ? null : tag;
      history.replaceState(null, '', window.__tag ? '#tag=' + window.__tag : '#map');
    });

    window.CSMap.render(data);
    const m = location.hash.match(/tag=([\w-]+)/);
    if (m) { window.__tag = m[1]; window.CSMap.filter(m[1]); }
    // The connector lines are drawn from on-screen positions, so redraw them
    // whenever the tab is shown (they can't be measured while it's hidden).
    enter.map = () => window.CSMap.drawConnectors();

    /* ---------- Plan a route ---------- */
    window.Planner.init(data);

    /* ---------- Student work (the home page) ----------
       One project large, chosen at random (a playable one if there is one), then
       rows of projects by course. On a big enough screen the featured project fits
       the window, with the start of the rows just showing below (see .theater). */
    const stage = window.Stage(document.getElementById('stage'));
    const theater = document.querySelector('.theater');
    function sizeTheater() {
      if (current !== 'work') return;
      const top = theater.getBoundingClientRect().top + window.scrollY;
      theater.style.setProperty('--theater-h', Math.max(420, window.innerHeight - top - 70) + 'px');
      stage.fit();
    }
    addEventListener('resize', sizeTheater);

    const color = c => (data.lines.find(l => l.id === c.line) || {}).color || '';
    const item = (c, p) => ({
      slug: c.slug, project: p, courseName: c.short || c.name,
      assignment: p.assignment || '', assignmentTitle: p.assignment ? window.Work.assignmentTitle(c.slug, p.assignment) : '',
      tagLabel: c.short || c.name, tagColor: color(c)
    });
    // One group per course with shown work, in course order.
    const shown = data.courses
      .map((c, order) => ({ c, order, items: window.Work.forCourse(c.slug).map(p => item(c, p)) }))
      .filter(g => g.items.length);

    /* Rows by course (ROW_SIZE / ROW_MIN in config.js, rule in Work.packRows):
       a course with enough projects gets its own random row; smaller ones share
       rows, each card labelled with its course; a course with none gets no row. */
    const buildRows = () => window.Work.packRows(shown,
      window.CS_CONFIG.ROW_SIZE || 5, window.CS_CONFIG.ROW_MIN || 4);

    function rowsHtml(rows) {
      return rows.map(r => {
        r.courses = r.groups.map(g => g.c);
        const one = r.courses.length === 1, c = r.courses[0];
        const head = one
          ? `<a class="row-title" style="--c:${esc(color(c))}" href="course.html?c=${encodeURIComponent(c.slug)}">${esc(c.name)}</a>
             <a class="row-more" href="course.html?c=${encodeURIComponent(c.slug)}">${
               r.total > r.items.length ? `All ${r.total} projects →` : 'Course page →'}</a>`
          : `<span class="row-title is-shared">${r.courses.map(x =>
               `<a style="--c:${esc(color(x))}" href="course.html?c=${encodeURIComponent(x.slug)}">${esc(x.short || x.name)}</a>`).join('')}</span>`;
        return `<div class="work-row">
          <div class="row-head">${head}</div>
          <div class="row-cards" style="--row:${window.CS_CONFIG.ROW_SIZE || 5}">
            ${r.items.map(it => window.Work.card(it, { tag: !one, assignment: true })).join('')}
          </div>
        </div>`;
      }).join('');
    }

    function renderRows() {
      const rows = buildRows();
      document.getElementById('rowsHead').hidden = !rows.length;
      window.Stage.gallery(document.getElementById('rows'), rows.flatMap(r => r.items), stage, null, () => rowsHtml(rows));
    }

    function renderHome() {
      const all = shown.flatMap(g => g.items);
      if (!all.length) {
        document.getElementById('stage').innerHTML = `<div class="empty-work">${window.Work.failed()
          ? "Student work couldn't be loaded just now. Try again in a minute."
          : 'No student work has been published yet.'}</div>`;
        return;
      }
      const playable = all.filter(it => window.Work.embedOf(it.project));
      const pool = playable.length ? playable : all;
      stage.show(pool[Math.floor(Math.random() * pool.length)]);
      renderRows();
    }
    document.getElementById('btnReshuffle').addEventListener('click', renderRows);

    // Built the first time the page shows. Switching to another view stops a
    // running sketch or game, so its sound doesn't carry on behind it.
    let started = false;
    enter.work = () => {
      sizeTheater();
      if (!started) { started = true; renderHome(); } else stage.resume();
    };
    leave.work = () => stage.pause();

    if (current && enter[current]) enter[current]();
  })();
})();
