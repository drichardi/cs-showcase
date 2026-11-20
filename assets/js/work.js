/* ============================================================
   Student work: fetch the manifest, pick projects at random.
   The website never knows what's in the work repo until runtime,
   so adding a project needs no change here.
   ============================================================ */
window.Work = (function () {
  let manifest = null, base = window.CS_CONFIG.WORK_BASE, loaded = false;

  async function load() {
    if (loaded) return manifest;
    loaded = true;
    const cfg = window.CS_CONFIG;
    try {
      const res = await fetch(cfg.WORK_BASE + cfg.WORK_MANIFEST, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      manifest = await res.json();
    } catch (e) {
      try {
        const res = await fetch(cfg.FALLBACK_MANIFEST, { cache: 'no-cache' });
        manifest = await res.json();
        base = '';                      // sample media paths are site-relative
        manifest._isSample = true;
      } catch (e2) { manifest = { courses: {} }; }
    }
    return manifest;
  }

  function forCourse(slug) {
    if (!manifest || !manifest.courses) return [];
    return (manifest.courses[slug] || []).filter(p => p.consent !== false);
  }

  function randomFor(slug, exclude) {
    const list = forCourse(slug).filter(p => p.id !== exclude);
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  /* One project per course, courses shuffled, capped at n. */
  function sample(n, courseSlugs) {
    const picks = [];
    courseSlugs.slice().sort(() => Math.random() - 0.5).forEach(slug => {
      const p = randomFor(slug);
      if (p) picks.push({ slug, project: p });
    });
    return picks.slice(0, n);
  }

  function url(p) {
    if (!p) return '';
    if (/^https?:\/\//i.test(p)) return p;
    return base + p.replace(/^\/+/, '');
  }

  function mediaEl(project) {
    const m = (project.media || [])[0];
    if (!m) return '<div class="work-media" style="display:grid;place-items:center;color:var(--ink-3);font-size:.8rem">No preview</div>';
    if (m.type === 'embed') {
      return `<div class="work-media-wrap"><iframe src="${esc(m.src)}" loading="lazy" allowfullscreen title="${esc(project.title)}"></iframe></div>`;
    }
    if (m.type === 'video') {
      return `<video class="work-media" src="${esc(url(m.src))}" muted loop playsinline autoplay preload="metadata"></video>`;
    }
    return `<img class="work-media" src="${esc(url(m.src))}" alt="${esc(m.alt || project.title)}" loading="lazy">`;
  }

  const esc = window.esc;

  function card(slug, project, courseName) {
    const links = (project.links || []).map(l =>
      `<a href="${esc(url(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join('');
    return `<article class="work-card">
      ${mediaEl(project)}
      <div class="work-body">
        <h5>${esc(project.title)}</h5>
        <span class="by">${esc(project.student || 'Student work')}${project.year ? ' · ' + esc(project.year) : ''}${courseName ? ' · ' + esc(courseName) : ''}</span>
        ${project.blurb ? `<p>${esc(project.blurb)}</p>` : ''}
        ${links ? `<div class="work-links">${links}</div>` : ''}
      </div>
    </article>`;
  }

  return { load, forCourse, randomFor, sample, card, url, esc, isSample: () => !!(manifest && manifest._isSample) };
})();
