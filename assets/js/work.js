/* ============================================================
   Student work: fetch the manifest, pick projects at random,
   and work out how each project's media should be shown.
   The website never knows what's in the work repo until runtime,
   so adding a project needs no change here.
   ============================================================ */
window.Work = (function () {
  let manifest = null, loaded = false;
  const esc = s => window.esc(s);

  /* Where the work repo lives: CS_CONFIG.WORK_BASE. Only while the site itself runs
     on localhost, ?work=http://localhost:8000/ previews a local copy of the work repo
     instead (remembered for the tab). The live site never honours it. */
  let base = window.CS_CONFIG.WORK_BASE;
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
    try {
      const q = new URLSearchParams(location.search).get('work');
      if (q && /^http:\/\/(localhost|127\.0\.0\.1):\d+\/$/.test(q)) sessionStorage.setItem('cs-work-base', q);
      base = sessionStorage.getItem('cs-work-base') || base;
    } catch (e) { /* storage blocked: use the configured repo */ }
  }

  /* Real work only. If the manifest can't be loaded there is no work to show,
     and pages say so (failed: true) rather than filling in with samples. */
  async function load() {
    if (loaded) return manifest;
    loaded = true;
    try {
      const res = await fetch(base + window.CS_CONFIG.WORK_MANIFEST, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      manifest = await res.json();
    } catch (e) {
      manifest = { courses: {}, failed: true };
    }
    return manifest;
  }

  function forCourse(slug) {
    return (manifest && manifest.courses && manifest.courses[slug]) || [];
  }

  /* A course's assignments that have shown projects, in display order:
     [{ id, title, blurb, count }]. id "" is "Other projects" (no assignment folder).
     Falls back to working them out from the projects for an older manifest. */
  function assignmentsFor(slug) {
    const listed = manifest && manifest.assignments && manifest.assignments[slug];
    if (listed) return listed;
    const counts = {};
    forCourse(slug).forEach(p => { counts[p.assignment || ''] = (counts[p.assignment || ''] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => (a === '') - (b === '') || a.localeCompare(b)).map(id => ({
      id, count: counts[id], blurb: '',
      title: id ? id.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : 'Other projects'
    }));
  }

  function assignmentTitle(slug, id) {
    const a = assignmentsFor(slug).find(x => x.id === (id || ''));
    return a ? a.title : '';
  }

  function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* Rows of up to `size` cards, built from groups (courses on the home page,
     assignments on a course page): [{ order, items }]. A group with at least `min`
     items gets its own row, picked at random. Smaller groups share rows, packed in
     order and never split across two. A group with no items gets no row.
     Returns [{ groups, items, total }] in group order. */
  function packRows(groups, size, min) {
    min = Math.min(min, size);
    const rows = [];
    groups.filter(g => g.items.length >= min).forEach(g => rows.push({
      order: g.order, groups: [g], total: g.items.length, items: shuffled(g.items).slice(0, size)
    }));
    let shared = null;
    groups.filter(g => g.items.length && g.items.length < min).forEach(g => {
      if (!shared || shared.items.length + g.items.length > size) {
        shared = { order: g.order, groups: [], items: [], total: 0 };
        rows.push(shared);
      }
      shared.groups.push(g);
      shared.total += g.items.length;
      shared.items.push(...shuffled(g.items));
    });
    return rows.sort((a, b) => a.order - b.order);
  }

  /* "Spring 2026" from semester + year; either may be missing. */
  function when(p) {
    const sem = p.semester ? p.semester[0].toUpperCase() + p.semester.slice(1) : '';
    return [sem, p.year].filter(Boolean).join(' ');
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
      return `<video class="work-media" src="${esc(url(m.src))}" data-title="${esc(project.title)}" muted loop playsinline autoplay preload="metadata" ${extra}></video>`;
    }
    return `<img class="work-media" src="${esc(url(m.src))}" data-title="${esc(project.title)}" alt="${esc(m.alt || project.title)}" loading="lazy">`;
  }

  /* A cover that doesn't load (a typo, or a screenshot nobody added) shows the
     title tile instead of the browser's broken-image icon. */
  document.addEventListener('error', e => {
    const el = e.target;
    if (!(el instanceof Element) || !el.matches('img.work-media, video.work-media')) return;
    const tile = document.createElement('span'), name = document.createElement('span');
    tile.className = 'work-media work-media-blank';
    name.textContent = el.dataset.title || '';
    tile.append(name);
    el.replaceWith(tile);
  }, true);

  /* A gallery card. The whole card is one button that opens the project on the
     page's stage. item = { slug, project, courseName, assignmentTitle, tagLabel, tagColor }.
     tag: label the card (rows that mix courses or assignments say which each card is from).
     assignment: name the assignment in the line under the title. */
  function card(item, { tag = false, assignment = false } = {}) {
    const project = item.project, cover = coverOf(project), live = !!embedOf(project);
    const by = [project.student || 'Student work', assignment && item.assignmentTitle, when(project)]
      .filter(Boolean).join(' · ');
    return `<article class="work-card" data-slug="${esc(item.slug)}" data-id="${esc(project.id)}">
      <div class="work-thumb">
        ${cover ? visualEl(cover, project)
          : `<span class="work-media work-media-blank"><span>${esc(project.title)}</span></span>`}
        ${live ? '<span class="play-chip">Play</span>' : ''}
        ${tag && item.tagLabel ? `<span class="work-tag" style="--c:${esc(item.tagColor || 'var(--accent)')}">${esc(item.tagLabel)}</span>` : ''}
      </div>
      <div class="work-body">
        <h5><button type="button" class="work-open">${esc(project.title)}</button></h5>
        <span class="by">${esc(by)}</span>
        ${project.blurb ? `<p>${esc(project.blurb)}</p>` : ''}
      </div>
    </article>`;
  }

  return {
    load, forCourse, assignmentsFor, assignmentTitle, shuffled, packRows, when, card, url, esc,
    embedOf, coverOf, visualEl,
    failed: () => !!(manifest && manifest.failed)
  };
})();
