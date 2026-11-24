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
  let creating = false;              // the "New assignment" form is open
  const thumbs = new Map();          // repo path -> object URL, kept across re-renders

  async function mount(host, api) {
    el = host;
    cardMsg = {}; assignMsg = {};      // fresh list, fresh messages
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
  // A project marked shown is off the site while its assignment is switched off, so
  // for the counts and the status filter it counts as hidden.
  const statusOf = p => p.status === 'shown' && p.assignmentHidden ? 'hidden' : p.status;

  function matches(p) {
    if (f.course && p.course !== f.course) return false;
    if (f.assignment && p.assignment !== f.assignment) return false;
    if (f.status && statusOf(p) !== f.status) return false;
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
    const count = s => all.filter(p => statusOf(p) === s).length;
    const courseSlugs = [...new Set([...all.map(p => p.course), ...Object.keys(data.assignments)])].sort((a, b) => courseOrder(a) - courseOrder(b));
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
        <button class="btn btn-ghost" id="newAssignment" title="Set up an assignment before adding its work">New assignment</button>
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
      ${creating ? newAssignmentForm() : ''}
      ${f.course && f.assignment ? assignmentBar() : assignmentTiles()}
      ${list.length ? `<div class="proj-grid">${list.map(card).join('')}</div>`
        : f.course && f.assignment && !f.q && !f.status && !f.attention && currentAssignment()
          ? `<div class="empty-work">No work in this assignment yet.
              <p class="proj-empty-go"><button class="btn btn-primary" id="emptyAdd">Add project</button>
              <button class="btn btn-ghost" id="emptySeveral">Add several</button></p></div>`
          : `<div class="empty-work">No projects match. <a href="#" id="clear">Clear the filters</a></div>`}`;

    const on = (id, ev, fn) => { const x = el.querySelector('#' + id); if (x) x.addEventListener(ev, fn); };
    on('q', 'input', e => { f.q = e.target.value; rerender('q'); });
    on('course', 'change', e => { f.course = e.target.value; f.assignment = ''; render(); });
    on('assignment', 'change', e => { f.assignment = e.target.value; render(); });
    on('status', 'change', e => { f.status = e.target.value; render(); });
    on('attention', 'change', e => { f.attention = e.target.checked; render(); });
    on('clear', 'click', e => { e.preventDefault(); f = { q: '', course: '', assignment: '', status: '', attention: false }; render(); });
    on('refresh', 'click', () => mount(el, mount.api));
    const opener = page => () => page.open(el, {
      api: mount.api, data, courses,
      keep: f.course ? { course: f.course, assignment: f.assignment } : {},
      onClose: changed => changed ? mount(el, mount.api) : render()
    });
    on('addProject', 'click', opener(window.AdminAdd));
    on('addSeveral', 'click', opener(window.AdminBatch));
    on('emptyAdd', 'click', opener(window.AdminAdd));
    on('emptySeveral', 'click', opener(window.AdminBatch));
    on('newAssignment', 'click', () => { creating = true; render(); el.querySelector('#naCourse').focus(); });
    bindNewAssignment();
    const grid = el.querySelector('.proj-grid');
    if (grid) { grid.addEventListener('click', onCardAction); grid.addEventListener('change', onShowToggle); }
    bindAssignment();
    el.querySelectorAll('[data-assign-show]').forEach(cb => cb.addEventListener('change', toggleAssignment));
    el.querySelectorAll('.assign-open').forEach(b => b.addEventListener('click', () => {
      const t = b.closest('[data-id]');
      f.course = t.dataset.course; f.assignment = t.dataset.id;
      render();
    }));
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
    const off = p.status === 'shown' && p.assignmentHidden;     // shown, but its assignment is switched off
    const live = p.status === 'shown' && !off
      ? `<a class="proj-link" href="../course.html?c=${encodeURIComponent(p.course)}#${
          p.assignment ? 'a=' + encodeURIComponent(p.assignment) + '&' : ''}p=${encodeURIComponent(p.id)}" target="_blank" rel="noopener">View on site ↗</a>` : '';
    return `<article class="proj-card is-${statusOf(p)}">
      <div class="proj-thumb" data-cover="${esc(p.cover || '')}">
        <span class="proj-blank">${esc(p.title)}</span>
        <span class="proj-status"${off ? ' title="Its assignment is switched off. It comes back when the assignment is ticked."' : ''}>${off ? 'Assignment off' : st.label}</span>
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
          ${p.status === 'shown' || p.status === 'hidden' ? `<label class="assign-show proj-show"${off
            ? ' title="Its assignment is switched off, so it stays off the site until the assignment is ticked."' : ''}>
            <input type="checkbox" data-proj-show${p.status === 'shown' ? ' checked' : ''}> On the site</label>` : ''}
          <span class="proj-busy" aria-live="polite">${esc(cardMsg[p.path] || '')}</span>
        </div>
      </div>
    </article>`;
  }

  /* ---------- a new assignment, before any work is added ---------- */
  function newAssignmentForm() {
    return `<div class="proj-assign" id="newAssignBar">
      <div style="flex:1 1 100%"><p class="mono">New assignment</p>
        <p>Sets it up in the course, ready for work to be added. It shows on the site once it has work that's shown.</p></div>
      <label>Course <select id="naCourse">${courses.map(c =>
        `<option value="${esc(c.slug)}"${(f.course || '') === c.slug ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
      <label>Name <input id="naTitle" maxlength="60" placeholder="Generative Art"></label>
      <label>Description <span class="opt">shown on the course page above its projects</span>
        <textarea id="naBlurb" rows="2" maxlength="300" placeholder="Make a piece of art that changes every time it runs."></textarea></label>
      <label class="proj-order">Order <span class="opt">optional: 1 shows first</span>
        <input id="naOrder" type="number" min="0" max="99"></label>
      <p class="proj-assign-go"><button class="btn btn-primary" id="naSave">Create assignment</button>
        <button class="btn btn-ghost" id="naCancel">Cancel</button> <span id="naMsg" aria-live="polite"></span></p>
    </div>`;
  }
  function bindNewAssignment() {
    const bar = el.querySelector('#newAssignBar');
    if (!bar) return;
    bar.querySelector('#naCancel').addEventListener('click', () => { creating = false; render(); });
    const save = bar.querySelector('#naSave'), msg = bar.querySelector('#naMsg');
    save.addEventListener('click', async () => {
      const course = bar.querySelector('#naCourse').value, title = bar.querySelector('#naTitle').value.trim();
      if (!title) { msg.textContent = 'Give the assignment a name.'; bar.querySelector('#naTitle').focus(); return; }
      save.disabled = true; msg.textContent = 'Saving…';
      try {
        const res = await mount.api.api('/assignment', { method: 'POST', body: JSON.stringify({
          create: true, course, title, blurb: bar.querySelector('#naBlurb').value, order: bar.querySelector('#naOrder').value
        }) });
        creating = false;
        f = { q: '', course: res.course, assignment: res.id, status: '', attention: false };
        mount(el, mount.api);          // reloads the list, showing the new (empty) assignment
      } catch (e) {
        msg.textContent = e.message || "Couldn't save. Try again.";
        save.disabled = false;
      }
    });
  }

  /* ---------- the selected assignment: its name and description, editable ---------- */
  const currentAssignment = () => (data.assignments[f.course] || []).find(a => a.id === f.assignment);
  function assignmentBar(editing = false) {
    const a = currentAssignment();
    if (!a) return '';
    return `<div class="proj-assign${a.show ? '' : ' is-off'}" id="assignBar" data-course="${esc(f.course)}" data-id="${esc(a.id)}">${editing ? `
      <label>Name <input id="aTitle" maxlength="60" value="${esc(a.title)}"></label>
      <label>Description <span class="opt">shown on the course page above its projects</span>
        <textarea id="aBlurb" rows="2" maxlength="300">${esc(a.blurb)}</textarea></label>
      <label class="proj-order">Order <span class="opt">optional: 1 shows first</span>
        <input id="aOrder" type="number" min="0" max="99" value="${a.order ?? ''}"></label>
      <p class="proj-assign-go"><button class="btn btn-primary" id="aSave">Save assignment</button>
        <button class="btn btn-ghost" id="aCancel">Cancel</button> <span id="aMsg" aria-live="polite"></span></p>` : `
      <div><p class="mono">Assignment · <code>${esc(f.course)}/${esc(a.id)}</code></p>
        <h3>${esc(a.title)}</h3><p>${a.blurb ? esc(a.blurb) : '<i>No description yet.</i>'}</p></div>
      <div class="assign-side">
        <label class="assign-show"><input type="checkbox" data-assign-show${a.show ? ' checked' : ''}> On the site</label>
        ${assignMsg[`${f.course}/${a.id}`] ? `<span class="assign-msg" aria-live="polite">${esc(assignMsg[`${f.course}/${a.id}`])}</span>` : ''}
        <button class="btn btn-ghost" id="aEdit">Edit assignment</button>
      </div>`}</div>`;
  }

  /* ---------- assignments: a tile each, with a switch for the whole assignment ----------
     Unticking one takes all its work off the site (show: false in its assignment.yml);
     each project keeps its own Show, so ticking it again brings back exactly the ones
     that were shown before. */
  let assignMsg = {};                // "course/id" -> the last save's message, kept across re-renders
  function assignmentTiles() {
    const slugs = f.course ? [f.course] : Object.keys(data.assignments).sort((x, y) => courseOrder(x) - courseOrder(y));
    const tiles = slugs.flatMap(c => (data.assignments[c] || []).slice()
      .sort((x, y) => (x.order ?? 999) - (y.order ?? 999) || x.title.localeCompare(y.title)).map(a => ({ c, a })));
    if (!tiles.length) return '';
    return `<section class="assign-sec" aria-label="Assignments">
      <p class="assign-head"><b>Assignments</b> <span class="opt">Untick one to take all its work off the site. Tick it to bring it back.</span></p>
      <div class="assign-tiles">${tiles.map(({ c, a }) => {
        const msg = assignMsg[`${c}/${a.id}`];
        const counts = !a.count ? 'No work yet'
          : a.show ? `${a.shown} of ${a.count} on the site`
          : `Off the site · ${a.shown} of ${a.count} come back when ticked`;
        return `<article class="assign-tile${a.show ? '' : ' is-off'}" data-course="${esc(c)}" data-id="${esc(a.id)}">
          <button type="button" class="assign-open" title="See this assignment's projects">${esc(a.title)}</button>
          <span class="assign-meta">${f.course ? '' : `${esc(courseName(c))} · `}${counts}</span>
          <label class="assign-show"><input type="checkbox" data-assign-show${a.show ? ' checked' : ''}> On the site</label>
          ${msg ? `<span class="assign-msg" aria-live="polite">${esc(msg)}</span>` : ''}
        </article>`;
      }).join('')}</div>
    </section>`;
  }

  async function toggleAssignment(e) {
    const cb = e.target, box = cb.closest('[data-id]');
    const course = box.dataset.course, id = box.dataset.id, key = `${course}/${id}`, show = cb.checked;
    const a = (data.assignments[course] || []).find(x => x.id === id);
    if (!a) return;
    cb.disabled = true;
    let msg = box.querySelector('.assign-msg');
    if (!msg) { msg = document.createElement('span'); msg.className = 'assign-msg'; msg.setAttribute('aria-live', 'polite'); cb.closest('label').after(msg); }
    msg.textContent = 'Saving…';
    try {
      const res = await mount.api.api('/assignment', { method: 'POST', body: JSON.stringify({
        course, id, ymlSha: a.ymlSha ?? null, title: a.title, blurb: a.blurb, order: a.order ?? '', show
      }) });
      a.show = show;
      a.ymlSha = res.ymlSha || a.ymlSha;
      data.projects.forEach(p => { if (p.course === course && p.assignment === id) p.assignmentHidden = !show; });
      assignMsg[key] = !res.published ? 'Saved to the test branch.'
        : show ? 'Saved. Back on the site in about a minute.' : 'Saved. Off the site in about a minute.';
    } catch (err) {
      assignMsg[key] = err.message || "Couldn't save. Try again.";
    }
    render();
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

  /* Card button: open the edit page. */
  async function onCardAction(e) {
    const b = e.target.closest('[data-act="edit"]');
    if (!b) return;
    const box = b.closest('.proj-actions'), busy = box.querySelector('.proj-busy');
    const p = data.projects.find(x => x.path === box.dataset.path);
    b.disabled = true;
    busy.textContent = 'Opening…';
    try {
      const project = await mount.api.api('/project?path=' + encodeURIComponent(p.path));
      window.AdminAdd.open(el, { api: mount.api, data, courses, edit: project, onClose: changed => changed ? mount(el, mount.api) : render() });
    } catch (err) {
      busy.textContent = err.message || "Couldn't open it. Try again.";
      b.disabled = false;
    }
  }

  /* Card checkbox: put one project on the site or take it off, without opening it.
     Going public needs the student's agreement, so ticking asks; unticking just saves. */
  let cardMsg = {};                  // repo path -> the last save's message, kept across re-renders
  async function onShowToggle(e) {
    const cb = e.target.closest('[data-proj-show]');
    if (!cb) return;
    const box = cb.closest('.proj-actions'), busy = box.querySelector('.proj-busy');
    const p = data.projects.find(x => x.path === box.dataset.path);
    const show = cb.checked;
    if (show && !confirm(`Show "${p.title}" on the site?\n\nOnly if the student(s) agreed to have it shown publicly.`)) {
      cb.checked = false;
      return;
    }
    cb.disabled = true;
    busy.textContent = 'Saving…';
    try {
      const project = await mount.api.api('/project?path=' + encodeURIComponent(p.path));
      const res = await mount.api.api('/project', { method: 'POST', body: JSON.stringify({
        path: project.path, ymlSha: project.ymlSha,
        meta: { ...project.meta, show, consent: show },
        ...(project.kind === 'link' && project.embed ? { embed: project.embed } : {})
      }) });
      p.status = show ? 'shown' : 'hidden';
      const a = (data.assignments[p.course] || []).find(x => x.id === p.assignment);
      if (a) a.shown += show ? 1 : -1;
      cardMsg[p.path] = !res.published ? 'Saved to the test branch.'
        : p.assignmentHidden ? 'Saved. Its assignment is switched off, so it stays off the site until that\'s ticked.'
        : show ? 'Saved. On the site in about a minute.' : 'Saved. Off the site in about a minute.';
    } catch (err) {
      cardMsg[p.path] = err.message || "Couldn't save. Try again.";
    }
    render();
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
