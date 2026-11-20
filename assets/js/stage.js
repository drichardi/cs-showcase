/* ============================================================
   The stage: one project shown large, live if it's playable,
   with a gallery underneath that loads its picks onto the stage.

   A sketch with a fixed canvas (size: 400x400) is rendered at its
   real size and scaled to fit, so mouseX/mouseY still line up and
   a 400px intro sketch becomes big enough to actually play with.
   ============================================================ */
window.Stage = function (host) {
  const W = window.Work, esc = window.esc;
  let current = null;

  function frameFor(emb, title) {
    const f = document.createElement('iframe');
    f.src = emb.src;
    f.title = title;
    f.allowFullscreen = true;
    f.setAttribute('allow', 'autoplay; fullscreen; gamepad');
    // Repo-hosted sketches share an origin with this site, so they get an opaque one.
    if (emb.hosted) f.setAttribute('sandbox', 'allow-scripts allow-pointer-lock allow-popups allow-modals');
    return f;
  }

  function start(focus) {
    const emb = W.embedOf(current.project);
    const box = host.querySelector('.stage-frame');
    if (!emb || !box) return;
    const f = frameFor(emb, current.project.title);
    box.replaceChildren(f);
    box.classList.add('is-live');
    fit();
    if (focus) f.focus({ preventScroll: true });  // keyboard games get input at once
  }

  /* Size the frame to the space available: the stage column's width and
     most of the viewport's height (or the whole screen in full screen). */
  function fit() {
    const media = host.querySelector('.stage-media'), box = host.querySelector('.stage-frame');
    if (!media || !box || !current) return;
    const full = document.fullscreenElement === media;
    const availW = media.clientWidth;
    const availH = full ? media.clientHeight : Math.max(240, window.innerHeight - 150);
    const emb = W.embedOf(current.project);
    const f = box.querySelector('iframe');
    let w, h;
    if (emb && emb.size) {
      const [sw, sh] = emb.size;
      const k = Math.min(availW / sw, availH / sh, 3);
      w = sw * k; h = sh * k;
      if (f) Object.assign(f.style, { width: sw + 'px', height: sh + 'px', transform: `scale(${k})` });
    } else {
      const ratio = emb ? emb.ratio : 16 / 10;
      w = Math.min(availW, availH * ratio); h = w / ratio;
      if (f) Object.assign(f.style, { width: '100%', height: '100%', transform: '' });
    }
    box.style.width = Math.floor(w) + 'px';
    box.style.height = Math.floor(h) + 'px';
    // The caption lines up under the piece, like a label on a wall.
    const info = host.querySelector('.stage-info');
    if (info && !full) info.style.maxWidth = Math.floor(Math.max(w, Math.min(availW, 560))) + 'px';
  }

  /* item = { slug, project, courseName }
     autoload: start a playable project now (default: its own autoplay setting)
     focus:    hand keyboard focus to it (only after a click, never on page load) */
  function show(item, { autoload, focus } = {}) {
    current = item;
    const p = item.project, emb = W.embedOf(p), cover = W.coverOf(p);
    const links = (p.links || []).map(l =>
      `<a href="${esc(W.url(l.url))}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`);
    const repo = window.CS_CONFIG.WORK_REPO;
    if (emb && emb.hosted && repo && p.path && !W.isSample()) {
      links.push(`<a href="${esc(repo.replace(/\/+$/, ''))}/tree/HEAD/${esc(p.path)}" target="_blank" rel="noopener">View code ↗</a>`);
    } else if (emb && emb.codeUrl) {
      links.push(`<a href="${esc(emb.codeUrl)}" target="_blank" rel="noopener">View code ↗</a>`);
    }
    const canFull = emb && document.fullscreenEnabled;

    let inner;
    if (emb) {
      inner = `<button type="button" class="stage-play" aria-label="Play ${esc(p.title)}">
          ${cover ? W.visualEl(cover, p) : `<span class="work-media work-media-blank"><span>${esc(p.title)}</span></span>`}
          <span class="play-chip">Play</span></button>`;
    } else if (cover) {
      inner = W.visualEl(cover, p, 'controls');
    } else {
      inner = `<span class="work-media work-media-blank"><span>${esc(p.title)}</span></span>`;
    }

    host.innerHTML = `
      <div class="stage${emb ? ' is-playable' : ''}">
        <div class="stage-media"><div class="stage-frame">${inner}</div></div>
        <div class="stage-info">
          ${item.courseName ? `<a class="stage-course" href="course.html?c=${encodeURIComponent(item.slug)}#p=${encodeURIComponent(p.id)}">${esc(item.courseName)} →</a>` : ''}
          <h3>${esc(p.title)}</h3>
          <span class="by">${esc(p.student || 'Student work')}${p.year ? ' · ' + esc(p.year) : ''}</span>
          ${p.blurb ? `<p>${esc(p.blurb)}</p>` : ''}
          ${emb && emb.size ? `<p class="stage-hint">Click the sketch to give it the mouse and keyboard.</p>` : ''}
          ${links.length || canFull ? `<div class="work-links">
            ${canFull ? '<button type="button" class="stage-full">Full screen</button>' : ''}
            ${links.join('')}</div>` : ''}
        </div>
      </div>`;

    const play = host.querySelector('.stage-play');
    if (play) play.addEventListener('click', () => start(true));
    const full = host.querySelector('.stage-full');
    if (full) full.addEventListener('click', () => {
      if (!host.querySelector('.stage-frame.is-live')) start(false);
      host.querySelector('.stage-media').requestFullscreen().catch(() => {});
    });

    fit();
    if (emb && (autoload ?? emb.autoplay)) start(!!focus);
  }

  /* Bring the stage into view if a gallery click happened far below it. */
  function reveal() {
    const r = host.getBoundingClientRect();
    if (r.top < 60 || r.top > window.innerHeight * 0.4) host.scrollIntoView({ block: 'start' });
  }

  if ('ResizeObserver' in window) new ResizeObserver(() => fit()).observe(host);
  else window.addEventListener('resize', fit);
  document.addEventListener('fullscreenchange', fit);

  return { show, reveal, fit, get current() { return current; } };
};

/* Render cards into `el`; clicking one plays it on `stage`. */
window.Stage.gallery = function (el, items, stage, onPick) {
  el.innerHTML = items.map(it => window.Work.card(it.slug, it.project, it.courseName)).join('');
  const mark = () => el.querySelectorAll('.work-card').forEach(c => {
    const cur = stage.current;
    const on = !!cur && c.dataset.slug === cur.slug && c.dataset.id === String(cur.project.id);
    c.classList.toggle('is-current', on);
    c.querySelector('.work-open').setAttribute('aria-current', on ? 'true' : 'false');
  });
  el.onclick = e => {
    const b = e.target.closest('.work-open');
    if (!b) return;
    const c = b.closest('.work-card');
    const it = items.find(x => x.slug === c.dataset.slug && String(x.project.id) === c.dataset.id);
    if (!it) return;
    stage.show(it, { autoload: true, focus: true });
    stage.reveal();
    mark();
    if (onPick) onPick(it);
  };
  mark();
  return { mark };
};
