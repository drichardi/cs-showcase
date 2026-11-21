/* ============================================================
   Teacher dashboard: every project in the student-work repo, shown or
   hidden, with search and filters; card buttons to edit, set up, fix, show
   or hide; and the selected assignment's name and description.
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
    window.AdminDirty = null;          // nothing unsaved on the list itself
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
        <button class="btn btn-ghost" id="addSeveral" title="A class set: many sketches at once">Add several</button>
        <button class="btn btn-primary" id="addProject">Add project</button>
      </div>
      ${data.branch && data.branch !== 'main' ? `<p class="add-test">Test mode: this is the <b>${esc(data.branch)}</b> branch, not what the site shows.</p>` : ''}
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
        <label class="proj-check" title="Projects with something to fix: no student names, a missing file, no cover for a link…">
          <input type="checkbox" id="attention"${f.attention ? ' checked' : ''}> Needs attention (${all.filter(p => p.issues.length).length})</label>
      </div>
      ${f.course && f.assignment ? assignmentBar() : ''}
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
    on('addProject', 'click', () => window.AdminAdd.open(el, {
      api: mount.api, data, courses,
      keep: f.course ? { course: f.course, assignment: f.assignment } : {},
      onClose: changed => changed ? mount(el, mount.api) : render()
    }));
    on('addSeveral', 'click', () => window.AdminBatch.open(el, {
      api: mount.api, data, courses,
      keep: f.course ? { course: f.course, assignment: f.assignment } : {},
      onClose: changed => changed ? mount(el, mount.api) : render()
    }));
    const grid = el.querySelector('.proj-grid');
    if (grid) grid.addEventListener('click', onCardAction);
    bindAssignment();
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
        ${(p.tips || []).length ? `<p class="proj-tips">Could add: ${esc(p.tips.join(', '))}</p>` : ''}
        <p class="proj-path" title="Folder in the repo">${esc(p.path)}</p>
        ${live}
        <div class="proj-actions" data-path="${esc(p.path)}">
          <button type="button" class="btn btn-ghost" data-act="edit">${
            p.status === 'not-set-up' ? 'Set up' : p.status === 'broken' ? 'Fix' : 'Edit'}</button>
          ${p.status === 'shown' ? '<button type="button" class="btn btn-ghost" data-act="hide">Hide</button>'
            : p.status === 'hidden' ? '<button type="button" class="btn btn-ghost" data-act="show">Show on site</button>' : ''}
          <span class="proj-busy" aria-live="polite"></span>
        </div>
      </div>
    </article>`;
  }

  /* ---------- the selected assignment: its name and description, editable ---------- */
  const currentAssignment = () => (data.assignments[f.course] || []).find(a => a.id === f.assignment);
  function assignmentBar(editing = false) {
    const a = currentAssignment();
    if (!a) return '';
    return `<div class="proj-assign" id="assignBar">${editing ? `
      <label>Name <input id="aTitle" maxlength="60" value="${esc(a.title)}"></label>
      <label>Description <span class="opt">shown on the course page above its projects</span>
        <textarea id="aBlurb" rows="2" maxlength="300">${esc(a.blurb)}</textarea></label>
      <label class="proj-order">Order <span class="opt">optional: 1 shows first</span>
        <input id="aOrder" type="number" min="0" max="99" value="${a.order ?? ''}"></label>
      <p class="proj-assign-go"><button class="btn btn-primary" id="aSave">Save assignment</button>
        <button class="btn btn-ghost" id="aCancel">Cancel</button> <span id="aMsg" aria-live="polite"></span></p>` : `
      <div><p class="mono">Assignment · <code>${esc(f.course)}/${esc(a.id)}</code></p>
        <h3>${esc(a.title)}</h3><p>${a.blurb ? esc(a.blurb) : '<i>No description yet.</i>'}</p></div>
      <button class="btn btn-ghost" id="aEdit">Edit assignment</button>`}</div>`;
  }
  function bindAssignment() {
    const bar = el.querySelector('#assignBar');
    if (!bar) return;
    const edit = bar.querySelector('#aEdit');
    if (edit) edit.addEventListener('click', () => { bar.outerHTML = assignmentBar(true); bindAssignment(); el.querySelector('#aTitle').focus(); });
    const cancel = bar.querySelector('#aCancel');
    if (cancel) cancel.addEventListener('click', () => { bar.outerHTML = assignmentBar(false); bindAssignment(); });
    const save = bar.querySelector('#aSave');
    if (save) save.addEventListener('click', async () => {
      const a = currentAssignment(), msg = bar.querySelector('#aMsg');
      save.disabled = true; msg.textContent = 'Saving…';
      try {
        const res = await mount.api.api('/assignment', { method: 'POST', body: JSON.stringify({
          course: f.course, id: a.id, ymlSha: a.ymlSha ?? null,
          title: bar.querySelector('#aTitle').value, blurb: bar.querySelector('#aBlurb').value, order: bar.querySelector('#aOrder').value
        }) });
        msg.textContent = res.published ? 'Saved. The site updates in about a minute.' : 'Saved to the test branch.';
        setTimeout(() => mount(el, mount.api), 900);
      } catch (e) {
        msg.textContent = e.message || 'Couldn\'t save. Try again.';
        save.disabled = false;
      }
    });
  }

  /* Card buttons: open the edit page, or flip Show/Hide in one step. */
  async function onCardAction(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const box = b.closest('.proj-actions'), busy = box.querySelector('.proj-busy');
    const p = data.projects.find(x => x.path === box.dataset.path);
    const say = t => { busy.textContent = t; };
    box.querySelectorAll('button').forEach(x => { x.disabled = true; });
    try {
      if (b.dataset.act === 'edit') {
        say('Opening…');
        const project = await mount.api.api('/project?path=' + encodeURIComponent(p.path));
        window.AdminAdd.open(el, { api: mount.api, data, courses, edit: project, onClose: changed => changed ? mount(el, mount.api) : render() });
        return;
      }
      const show = b.dataset.act === 'show';
      const ok = show
        ? confirm(`Show "${p.title}" on the site?\n\nOnly if the student(s) agreed to have it shown publicly.`)
        : confirm(`Hide "${p.title}" from the site?\n\nIt stays in the repo, and you can show it again any time.`);
      if (!ok) { box.querySelectorAll('button').forEach(x => { x.disabled = false; }); return; }
      say('Saving…');
      const project = await mount.api.api('/project?path=' + encodeURIComponent(p.path));
      const res = await mount.api.api('/project', { method: 'POST', body: JSON.stringify({
        path: project.path, ymlSha: project.ymlSha,
        meta: { ...project.meta, show, consent: show },
        ...(project.kind === 'link' && project.embed ? { embed: project.embed } : {})
      }) });
      p.status = show ? 'shown' : 'hidden';
      render();
      const card = el.querySelector(`.proj-actions[data-path="${CSS.escape(p.path)}"] .proj-busy`);
      if (card) card.textContent = res.published ? (show ? 'Saved. On the site in about a minute.' : 'Saved. Off the site in about a minute.') : 'Saved to the test branch.';
    } catch (err) {
      say(err.message || 'Couldn\'t save. Try again.');
      box.querySelectorAll('button').forEach(x => { x.disabled = false; });
    }
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
