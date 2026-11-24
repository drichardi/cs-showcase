/* Single course page. */
(async function () {
  const slug = new URLSearchParams(location.search).get('c');
  const root = document.getElementById('courseRoot');
  let data;
  try { data = await (await fetch('data/courses.json', { cache: 'no-cache' })).json(); }
  catch (e) { root.innerHTML = '<div class="wrap"><p>Could not load course data.</p></div>'; return; }

  const c = data.courses.find(x => x.slug === slug);
  if (!c) {
    root.innerHTML = `<div class="wrap" style="padding:80px 0">
      <h1>Course not found</h1>
      <p style="color:var(--ink-2);margin-top:14px">
        ${data.courses.map(x => `<a href="course.html?c=${x.slug}">${esc(x.name)}</a>`).join(' · ')}
      </p></div>`;
    return;
  }

  document.title = c.name + ' — Punahou CS';
  await window.Work.load();
  const line = data.lines.find(l => l.id === c.line) || {};
  const col = line.color || '#789';
  document.body.style.setProperty('--c', col);

  const projects = window.Work.forCourse(c.slug);
  // Assignments are the folders projects sit in (intro-programming/tiling/...).
  // A course whose projects aren't in assignment folders just gets one grid.
  const assignments = window.Work.assignmentsFor(c.slug);
  const grouped = assignments.some(a => a.id);
  const aTitle = id => (assignments.find(a => a.id === (id || '')) || {}).title || '';
  const items = projects.map(p => ({
    slug: c.slug, project: p, assignment: p.assignment || '',
    assignmentTitle: grouped ? aTitle(p.assignment) : '', tagLabel: aTitle(p.assignment), tagColor: col
  }));

  /* Student work leads the page: one project large, the rest underneath.
     The course description follows it. */
  root.innerHTML = `
    <div class="wrap course-hero">
      <p class="mono line-name">${esc(line.label || '')}</p>
      <h1>${esc(c.name)}</h1>
      ${c.subtitle ? `<p class="sub">${esc(c.subtitle)}</p>` : ''}
      <p class="tl">${esc(c.tagline)}</p>
    </div>

    <div class="wrap course-work">
      ${items.length ? `
        <div class="stage-host" id="stage"></div>
        ${grouped ? `<nav class="assign-bar" id="assignBar" aria-label="Assignments"></nav>
          <div id="courseMore"></div>`
        : items.length > 1 ? `
          <p class="more-head mono">${items.length} projects from ${esc(c.short || c.name)}</p>
          <div class="gallery gallery-sm" id="courseGallery"></div>` : ''}`
      : window.Work.failed()
        ? `<div class="empty-work">Student work couldn't be loaded just now. Try again in a minute.</div>`
        : `<div class="empty-work">No student work published for this course yet. Add a project folder under
             <code style="color:var(--ink-2)">${esc(c.slug)}/</code> in the work repo with <code style="color:var(--ink-2)">show: true</code> in its project.yml.</div>`}
    </div>

    <div class="wrap course-body">
      <div>
        <dl class="facts">
          <div><dt>Length</dt><dd>${c.semesters === 2 ? 'Full year' : '1 semester'}</dd></div>
          <div><dt>Prerequisite</dt><dd>${esc(c.prereqText)}</dd></div>
          <div><dt>Counts toward</dt><dd>DTE distinction${c.countsAsProgramming ? ' · programming semesters' : ''}</dd></div>
        </dl>
        ${window.showQuote(data, c) ? `<blockquote class="pull lg${c.quote.placeholder ? ' is-placeholder' : ''}">
            ${esc(c.quote.text)}<cite>${esc(c.quote.by || '')}${c.quote.placeholder ? ' · sample quote' : ''}</cite>
          </blockquote>` : ''}
        <ul class="hl">${c.highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>
        <p class="about">${esc(c.about)}</p>
        ${c.note ? `<div class="callout">${esc(c.note)}</div>` : ''}
      </div>

      <aside>
        <div class="side">
          <h4>Tags</h4>
          <div class="tags">${(c.skills || []).map(k => tagChip(k)).join('')}</div>
        </div>
        <div class="side">
          <h4>Next</h4>
          <div class="tags">${
            data.courses.filter(x => x.prereqs.some(p =>
              (p.anyOf || []).includes(c.slug) || (p.allOf || []).includes(c.slug)))
              .map(x => `<a class="tag" href="course.html?c=${x.slug}">${esc(x.short)} →</a>`).join('')
            || '<span class="tag" style="cursor:default">no direct follow-on</span>'}</div>
        </div>
        <div class="side">
          <h4>Plan it</h4>
          <a class="btn btn-ghost" style="width:100%;justify-content:center" href="index.html#plan">Create your plan</a>
        </div>
      </aside>
    </div>`;

  if (!items.length) return;

  /* The hash holds what's open: #a=<assignment> filters to one assignment
     (#a=other for projects outside an assignment folder), #p=<project> opens that
     project first. Both can be shared, e.g. course.html?c=intro-programming#a=tiling */
  const hashParams = () => Object.fromEntries(location.hash.replace(/^#/, '').split('&')
    .filter(Boolean).map(kv => kv.split('=').map(decodeURIComponent)));
  const aKey = id => id || 'other';
  const selected = () => {
    const a = hashParams().a;
    return a === undefined ? null : assignments.find(x => aKey(x.id) === a) || null;
  };
  const remember = it => {
    const sel = selected();
    history.replaceState(null, '', '#' + [sel ? 'a=' + encodeURIComponent(aKey(sel.id)) : '',
      'p=' + encodeURIComponent(it.project.id)].filter(Boolean).join('&'));
  };

  const stage = window.Stage(document.getElementById('stage'));
  const byId = id => items.find(it => String(it.project.id) === id);
  const pool = (selected() ? items.filter(it => it.assignment === selected().id) : items);
  stage.show(byId(hashParams().p) || pool[Math.floor(Math.random() * pool.length)]);

  if (!grouped) {
    const galleryEl = document.getElementById('courseGallery');
    if (galleryEl) window.Stage.gallery(galleryEl, items, stage, remember);
    return;
  }

  /* All: a row per assignment, picked at random by the same rule as the home page
     (ROW_SIZE / ROW_MIN in config.js); small assignments share a row, with each card
     labelled. One assignment: every project in it, with its description. */
  const size = window.CS_CONFIG.ROW_SIZE || 5, min = window.CS_CONFIG.ROW_MIN || 4;
  const link = x => '#a=' + encodeURIComponent(aKey(x.id));

  function renderMore() {
    const sel = selected();
    document.getElementById('assignBar').innerHTML =
      `<a class="tag${sel ? '' : ' sel'}" href="#"${sel ? '' : ' aria-current="true"'}>All <span class="n">${items.length}</span></a>` +
      assignments.map(x => `<a class="tag${sel === x ? ' sel' : ''}" href="${link(x)}"${sel === x ? ' aria-current="true"' : ''}>${
        esc(x.title)} <span class="n">${x.count}</span></a>`).join('');

    const el = document.getElementById('courseMore');
    if (sel) {
      const list = items.filter(it => it.assignment === sel.id);
      window.Stage.gallery(el, list, stage, remember, () => `
        <div class="assign-head">
          <h3>${esc(sel.title)}</h3>
          ${sel.blurb ? `<p>${esc(sel.blurb)}</p>` : ''}
        </div>
        <div class="gallery gallery-sm">${list.map(it => window.Work.card(it)).join('')}</div>`);
      return;
    }
    const groups = assignments.map((x, order) => ({ x, order, items: items.filter(it => it.assignment === x.id) }));
    const rows = window.Work.packRows(groups, size, min);
    window.Stage.gallery(el, rows.flatMap(r => r.items), stage, remember, () => rows.map(r => {
      const one = r.groups.length === 1, x = r.groups[0].x;
      const head = one
        ? `<a class="row-title" style="--c:${esc(col)}" href="${link(x)}">${esc(x.title)}</a>
           ${x.blurb ? `<span class="row-blurb">${esc(x.blurb)}</span>` : ''}
           ${r.total > r.items.length ? `<a class="row-more" href="${link(x)}">All ${r.total} →</a>` : ''}`
        : `<span class="row-title is-shared">${r.groups.map(g =>
            `<a style="--c:${esc(col)}" href="${link(g.x)}">${esc(g.x.title)}</a>`).join('')}</span>`;
      return `<div class="work-row">
        <div class="row-head">${head}</div>
        <div class="row-cards" style="--row:${size}">${r.items.map(it => window.Work.card(it, { tag: !one })).join('')}</div>
      </div>`;
    }).join(''));
  }
  renderMore();

  // Chips and row titles are plain links; the back button walks through filters.
  addEventListener('hashchange', () => {
    renderMore();
    const want = byId(hashParams().p);
    if (want && want !== stage.current) stage.show(want);
  });
})();
