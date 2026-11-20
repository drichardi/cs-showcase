/* ============================================================
   Student work: fetch the manifest, pick projects at random,
   and work out how each project's media should be shown.
   The website never knows what's in the work repo until runtime,
   so adding a project needs no change here.
   ============================================================ */
window.Work = (function () {
  let manifest = null, base = window.CS_CONFIG.WORK_BASE, loaded = false;
  const esc = s => window.esc(s);

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

  /* "400x400", [400, 400] or {width, height} → [400, 400] */
  function pair(v) {
    if (!v) return null;
    if (Array.isArray(v)) v = v.join('x');
    else if (typeof v === 'object') v = `${v.width}x${v.height}`;
    const m = String(v).match(/^\s*(\d+(?:\.\d+)?)\s*[x×,:/]\s*(\d+(?:\.\d+)?)\s*$/i);
    return m && +m[1] > 0 && +m[2] > 0 ? [+m[1], +m[2]] : null;
  }

  /* The project's playable piece, if it has one.
       https://…            hosted elsewhere: itch.io, the p5 editor, CodePen, Scratch
       folder/index.html    hosted in the work repo itself (a p5 sketch). These run
                            sandboxed, because the work repo and this site share a
                            GitHub Pages origin and student code shouldn't reach the site.
     size: 400x400  the sketch's canvas size. It's drawn at that size and scaled to
                    fill the stage, so mouseX/mouseY still line up.
     aspect: 4:3    no fixed size; fill the stage at this shape (default 16:10).
     autoplay       start without a click. Default: on for sketches hosted in the
                    repo, the p5 editor and OpenProcessing; off for everything else,
                    since a Unity build can be 100 MB. */
  function embedOf(project) {
    const m = (project.media || []).find(x => x && x.type === 'embed' && x.src);
    if (!m) return null;
    let src = String(m.src).trim(), hosted = false;
    if (/^https?:\/\//i.test(src)) {
      // A p5 editor link usually points at the editor; /full/ is just the sketch.
      src = src.replace(/^(https?:\/\/editor\.p5js\.org\/[^/]+)\/sketches\//i, '$1/full/');
    } else if (/^[\w\-./ ]+$/.test(src) && !src.includes('..')) {
      src = url(src.split('/').map(encodeURIComponent).join('/'));
      hosted = true;
    } else {
      return null;
    }
    let host = '';
    try { host = new URL(src, location.href).hostname; } catch (e) { return null; }
    const p5editor = /(^|\.)editor\.p5js\.org$/i.test(host);
    const size = pair(m.size);
    const shape = typeof m.aspect === 'number' ? [m.aspect, 1] : pair(m.aspect);
    return {
      src, hosted, size,
      ratio: size ? size[0] / size[1] : shape ? shape[0] / shape[1] : 16 / 10,
      autoplay: m.autoplay != null ? !!m.autoplay
        : hosted || p5editor || /(^|\.)openprocessing\.org$/i.test(host),
      codeUrl: p5editor ? src.replace(/\/full\//, '/sketches/') : ''
    };
  }

  function coverOf(project) {
    return (project.media || []).find(m => m && m.type !== 'embed' && m.src) || null;
  }

  function visualEl(m, project, extra = '') {
    if (m.type === 'video') {
      return `<video class="work-media" src="${esc(url(m.src))}" muted loop playsinline autoplay preload="metadata" ${extra}></video>`;
    }
    return `<img class="work-media" src="${esc(url(m.src))}" alt="${esc(m.alt || project.title)}" loading="lazy">`;
  }

  /* A gallery card. The whole card is one button that opens the project
     on the page's stage; the course link (home page only) sits above it. */
  function card(slug, project, courseName) {
    const cover = coverOf(project), live = !!embedOf(project);
    return `<article class="work-card" data-slug="${esc(slug)}" data-id="${esc(project.id)}">
      <div class="work-thumb">
        ${cover ? visualEl(cover, project)
          : `<span class="work-media work-media-blank"><span>${esc(project.title)}</span></span>`}
        ${live ? '<span class="play-chip">Play</span>' : ''}
      </div>
      <div class="work-body">
        <h5><button type="button" class="work-open">${esc(project.title)}</button></h5>
        <span class="by">${esc(project.student || 'Student work')}${project.year ? ' · ' + esc(project.year) : ''}${
          courseName ? ` · <a href="course.html?c=${encodeURIComponent(slug)}#p=${encodeURIComponent(project.id)}">${esc(courseName)}</a>` : ''}</span>
        ${project.blurb ? `<p>${esc(project.blurb)}</p>` : ''}
      </div>
    </article>`;
  }

  return {
    load, forCourse, randomFor, sample, card, url, esc, embedOf, coverOf, visualEl,
    isSample: () => !!(manifest && manifest._isSample)
  };
})();
