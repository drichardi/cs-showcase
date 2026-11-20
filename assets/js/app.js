/* Home page: map, tag filter, planner, gallery. */
(async function () {
  let data;
  try { data = await (await fetch('data/courses.json', { cache: 'no-cache' })).json(); }
  catch (e) { document.getElementById('mapGrid').innerHTML = '<p style="color:var(--ink-3)">Could not load data/courses.json.</p>'; return; }

  document.getElementById('stat-courses').textContent = data.courses.length;
  await window.Work.load();
  const course = s => data.courses.find(c => c.slug === s);

  /* tag bar — only tags actually used by a course */
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
    history.replaceState(null, '', window.__tag ? '#tag=' + window.__tag : location.pathname);
  });

  window.CSMap.render(data);
  window.Planner.init(data);

  const m = location.hash.match(/tag=([\w-]+)/);
  if (m) { window.__tag = m[1]; window.CSMap.filter(m[1]); }

  /* One project per course. A playable one gets the stage when there is one. */
  const stage = window.Stage(document.getElementById('stage'));
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
  renderGallery();

  if (window.Work.isSample()) {
    const b = document.createElement('p');
    b.className = 'mono';
    b.style.cssText = 'color:var(--warn);margin-top:18px;font-size:.66rem';
    b.textContent = window.Work.sampleReason() === 'empty'
      ? 'Sample work — shown until the work repo has its first project.'
      : 'Sample work — point WORK_BASE in assets/js/config.js at your repo to go live.';
    document.querySelector('#work .wrap').appendChild(b);
  }
})();
