/* Home page: three tabs (Student work, Courses, Plan a route), one shown at a time. */
(function () {
  /* ---------- tabs ----------
     The URL hash picks the view, so links from course pages (index.html#map),
     shared routes (#route=…), tag filters (#tag=…) and the back button all land
     on the right tab. No hash means Student work. */
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

    /* ---------- Student work ----------
       One project per course; a playable one gets the stage when there is one.
       On a big enough screen the view fits the window (see .theater in the CSS). */
    const stage = window.Stage(document.getElementById('stage'));
    const theater = document.querySelector('.theater');
    function sizeTheater() {
      if (current !== 'work') return;
      const top = theater.getBoundingClientRect().top + window.scrollY;
      theater.style.setProperty('--theater-h', Math.max(420, window.innerHeight - top - 18) + 'px');
      stage.fit();
    }
    addEventListener('resize', sizeTheater);

    function renderGallery() {
      const host = document.getElementById('gallery');
      const picks = window.Work.sample(window.CS_CONFIG.GALLERY_COUNT, data.courses.map(c => c.slug))
        .map(p => ({ slug: p.slug, project: p.project, courseName: course(p.slug).short }));
      if (!picks.length) {
        host.innerHTML = `<div class="empty-work" style="grid-column:1/-1">Student work appears here once the work repo has projects in it.</div>`;
        return;
      }
      stage.show(picks.find(p => window.Work.embedOf(p.project)) || picks[0]);
      window.Stage.gallery(host, picks, stage);
    }
    document.getElementById('btnReshuffle').addEventListener('click', renderGallery);

    // Load the gallery the first time the tab opens. Leaving the tab stops a
    // running sketch or game, so its sound doesn't carry on behind another tab.
    let started = false;
    enter.work = () => {
      sizeTheater();
      if (!started) { started = true; renderGallery(); } else stage.resume();
    };
    leave.work = () => stage.pause();

    if (window.Work.isSample()) {
      const b = document.createElement('p');
      b.className = 'mono sample-note';
      b.textContent = window.Work.sampleReason() === 'empty'
        ? 'Sample work — shown until the work repo has its first project.'
        : 'Sample work — point WORK_BASE in assets/js/config.js at your repo to go live.';
      document.querySelector('.work-head > div').appendChild(b);
    }

    if (current && enter[current]) enter[current]();
  })();
})();
