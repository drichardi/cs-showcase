/* ============================================================
   Teacher dashboard. Step 2: every project in the student-work repo,
   shown or hidden, with search and filters. Read-only for now:
   adding and editing come in the next steps.
   ============================================================ */
window.AdminProjects = (function () {
  const esc = window.esc;
  const STATUS = {
    'shown':      { label: 'On the site',  order: 2 },
    'hidden':     { label: 'Hidden',       order: 1 },
    'not-set-up': { label: 'Needs details', order: 0 },
    'broken':     { label: 'Needs fixing', order: 0 }
  };
  let el, io, data = null, courses = [], f = { q: '', course: '', assignment: '', status: '', attention: false };
  const thumbs = new Map();          // repo path -> object URL, kept across re-renders

  async function mount(host, api) {
    el = host;
    el.innerHTML = `<div class="admin-card"><p>Loading projects…</p></div>`;
    try {
      const [list, courseData] = await Promise.all([
        api.api('/projects'),
        fetch('../data/courses.json', { cache: 'no-cache' }).then(r => r.json())
      ]);
      data = list;
      courses = courseData.courses;
      mount.api = api;
      render();
    } catch (e) {
      if (e && e.error === 'signed_out') return;
      el.innerHTML = `<div class="admin-card"><h2>Couldn't load the projects</h2>
        <p>${esc(e.message || "The dashboard's server didn't answer. Try again in a minute.")}</p>
        <button class="btn btn-primary" id="retry">Try again</button></div>`;
      el.querySelector('#retry').addEventListener('click', () => mount(host, api));
    }
  }

  const courseName = slug => (courses.find(c => c.slug === slug) || {}).short || slug;
  const courseOrder = slug => { const i = courses.findIndex(c => c.slug === slug); return i < 0 ? 99 : i; };
  const assignmentTitle = (course, id) =>
    ((data.assignments[course] || []).find(a => a.id === id) || {}).title || '';
  const term = p => [p.semester ? p.semester[0].toUpperCase() + p.semester.slice(1) : '', p.year].filter(Boolean).join(' ');

  function matches(p) {
    if (f.course && p.course !== f.course) return false;
    if (f.assignment && p.assignment !== f.assignment) return false;
    if (f.status && p.status !== f.status) return false;
    if (f.attention && !p.issues.length) return false;
    if (f.q) {
      const hay = [p.title, p.student, p.blurb, courseName(p.course), assignmentTitle(p.course, p.assignment), p.path].join(' ').toLowerCase();
      if (!f.q.toLowerCase().split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  }

  function render() {
    const all = data.projects;
    const count = s => all.filter(p => p.status === s).length;
    const courseSlugs = [...new Set(all.map(p => p.course))].sort((a, b) => courseOrder(a) - courseOrder(b));
    const assignmentsHere = f.course ? (data.assignments[f.course] || []) : [];
    const list = all.filter(matches).sort((a, b) =>
      STATUS[a.status].order - STATUS[b.status].order || courseOrder(a.course) - courseOrder(b.course) || a.path.localeCompare(b.path));

    el.innerHTML = `
      <div class="proj-head">
        <div>
          <h2>Projects</h2>
          <p class="proj-summary">${all.length} in the repo · ${count('shown')} on the site · ${count('hidden')} hidden${
            count('not-set-up') ? ` · ${count('not-set-up')} need details` : ''}${count('broken') ? ` · ${count('broken')} need fixing` : ''}</p>
        </div>
        <button class="btn btn-ghost" id="refresh" title="Load the latest from the repo">Refresh</button>
      </div>
      <div class="proj-tools" role="search">
        <input type="search" id="q" placeholder="Search title, student, assignment…" value="${esc(f.q)}" aria-label="Search projects">
        <select id="course" aria-label="Course">
          <option value="">All courses</option>
          ${courseSlugs.map(s => `<option value="${esc(s)}"${f.course === s ? ' selected' : ''}>${esc(courseName(s))}</option>`).join('')}
        </select>
        <select id="assignment" aria-label="Assignment"${f.course ? '' : ' disabled'}>
          <option value="">${f.course ? 'All assignments' : 'Pick a course first'}</option>
          ${assignmentsHere.map(a => `<option value="${esc(a.id)}"${f.assignment === a.id ? ' selected' : ''}>${esc(a.title)}</option>`).join('')}
        </select>
        <select id="status" aria-label="Status">
          <option value="">Any status</option>
          ${Object.entries(STATUS).filter(([s]) => count(s)).map(([s, v]) =>
            `<option value="${s}"${f.status === s ? ' selected' : ''}>${v.label}</option>`).join('')}
        </select>
        <label class="proj-check"><input type="checkbox" id="attention"${f.attention ? ' checked' : ''}> Needs attention</label>
      </div>
      ${list.length ? `<div class="proj-grid">${list.map(card).join('')}</div>`
        : `<div class="empty-work">No projects match. <a href="#" id="clear">Clear the filters</a></div>`}`;

    const on = (id, ev, fn) => { const x = el.querySelector('#' + id); if (x) x.addEventListener(ev, fn); };
    on('q', 'input', e => { f.q = e.target.value; rerender('q'); });
    on('course', 'change', e => { f.course = e.target.value; f.assignment = ''; render(); });
    on('assignment', 'change', e => { f.assignment = e.target.value; render(); });
    on('status', 'change', e => { f.status = e.target.value; render(); });
    on('attention', 'change', e => { f.attention = e.target.checked; render(); });
    on('clear', 'click', e => { e.preventDefault(); f = { q: '', course: '', assignment: '', status: '', attention: false }; render(); });
    on('refresh', 'click', () => mount(el, mount.api));
    loadThumbs();
  }

  /* Typing in search re-renders without losing the cursor. */
  function rerender(focusId) {
    const pos = el.querySelector('#' + focusId).selectionStart;
    render();
    const box = el.querySelector('#' + focusId);
    box.focus();
    box.setSelectionRange(pos, pos);
  }

  function card(p) {
    const st = STATUS[p.status];
    const a = assignmentTitle(p.course, p.assignment);
    const where = [courseName(p.course), a, term(p)].filter(Boolean).join(' · ');
    const live = p.status === 'shown'
      ? `<a class="proj-link" href="../course.html?c=${encodeURIComponent(p.course)}#${
          p.assignment ? 'a=' + encodeURIComponent(p.assignment) + '&' : ''}p=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">View on site ↗</a>` : '';
    return `<article class="proj-card is-${p.status}">
      <div class="proj-thumb" data-cover="${esc(p.cover || '')}">
        <span class="proj-blank">${esc(p.title)}</span>
        <span class="proj-status">${st.label}</span>
      </div>
      <div class="proj-body">
        <h3>${esc(p.title)}</h3>
        <p class="proj-who">${esc(p.student || 'No student names yet')}</p>
        <p class="proj-where">${esc(where)}</p>
        ${p.issues.length ? `<ul class="proj-issues">${p.issues.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}
        <p class="proj-path" title="Folder in the repo">${esc(p.path)}</p>
        ${live}
      </div>
    </article>`;
  }

  /* Covers load as they scroll into view: each one is a request to the server. */
  function loadThumbs() {
    if (io) io.disconnect();
    io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      io.unobserve(e.target);
      showThumb(e.target);
    }), { rootMargin: '200px' });
    el.querySelectorAll('.proj-thumb[data-cover]').forEach(t => { if (t.dataset.cover) io.observe(t); });
  }

  async function showThumb(t) {
    const path = t.dataset.cover;
    try {
      let src = thumbs.get(path);
      if (!src) {
        src = /^https?:\/\//i.test(path) ? path : await mount.api.file(path);
        thumbs.set(path, src);
      }
      const isVideo = /\.(mp4|webm|mov)$/i.test(path);
      const media = document.createElement(isVideo ? 'video' : 'img');
      media.src = src;
      media.className = 'proj-media';
      if (isVideo) Object.assign(media, { muted: true, loop: true, autoplay: true, playsInline: true });
      else media.alt = '';
      t.prepend(media);
      t.classList.add('has-media');
    } catch (e) { /* the title tile stays */ }
  }

  return { mount };
})();
