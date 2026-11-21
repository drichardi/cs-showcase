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
  const items = projects.map(p => ({ slug: c.slug, project: p }));

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
        ${items.length > 1 ? `
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
        ${c.quote && c.quote.text ? `<blockquote class="pull lg${c.quote.placeholder ? ' is-placeholder' : ''}">
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
          <a class="btn btn-ghost" style="width:100%;justify-content:center" href="index.html#plan">Open route builder</a>
        </div>
      </aside>
    </div>`;

  if (!items.length) return;

  /* #p=<project-id> opens that project first, so a student can share a link to
     their own work. Otherwise the opening project is chosen at random. */
  const stage = window.Stage(document.getElementById('stage'));
  const want = decodeURIComponent((location.hash.match(/p=([^&]+)/) || [])[1] || '');
  const first = items.find(it => String(it.project.id) === want)
    || items[Math.floor(Math.random() * items.length)];
  stage.show(first);

  const galleryEl = document.getElementById('courseGallery');
  if (galleryEl) window.Stage.gallery(galleryEl, items, stage, it =>
    history.replaceState(null, '', '#p=' + encodeURIComponent(it.project.id)));
})();
