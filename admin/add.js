/* ============================================================
   Teacher dashboard. Step 3: adding a project.

   One page, four parts: where it goes, the work itself (a p5 zip or folder,
   a link, or pictures), the details, and publishing. A sketch plays in a
   preview before anything is saved. Publishing sends everything to the
   server program, which saves it to the repo as one change.
   ============================================================ */
window.AdminAdd = (function () {
  const esc = window.esc;
  const JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
  const JUNK = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;
  const PICTURE = /\.(png|jpe?g|webp|gif|svg|avif|mp4|webm|mov)$/i;
  const MAX_BYTES = 25 * 1024 * 1024;
  const MAX_ZOOM = 1.25;
  let el, ctx, d, pollTimer;

  /* ---------- state ---------- */
  function fresh(keep = {}) {
    const now = new Date();
    return {
      course: keep.course || '', assignment: keep.assignment || '', newAssignment: { title: '', blurb: '' },
      semester: keep.semester || (now.getMonth() < 6 ? 'spring' : 'fall'), year: keep.year || now.getFullYear(),
      kind: 'sketch', files: [], sketchName: '', canvas: '', workError: '',
      link: { url: '', size: '' }, pictures: [], mediaCover: '', coverMode: 'auto', coverFile: null,
      title: '', students: [], blurb: '', instructions: '', links: [],
      show: false, consent: false, folder: '', folderEdited: false, save: null
    };
  }

  /* context.edit: a project from GET /project, to edit (or to set up, when its
     folder has no project.yml yet). Otherwise it's a new project. */
  function open(host, context) {
    el = host; ctx = context;
    clearTimeout(pollTimer);
    d = context.edit ? fromProject(context.edit) : fresh(context.keep || {});
    render();
    // Anything changed since the page opened, and not yet saved? (Asked before leaving.)
    const start = snapshot();
    window.AdminDirty = () => !(d.save && d.save.res) && snapshot() !== start;
    el.scrollIntoView({ block: 'start' });
    if (d.edit && d.edit.cover) {
      ctx.api.file(`${d.edit.path}/${d.edit.cover}`).then(url => { d.currentCoverUrl = url; renderCover(); renderCard(); }).catch(() => {});
    }
  }

  const snapshot = () => JSON.stringify([d.course, d.assignment, d.newAssignment, d.semester, d.year, d.kind, d.files.length,
    d.sketchName, d.link, d.pictures.map(p => p.path), d.mediaCover, d.coverMode, !!d.coverFile, d.title, d.students, d.blurb,
    d.instructions, d.links, d.show, d.consent, d.folder, d.replacing]);

  function fromProject(p) {
    return Object.assign(fresh(), {
      edit: p, course: p.course, assignment: p.assignment, kind: p.kind, folder: p.folder,
      semester: p.meta.semester || (p.ymlSha ? '' : fresh().semester), year: p.meta.year || (p.ymlSha ? '' : fresh().year),
      title: p.meta.title, students: p.meta.students.length ? p.meta.students.slice() : guessStudents(p),
      blurb: p.meta.blurb, instructions: p.meta.instructions.join('\n'), links: p.meta.links.map(l => ({ ...l })),
      show: p.meta.show, consent: p.meta.show,           // already shown: consent was given when it went up
      link: p.embed ? { url: p.embed.src, size: p.embed.size } : { url: '', size: '' },
      coverMode: p.cover ? 'keep' : p.kind === 'sketch' ? 'auto' : 'upload', replacing: false
    });
  }

  /* A folder named in the repo's pattern ("anna-f-tiling-f26") suggests its students. */
  function guessStudents(p) {
    const who = p.assignment ? p.folder.split(`-${p.assignment}`)[0] : '';
    const t = who.split('-');
    if (!who || t.length % 2 || t.some((w, i) => (i % 2 ? w.length !== 1 : w.length < 2))) return [];
    const names = [];
    for (let i = 0; i < t.length; i += 2) names.push(`${t[i][0].toUpperCase()}${t[i].slice(1)} ${t[i + 1].toUpperCase()}.`);
    return names;
  }

  const courseName = slug => (ctx.courses.find(c => c.slug === slug) || {}).name || slug;
  const assignmentsFor = slug => ctx.data.assignments[slug] || [];

  /* ---------- page ---------- */
  function render() {
    const testMode = ctx.data.branch && ctx.data.branch !== 'main';
    const e = d.edit;
    const heading = !e ? 'Add a project' : e.ymlSha && !e.problem ? `Edit: ${esc(e.meta.title || e.folder)}` : `Set up: ${esc(e.folder)}`;
    el.innerHTML = `
      <div class="add-head">
        <button class="btn btn-ghost" id="back">← Projects</button>
        <h2>${heading}</h2>
      </div>
      ${testMode ? `<p class="add-test">Test mode: saves go to the <b>${esc(ctx.data.branch)}</b> branch, not the site.</p>` : ''}
      ${e && e.problem ? `<p class="add-test">${esc(e.problem)}. Saving writes a fresh project.yml from this form.</p>` : ''}
      ${e && !e.ymlSha ? `<p class="add-test">This sketch is in the repo but has no project.yml yet, so it isn't on the site. Fill this in to set it up.</p>` : ''}

      <section class="add-sec" id="secWhere">
        <h3><span>1</span> Where it goes</h3>
        ${e ? `<p class="add-where">${esc(courseName(e.course))}${e.assignment ? ` · ${esc(((assignmentsFor(e.course).find(a => a.id === e.assignment)) || {}).title || e.assignment)}` : ''}
          <span class="hint">in <code>${esc(e.path)}</code></span></p>` : ''}
        <div class="add-row"${e ? ' hidden' : ''}>
          <label>Course
            <select id="course"><option value="">Pick a course…</option>${ctx.courses.map(c =>
              `<option value="${esc(c.slug)}"${d.course === c.slug ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          </label>
          <label>Assignment
            <select id="assignment"${d.course ? '' : ' disabled'}>${assignmentOptions()}</select>
          </label>
        </div>
        <div class="add-row">
          <label>Term
            <span class="add-term">
              <select id="semester"><option value="">No term</option>${['spring', 'summer', 'fall'].map(s =>
                `<option value="${s}"${d.semester === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
              <input id="year" type="number" min="2000" max="2100" value="${esc(d.year)}" aria-label="Year">
            </span>
          </label>
        </div>
        <div id="newAssignment" class="add-row"${d.assignment === '__new' ? '' : ' hidden'}>
          <label>New assignment's name <input id="naTitle" maxlength="60" value="${esc(d.newAssignment.title)}" placeholder="Generative Art"></label>
          <label class="wide">One-line description <span class="opt">optional</span>
            <input id="naBlurb" maxlength="300" value="${esc(d.newAssignment.blurb)}" placeholder="Make a piece of art that changes every time it runs."></label>
        </div>
      </section>

      <section class="add-sec" id="secWork">
        <h3><span>2</span> The work</h3>
        ${e ? '' : `<div class="add-kinds" role="radiogroup" aria-label="What kind of work">
          ${[['sketch', 'p5 sketch'], ['link', 'Link'], ['media', 'Pictures or video']].map(([k, label]) =>
            `<button type="button" role="radio" data-kind="${k}" aria-checked="${d.kind === k}">${label}</button>`).join('')}
        </div>`}
        <div id="workBody"></div>
      </section>

      <section class="add-sec" id="secDetails">
        <h3><span>3</span> Details</h3>
        <div class="add-row">
          <label class="wide">Title <input id="title" maxlength="100" value="${esc(d.title)}" placeholder="Tiled Gears"></label>
        </div>
        <label>Students <span class="opt">first name and last initial, like Noa P. Press Enter after each.</span>
          <div class="chips" id="chips">${chipsHtml()}<input id="studentInput" placeholder="${d.students.length ? 'Add another…' : 'Noa P.'}" aria-label="Add a student"></div>
          <span class="hint" id="studentHint"></span>
        </label>
        <label>What it is <span class="opt">a sentence or two</span>
          <textarea id="blurb" maxlength="400" rows="2" placeholder="2D gears turn in the background while 3D shapes spin in the foreground.">${esc(d.blurb)}</textarea>
          <span class="hint" id="blurbCount"></span>
        </label>
        <label>How to use it <span class="opt">optional, one step per line. Shown as "Try it" beside the project.</span>
          <textarea id="instructions" rows="3" placeholder="Move the mouse to steer&#10;Click to jump">${esc(d.instructions)}</textarea>
        </label>
        <div class="add-links" id="links"></div>
      </section>

      <section class="add-sec" id="secPublish">
        <h3><span>4</span> Publish</h3>
        <div id="coverBody"></div>
        <label class="add-check"><input type="checkbox" id="show"${d.show ? ' checked' : ''}> Show it on the site</label>
        <label class="add-check add-consent" id="consentRow"${d.show ? '' : ' hidden'}>
          <input type="checkbox" id="consent"${d.consent ? ' checked' : ''}> The student(s) agreed to have this shown publicly</label>
        <p class="hint">Left unticked, it's saved to the repo but stays off the site.</p>
        ${e ? '' : `<details class="add-adv"><summary>Advanced</summary>
          <label>Folder name <input id="folder" value="${esc(d.folder)}" pattern="[a-z0-9-]+"></label>
          <p class="hint" id="folderPath"></p>
        </details>`}
        <div class="add-preview">
          <p class="mono">How it'll look in its row</p>
          <div id="cardPreview"></div>
        </div>
        <div class="add-go">
          <ul id="missing" class="add-missing"></ul>
          <button class="btn btn-primary" id="publish">${e ? 'Save changes' : 'Publish'}</button>
        </div>
        <div id="saveStatus" aria-live="polite"></div>
      </section>`;

    bind();
    renderWork(); renderLinks(); renderCover(); updateDerived();
  }

  function assignmentOptions() {
    if (!d.course) return '<option value="">Pick a course first</option>';
    return `<option value=""${d.assignment === '' ? ' selected' : ''}>No assignment (straight in the course)</option>` +
      assignmentsFor(d.course).map(a => `<option value="${esc(a.id)}"${d.assignment === a.id ? ' selected' : ''}>${esc(a.title)}</option>`).join('') +
      `<option value="__new"${d.assignment === '__new' ? ' selected' : ''}>New assignment…</option>`;
  }

  /* ---------- wiring ---------- */
  const $ = id => el.querySelector('#' + id);
  function bind() {
    $('back').addEventListener('click', () => {
      if (window.AdminDirty && window.AdminDirty() && !confirm('Leave without saving? What you\'ve entered here will be lost.')) return;
      clearTimeout(pollTimer); ctx.onClose(!!(d.save && d.save.res));
    });
    $('course').addEventListener('change', e => {
      d.course = e.target.value; d.assignment = '';
      $('assignment').innerHTML = assignmentOptions(); $('assignment').disabled = !d.course;
      $('newAssignment').hidden = true; updateDerived();
    });
    $('assignment').addEventListener('change', e => { d.assignment = e.target.value; $('newAssignment').hidden = d.assignment !== '__new'; updateDerived(); });
    $('naTitle').addEventListener('input', e => { d.newAssignment.title = e.target.value; updateDerived(); });
    $('naBlurb').addEventListener('input', e => { d.newAssignment.blurb = e.target.value; });
    $('semester').addEventListener('change', e => { d.semester = e.target.value; updateDerived(); });
    $('year').addEventListener('input', e => { d.year = Number(e.target.value) || ''; updateDerived(); });
    el.querySelectorAll('[data-kind]').forEach(b => b.addEventListener('click', () => {
      d.kind = b.dataset.kind;
      el.querySelectorAll('[data-kind]').forEach(x => x.setAttribute('aria-checked', x === b));
      renderWork(); renderCover(); updateDerived();
    }));
    $('title').addEventListener('input', e => { d.title = e.target.value; updateDerived(); });
    const si = $('studentInput');
    si.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ',') && si.value.trim()) { e.preventDefault(); addStudent(si.value); si.value = ''; }
      else if (e.key === 'Backspace' && !si.value && d.students.length) { d.students.pop(); renderChips(); }
    });
    si.addEventListener('blur', () => { if (si.value.trim()) { addStudent(si.value); si.value = ''; } });
    $('chips').addEventListener('click', e => {
      const x = e.target.closest('[data-remove]');
      if (x) { d.students.splice(+x.dataset.remove, 1); renderChips(); } else si.focus();
    });
    $('blurb').addEventListener('input', e => { d.blurb = e.target.value; updateDerived(); });
    $('instructions').addEventListener('input', e => { d.instructions = e.target.value; updateDerived(); });
    $('show').addEventListener('change', e => { d.show = e.target.checked; $('consentRow').hidden = !d.show; updateDerived(); });
    $('consent').addEventListener('change', e => { d.consent = e.target.checked; updateDerived(); });
    if ($('folder')) $('folder').addEventListener('input', e => { d.folder = e.target.value.trim(); d.folderEdited = !!d.folder; updateDerived(); });
    $('publish').addEventListener('click', publish);
  }

  /* ---------- students ---------- */
  /* "noa p" -> "Noa P."; leaves anything else as typed, with a gentle hint. */
  function tidyName(raw) {
    const words = raw.trim().replace(/\s+/g, ' ').split(' ');
    const fixed = words.map(w => w.length === 1 || /^[a-z]\.$/i.test(w)
      ? w[0].toUpperCase() + '.' : w[0].toUpperCase() + w.slice(1));
    return fixed.join(' ');
  }
  function addStudent(raw) {
    raw.split(/,| and /).map(s => s.trim()).filter(Boolean).forEach(s => {
      if (d.students.length < 8) d.students.push(tidyName(s));
    });
    renderChips();
  }
  const chipsHtml = () => d.students.map((s, i) =>
    `<span class="chip">${esc(s)}<button type="button" data-remove="${i}" aria-label="Remove ${esc(s)}">×</button></span>`).join('');
  function renderChips() {
    $('chips').querySelectorAll('.chip').forEach(c => c.remove());
    $('studentInput').insertAdjacentHTML('beforebegin', chipsHtml());
    $('studentInput').placeholder = d.students.length ? 'Add another…' : 'Noa P.';
    const odd = d.students.filter(s => !/^\S+ [A-Z]\.?$/.test(s));
    $('studentHint').textContent = odd.length ? `Usually first name and last initial: check ${odd.join(', ')}.` : '';
    updateDerived();
  }

  /* ---------- links ---------- */
  function renderLinks() {
    $('links').innerHTML = `<p class="add-label">Links <span class="opt">optional: source code, a write-up, a video</span></p>` +
      d.links.map((l, i) => `<div class="add-link">
        <input data-l="${i}" data-k="label" maxlength="40" placeholder="Label" value="${esc(l.label)}">
        <input data-l="${i}" data-k="url" placeholder="https://…" value="${esc(l.url)}">
        <button type="button" class="btn btn-ghost" data-drop="${i}" aria-label="Remove link">×</button></div>`).join('') +
      (d.links.length < 6 ? `<button type="button" class="btn btn-ghost add-small" id="addLink">+ Add a link</button>` : '');
    $('links').querySelectorAll('[data-l]').forEach(i => i.addEventListener('input', e => {
      d.links[+e.target.dataset.l][e.target.dataset.k] = e.target.value; updateDerived();
    }));
    $('links').querySelectorAll('[data-drop]').forEach(b => b.addEventListener('click', () => { d.links.splice(+b.dataset.drop, 1); renderLinks(); updateDerived(); }));
    const add = $('addLink');
    if (add) add.addEventListener('click', () => { d.links.push({ label: '', url: '' }); renderLinks(); });
  }

  /* ---------- the work ---------- */
  function renderWork() {
    const body = $('workBody');
    // Editing: show what's there now; replacing it brings back the upload area.
    if (d.edit && !d.replacing && d.kind !== 'link') {
      const files = d.edit.files.filter(f => !/^project\.(ya?ml|json)$/i.test(f.path));
      const bytes = files.reduce((n, f) => n + (f.size || 0), 0);
      const live = d.edit.meta.show ? `../course.html?c=${encodeURIComponent(d.edit.course)}#${
        d.edit.assignment ? 'a=' + encodeURIComponent(d.edit.assignment) + '&' : ''}p=${encodeURIComponent(d.edit.folder)}` : '';
      body.innerHTML = `<div class="add-loaded">
        <p><b>${d.kind === 'sketch' ? 'Sketch' : 'Pictures'} in the repo</b> · ${files.length} files · ${mb(bytes)}
          ${live ? `· <a href="${live}" target="_blank" rel="noopener">See it on the site ↗</a>` : ''}</p>
        <p class="hint">${files.slice(0, 8).map(f => esc(f.path)).join(', ')}${files.length > 8 ? `, and ${files.length - 8} more` : ''}</p>
        <p><button type="button" class="btn btn-ghost add-small" id="replaceWork">Replace with ${d.kind === 'sketch' ? 'a new version of the sketch' : 'new pictures'}…</button></p>
      </div>`;
      $('replaceWork').addEventListener('click', () => { d.replacing = true; renderWork(); updateDerived(); });
      return;
    }
    renderUpload(body);
    if (d.edit && d.replacing && d.kind !== 'link') {
      body.insertAdjacentHTML('beforeend', '<p><button type="button" class="btn btn-ghost add-small" id="keepWork">Keep the files that are there now</button></p>');
      $('keepWork').addEventListener('click', () => { d.replacing = false; d.files = []; d.pictures = []; renderWork(); updateDerived(); });
    }
  }

  function renderUpload(body) {
    if (d.kind === 'sketch') {
      body.innerHTML = d.files.length ? `
        <div class="add-loaded">
          <p><b>${esc(d.sketchName || 'Sketch')}</b> · ${d.files.length} files · ${mb(totalBytes())}${d.canvas ? ` · canvas ${esc(d.canvas)}` : ''}
            <button type="button" class="btn btn-ghost add-small" id="clearWork">Use a different sketch</button></p>
          ${totalBytes() > MAX_BYTES ? `<p class="add-err">That's over the 25 MB limit. A big game belongs on itch.io, added as a Link.</p>` : ''}
          <div class="add-stage" id="previewBox"></div>
          <p class="hint">This is the sketch running, as it will on the site. Click it to try it out.</p>
        </div>` : `
        <div class="drop" id="drop" tabindex="0">
          <p><b>Drop the sketch's zip here</b></p>
          <p class="hint">In the p5 editor: File → Download. Or choose it, or the sketch's folder:</p>
          <p><label class="btn btn-ghost">Choose a zip<input type="file" id="zipInput" accept=".zip" hidden></label>
             <label class="btn btn-ghost">Choose a folder<input type="file" id="folderInput" webkitdirectory multiple hidden></label></p>
          ${d.workError ? `<p class="add-err">${esc(d.workError)}</p>` : ''}
        </div>`;
      if (d.files.length) {
        $('clearWork').addEventListener('click', () => { d.files = []; d.canvas = ''; d.sketchName = ''; renderWork(); updateDerived(); });
        showSketchPreview();
      } else {
        const drop = $('drop');
        drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) loadZip(f); });
        $('zipInput').addEventListener('change', e => e.target.files[0] && loadZip(e.target.files[0]));
        $('folderInput').addEventListener('change', e => loadFolder([...e.target.files]));
      }
    } else if (d.kind === 'link') {
      const emb = embedFor(d.link.url);
      body.innerHTML = `
        <div class="add-row">
          <label class="wide">Link to the project
            <input id="linkUrl" value="${esc(d.link.url)}" placeholder="https://editor.p5js.org/you/sketches/AbC123, a Scratch project, an itch.io embed…"></label>
          <label>Canvas size <span class="opt">optional</span>
            <input id="linkSize" value="${esc(d.link.size)}" placeholder="400x400" pattern="\\d+x\\d+"></label>
        </div>
        ${emb && emb.note ? `<p class="add-err">${esc(emb.note)}</p>` : ''}
        ${emb ? `<p class="hint">Shown on the site from: ${esc(emb.src)}</p><div class="add-stage" id="previewBox"></div>` : ''}`;
      $('linkUrl').addEventListener('change', e => { d.link.url = e.target.value.trim(); renderWork(); updateDerived(); });
      $('linkSize').addEventListener('change', e => { d.link.size = e.target.value.trim().toLowerCase().replace(/\s/g, ''); renderWork(); });
      if (emb) showFrame({ src: emb.src }, sizeOf(d.link.size));
    } else {
      body.innerHTML = `
        <div class="drop" id="drop">
          <p><b>Add pictures or a video</b> <span class="hint">PNG, JPG, GIF, WebP, MP4</span></p>
          <p><label class="btn btn-ghost">Choose files<input type="file" id="mediaInput" accept="image/*,video/mp4,video/webm" multiple hidden></label></p>
        </div>
        ${d.pictures.length ? `<p class="add-label">Pick the cover</p><div class="add-pics">${d.pictures.map((p, i) => `
          <label class="add-pic${d.mediaCover === p.path ? ' is-cover' : ''}">
            <input type="radio" name="mediaCover" value="${esc(p.path)}"${d.mediaCover === p.path ? ' checked' : ''}>
            ${/\.(mp4|webm|mov)$/i.test(p.path) ? `<video src="${p.url}" muted></video>` : `<img src="${p.url}" alt="">`}
            <span>${esc(p.path)}</span>
            <button type="button" data-unpic="${i}" aria-label="Remove ${esc(p.path)}">×</button></label>`).join('')}</div>` : ''}`;
      $('mediaInput').addEventListener('change', e => { addPictures([...e.target.files]); e.target.value = ''; });
      body.querySelectorAll('input[name=mediaCover]').forEach(r => r.addEventListener('change', e => { d.mediaCover = e.target.value; renderWork(); updateDerived(); }));
      body.querySelectorAll('[data-unpic]').forEach(b => b.addEventListener('click', e => {
        e.preventDefault();
        const [gone] = d.pictures.splice(+b.dataset.unpic, 1);
        if (d.mediaCover === gone.path) d.mediaCover = (d.pictures[0] || {}).path || '';
        renderWork(); updateDerived();
      }));
    }
  }

  async function loadZip(file) {
    if (!/\.zip$/i.test(file.name)) { d.workError = 'That isn\'t a zip. Use File → Download in the p5 editor, or choose the sketch\'s folder.'; return renderWork(); }
    try {
      await script(JSZIP);
      const zip = await JSZip.loadAsync(file);
      const entries = Object.values(zip.files).filter(f => !f.dir && !JUNK.test(f.name));
      const files = await Promise.all(entries.map(async f => ({ path: f.name, bytes: await f.async('uint8array') })));
      useSketch(files, file.name.replace(/\.zip$/i, ''));
    } catch (e) {
      d.workError = 'That zip couldn\'t be opened. Try downloading it again.';
      renderWork();
    }
  }

  async function loadFolder(list) {
    const files = await Promise.all(list.filter(f => !JUNK.test(f.webkitRelativePath))
      .map(async f => ({ path: f.webkitRelativePath, bytes: new Uint8Array(await f.arrayBuffer()) })));
    useSketch(files, (list[0] && list[0].webkitRelativePath.split('/')[0]) || '');
  }

  /* Re-root at the shallowest index.html (a p5 download has one folder inside). */
  function useSketch(files, name) {
    const index = files.filter(f => /(^|\/)index\.html$/i.test(f.path)).sort((a, b) => a.path.split('/').length - b.path.split('/').length)[0];
    if (!index) { d.workError = 'There\'s no index.html in there. Is it a p5 sketch? (Pictures go under "Pictures or video".)'; return renderWork(); }
    const root = index.path.slice(0, index.path.length - 'index.html'.length);
    d.files = files.filter(f => f.path.startsWith(root)).map(f => ({ path: f.path.slice(root.length), bytes: f.bytes }))
      .filter(f => f.path && !f.path.split('/').some(p => p.startsWith('.')));
    const folderName = root.replace(/\/$/, '').split('/').pop();
    d.sketchName = folderName || name;
    d.canvas = canvasOf(d.files);
    d.workError = '';
    if (!d.title.trim() && d.sketchName) {
      d.title = d.sketchName.replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
      $('title').value = d.title;
    }
    renderWork(); renderCover(); updateDerived();
  }

  function canvasOf(files) {
    for (const f of files) {
      if (!/\.js$/i.test(f.path) || /(^|\/)p5[^/]*\.js$/i.test(f.path)) continue;
      const m = text(f.bytes).match(/createCanvas\s*\(\s*(\d+)\s*,\s*(\d+)/);
      if (m) return `${m[1]}x${m[2]}`;
    }
    return '';
  }

  function addPictures(list) {
    for (const f of list) {
      if (!PICTURE.test(f.name) || d.pictures.some(p => p.path === f.name)) continue;
      d.pictures.push({ path: f.name.replace(/[^\w\-. ()]/g, '-'), file: f, url: URL.createObjectURL(f) });
    }
    if (!d.mediaCover && d.pictures[0]) d.mediaCover = d.pictures[0].path;
    renderWork(); updateDerived();
  }

  /* ---------- previews ---------- */
  function showSketchPreview() {
    showFrame({ srcdoc: sketchDocument(d.files) }, sizeOf(d.canvas));
  }

  /* A frame sized to the canvas, scaled to fit the preview box like the site's stage. */
  function showFrame(source, size, box = $('previewBox')) {
    if (!box) return;
    const f = document.createElement('iframe');
    // An uploaded sketch runs walled off, so student code can't reach the dashboard.
    // Links (p5 editor, Scratch…) are other sites already, and need their usual permissions.
    if (source.srcdoc) f.setAttribute('sandbox', 'allow-scripts allow-pointer-lock');
    else f.allowFullscreen = true;
    f.setAttribute('scrolling', 'no');
    f.title = 'Preview';
    if (source.srcdoc) f.srcdoc = source.srcdoc; else f.src = source.src;
    box.replaceChildren(f);
    const fit = () => {
      const w = box.clientWidth, maxH = Math.min(520, window.innerHeight * 0.6);
      if (size) {
        const k = Math.min(w / size[0], maxH / size[1], MAX_ZOOM);
        Object.assign(f.style, { width: size[0] + 'px', height: size[1] + 'px', transform: `scale(${k})` });
        box.style.height = Math.round(size[1] * k) + 'px';
        f.parentElement.style.setProperty('--fw', Math.round(size[0] * k) + 'px');
      } else {
        Object.assign(f.style, { width: '100%', height: '100%', transform: '' });
        box.style.height = Math.round(Math.min(maxH, w / 1.6)) + 'px';
        f.parentElement.style.setProperty('--fw', '100%');
      }
    };
    fit();
    new ResizeObserver(fit).observe(box);
  }

  /* The sketch as one self-contained page: its scripts and styles inlined, and its
     other files (images, sounds, data) answered from memory when the sketch asks
     for them, so it runs here exactly as it will once it's saved. */
  function sketchDocument(files) {
    const byPath = new Map(files.map(f => [f.path.toLowerCase(), f]));
    const local = ref => {
      if (/^(https?:|data:|blob:|\/\/)/i.test(ref)) return null;
      try { return byPath.get(decodeURIComponent(new URL(ref, 'https://x/').pathname.slice(1)).toLowerCase()) || null; }
      catch (e) { return null; }
    };
    let html = text(byPath.get('index.html').bytes);
    html = html.replace(/<script\b([^>]*?)\ssrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (m, a, src, b) => {
      const f = local(src);
      return f ? `<script${a}${b}>${text(f.bytes).replace(/<\/script/gi, '<\\/script')}</script>` : m;
    });
    html = html.replace(/<link\b([^>]*?)\shref\s*=\s*["']([^"']+)["']([^>]*)>/gi, (m, a, href, b) => {
      const f = /stylesheet/i.test(a + b) && local(href);
      return f ? `<style>${text(f.bytes)}</style>` : m;
    });
    const assets = {};
    for (const f of files) if (!/\.(html?|js|css)$/i.test(f.path)) assets[f.path.toLowerCase()] = `data:${mimeOf(f.path)};base64,${base64(f.bytes)}`;
    const shim = `<script>(${assetShim.toString()})(${JSON.stringify(assets)});</script>`;
    return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, h => h + shim) : shim + html;
  }

  /* Runs inside the preview: point the sketch's own file loads at the copies in memory. */
  function assetShim(A) {
    const look = u => {
      try {
        u = typeof u === 'string' ? u : String((u && u.url) || u);
        if (/^(https?:|data:|blob:|\/\/)/i.test(u)) return null;
        return A[decodeURIComponent(new URL(u, 'https://x/').pathname.slice(1)).toLowerCase()] || null;
      } catch (e) { return null; }
    };
    const f0 = window.fetch;
    window.fetch = function (u, o) { return f0.call(this, look(u) || u, o); };
    const x0 = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u, ...r) { return x0.call(this, m, look(u) || u, ...r); };
    [HTMLImageElement, HTMLMediaElement, HTMLSourceElement].forEach(C => {
      const p = Object.getOwnPropertyDescriptor(C.prototype, 'src');
      if (p && p.set) Object.defineProperty(C.prototype, 'src', { ...p, set(v) { p.set.call(this, look(v) || v); } });
    });
  }

  /* p5 editor, Scratch and CodePen links become their embeddable versions. */
  function embedFor(url) {
    let u;
    try { u = new URL(url); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    let m = u.href.match(/^https?:\/\/editor\.p5js\.org\/([^/]+)\/(?:sketches|full|embed)\/([\w-]+)/i);
    if (m) return { src: `https://editor.p5js.org/${m[1]}/full/${m[2]}` };
    m = u.href.match(/scratch\.mit\.edu\/projects\/(\d+)/i);
    if (m) return { src: `https://scratch.mit.edu/projects/${m[1]}/embed` };
    m = u.href.match(/codepen\.io\/([^/]+)\/(?:pen|full|embed)\/(\w+)/i);
    if (m) return { src: `https://codepen.io/${m[1]}/embed/${m[2]}?default-tab=result` };
    const src = u.href.replace(/^http:/i, 'https:');
    if (/(^|\.)itch\.io$/i.test(u.hostname) && !/^\/embed/.test(u.pathname)) {
      return { src, note: 'For itch.io, use the address from the game\'s "Embed game" settings, not its page. Its page won\'t play inside another site.' };
    }
    return { src };
  }

  /* ---------- cover ---------- */
  function renderCover() {
    const body = $('coverBody');
    if (d.kind === 'media' && (!d.edit || d.replacing)) { body.innerHTML = `<p class="hint">Cover: the picture you picked above.</p>`; return; }
    const auto = d.kind === 'sketch', has = d.edit && d.edit.cover;
    if (!auto && d.coverMode === 'auto') d.coverMode = 'upload';
    if (!has && d.coverMode === 'keep') d.coverMode = auto ? 'auto' : 'upload';
    body.innerHTML = `<p class="add-label">Cover <span class="opt">the picture in the rows</span></p>
      ${has ? `<label class="add-check"><input type="radio" name="coverMode" value="keep"${d.coverMode === 'keep' ? ' checked' : ''}>
        Keep this one ${d.currentCoverUrl ? `<img class="add-coverthumb" src="${d.currentCoverUrl}" alt="">` : ''}
        <span class="hint">${esc(d.edit.cover)}</span></label>` : ''}
      ${auto ? `<label class="add-check"><input type="radio" name="coverMode" value="auto"${d.coverMode === 'auto' ? ' checked' : ''}>
        ${has ? 'Remove it: a new screenshot of the sketch is made when it\'s saved' : 'Automatic: a screenshot of the sketch, made when it\'s published'}</label>` : ''}
      <label class="add-check"><input type="radio" name="coverMode" value="upload"${d.coverMode === 'upload' ? ' checked' : ''}>
        ${auto ? 'Upload a picture instead' : 'Upload a picture (recommended: a link can\'t be screenshotted automatically)'}</label>
      ${d.coverMode === 'upload' ? `<p><label class="btn btn-ghost add-small">${d.coverFile ? 'Replace picture' : 'Choose a picture'}
        <input type="file" id="coverInput" accept="image/*,video/mp4" hidden></label>
        ${d.coverFile ? `<img class="add-coverthumb" src="${d.coverFile.url}" alt=""> ${esc(d.coverFile.file.name)}` : ''}</p>` : ''}`;
    body.querySelectorAll('input[name=coverMode]').forEach(r => r.addEventListener('change', e => { d.coverMode = e.target.value; renderCover(); updateDerived(); }));
    const ci = $('coverInput');
    if (ci) ci.addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) { d.coverFile = { file: f, url: URL.createObjectURL(f) }; renderCover(); updateDerived(); }
    });
  }

  /* ---------- derived: folder, preview card, what's missing ---------- */
  function slugify(s, max = 60) {
    return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max).replace(/-+$/, '');
  }
  const assignmentId = () => d.assignment === '__new' ? slugify(d.newAssignment.title, 40) : d.assignment;
  const assignmentTitle = () => d.assignment === '__new' ? d.newAssignment.title.trim()
    : (assignmentsFor(d.course).find(a => a.id === d.assignment) || {}).title || '';
  function autoFolder() {
    const term = ({ spring: 's', summer: 'su', fall: 'f' }[d.semester] || '') + String(d.year || '').slice(-2);
    return slugify([d.students.map(s => slugify(s)).join('-'), assignmentId() || slugify(d.title, 30), term].filter(Boolean).join('-'), 80);
  }

  function updateDerived() {
    if (!d.folderEdited) { d.folder = autoFolder(); if ($('folder')) $('folder').value = d.folder; }
    const dir = [d.course, assignmentId()].filter(Boolean).join('/');
    if ($('folderPath')) $('folderPath').textContent = d.course ? `Saved in the repo at ${dir}/${d.folder || '…'} (a number is added if that's taken)` : '';
    $('blurbCount').textContent = d.blurb ? `${d.blurb.length} / 400` : '';
    renderCard();
    const missing = problems();
    $('missing').innerHTML = missing.map(m => `<li>${esc(m)}</li>`).join('');
    $('publish').disabled = !!missing.length || (d.save && d.save.state === 'saving');
  }

  function problems() {
    const p = [];
    const uploading = !d.edit || d.replacing;      // editing keeps the files unless replaced
    if (!d.course) p.push('Pick a course');
    if (d.assignment === '__new' && !slugify(d.newAssignment.title)) p.push('Name the new assignment');
    if (uploading && d.kind === 'sketch' && !d.files.length) p.push(d.edit ? 'Add the new version of the sketch, or keep the files that are there' : 'Add the sketch');
    if (uploading && d.kind === 'sketch' && totalBytes() > MAX_BYTES) p.push('Make the sketch smaller than 25 MB');
    if (d.kind === 'link' && !embedFor(d.link.url)) p.push('Add the link');
    if (d.kind === 'link' && d.link.size && !/^\d+x\d+$/.test(d.link.size)) p.push('Write the canvas size like 400x400');
    if (uploading && d.kind === 'media' && !d.pictures.length) p.push(d.edit ? 'Add the new pictures, or keep the ones that are there' : 'Add a picture or video');
    if (d.edit && d.edit.cover && d.coverMode === 'upload' && !d.coverFile && !(d.kind === 'media' && d.replacing)) {
      p.push('Choose the new cover picture, or keep the current cover');
    }
    if (!d.title.trim()) p.push('Add a title');
    if (!d.students.length) p.push('Add the student(s)');
    if (d.links.some(l => (l.label || l.url) && (!l.label.trim() || !/^https?:\/\/\S+$/i.test(l.url.trim())))) p.push('Finish or remove the half-filled link');
    if (d.show && !d.consent) p.push('Confirm the students agreed, or untick "Show it on the site"');
    if (d.folderEdited && !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.folder)) p.push('Fix the folder name (lowercase letters, numbers and dashes)');
    return p;
  }

  function renderCard() {
    const cover = d.kind === 'media' && (!d.edit || d.replacing) ? (d.pictures.find(p => p.path === d.mediaCover) || {}).url
      : d.coverMode === 'upload' && d.coverFile ? d.coverFile.url
      : (d.coverMode === 'keep' || d.kind === 'media') && d.currentCoverUrl ? d.currentCoverUrl : '';
    const term = [d.semester ? d.semester[0].toUpperCase() + d.semester.slice(1) : '', d.year].filter(Boolean).join(' ');
    const by = [joinNames(d.students) || 'Student names', assignmentTitle(), term].filter(Boolean).join(' · ');
    const playable = d.kind !== 'media';
    $('cardPreview').innerHTML = `<article class="work-card">
      <div class="work-thumb">${cover ? `<img class="work-media" src="${cover}" alt="">`
        : `<span class="work-media work-media-blank"><span>${esc(d.title || 'Title')}</span></span>`}
        ${playable ? '<span class="play-chip">Play</span>' : ''}</div>
      <div class="work-body"><h5>${esc(d.title || 'Title')}</h5><span class="by">${esc(by)}</span></div>
    </article>
    ${d.kind === 'sketch' && d.coverMode === 'auto' ? '<p class="hint">The screenshot replaces the title once it\'s published.</p>' : ''}`;
  }

  function joinNames(n) {
    return n.length <= 2 ? n.join(' and ') : `${n.slice(0, -1).join(', ')}, and ${n[n.length - 1]}`;
  }

  /* ---------- publishing ---------- */
  async function publish() {
    if (problems().length) return;
    d.save = { state: 'saving' };
    renderSave(); updateDerived();
    try {
      const body = await payload();
      const res = await ctx.api.api(d.edit ? '/project' : '/projects', { method: 'POST', body: JSON.stringify(body) });
      d.save = { state: res.published ? 'publishing' : 'test-branch', res };
      renderSave();
      if (res.published) poll(res, Date.now());
    } catch (e) {
      d.save = { state: 'error', e };
      renderSave(); updateDerived();
    }
  }

  async function payload() {
    if (d.edit) return editPayload();
    const body = {
      course: d.course,
      assignment: d.assignment === '__new' ? { title: d.newAssignment.title.trim(), blurb: d.newAssignment.blurb.trim() }
        : { id: d.assignment },
      kind: d.kind,
      folder: d.folderEdited ? d.folder : '',
      meta: {
        title: d.title.trim(), students: d.students, year: d.year || null, semester: d.semester,
        blurb: d.blurb.trim(), instructions: d.instructions.split('\n').map(s => s.trim()).filter(Boolean),
        links: d.links.filter(l => l.label.trim() || l.url.trim()).map(l => ({ label: l.label.trim(), url: l.url.trim() })),
        show: d.show, consent: d.consent
      },
      files: []
    };
    if (d.kind === 'sketch') body.files = d.files.map(f => ({ path: f.path, data: base64(f.bytes) }));
    if (d.kind === 'link') body.embed = { src: embedFor(d.link.url).src, size: d.link.size };
    if (d.kind === 'media') {
      for (const p of d.pictures) {
        const data = base64(new Uint8Array(await p.file.arrayBuffer()));
        if (p.path === d.mediaCover) body.cover = { name: p.path, data };
        else body.files.push({ path: p.path, data });
      }
    } else if (d.coverMode === 'upload' && d.coverFile) {
      body.cover = { name: d.coverFile.file.name, data: base64(new Uint8Array(await d.coverFile.file.arrayBuffer())) };
    }
    return body;
  }

  /* An edit: the details always; new files, cover or link only when changed. ymlSha
     lets the server refuse the save if someone changed the project meanwhile. */
  async function editPayload() {
    const body = {
      path: d.edit.path, ymlSha: d.edit.ymlSha,
      meta: {
        title: d.title.trim(), students: d.students, year: d.year || null, semester: d.semester,
        blurb: d.blurb.trim(), instructions: d.instructions.split('\n').map(s => s.trim()).filter(Boolean),
        links: d.links.filter(l => l.label.trim() || l.url.trim()).map(l => ({ label: l.label.trim(), url: l.url.trim() })),
        show: d.show, consent: d.consent
      }
    };
    if (d.kind === 'link') body.embed = { src: embedFor(d.link.url).src, size: d.link.size };
    if (d.replacing && d.kind === 'sketch') body.replace = d.files.map(f => ({ path: f.path, data: base64(f.bytes) }));
    if (d.replacing && d.kind === 'media') {
      body.replace = [];
      for (const p of d.pictures) {
        const data = base64(new Uint8Array(await p.file.arrayBuffer()));
        if (p.path === d.mediaCover) body.cover = { name: p.path, data };
        else body.replace.push({ path: p.path, data });
      }
    } else if (d.coverMode === 'upload' && d.coverFile) {
      body.cover = { name: d.coverFile.file.name, data: base64(new Uint8Array(await d.coverFile.file.arrayBuffer())) };
    } else if (d.coverMode === 'auto' && d.edit.cover) {
      body.removeCover = true;
    }
    return body;
  }

  /* After a save on the live branch, the work repo's Action publishes it (about a minute). */
  function poll(res, started) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      try {
        const s = await ctx.api.api('/status?commit=' + res.commit);
        if (s.state === 'live' || s.state === 'failed') { d.save = { state: s.state, res, url: s.url }; renderSave(); return; }
      } catch (e) { /* keep waiting */ }
      if (Date.now() - started < 5 * 60 * 1000) poll(res, started);
      else { d.save = { state: 'slow', res }; renderSave(); }
    }, 6000);
  }

  function renderSave() {
    const s = d.save, box = $('saveStatus');
    if (!s) { box.innerHTML = ''; return; }
    const r = s.res || {};
    const link = r.show && r.path ? `../course.html?c=${encodeURIComponent(d.course)}#${
      assignmentId() ? 'a=' + encodeURIComponent(assignmentId()) + '&' : ''}p=${encodeURIComponent(r.folder)}` : '';
    const after = `<p class="add-after">
      ${d.edit ? '' : `<button type="button" class="btn btn-primary" id="another">Add another to ${esc(assignmentTitle() || courseName(d.course))}</button>`}
      <button type="button" class="btn ${d.edit ? 'btn-primary' : 'btn-ghost'}" id="done">Back to projects</button></p>`;
    box.innerHTML = {
      saving: `<p class="add-saving">Saving to the repo…</p>`,
      'test-branch': `<div class="add-ok"><p><b>Saved to the test branch.</b> It's in <code>${esc(r.path)}</code> on
        <b>${esc(r.branch)}</b>. The site isn't affected.</p>${after}</div>`,
      publishing: `<div class="add-ok"><p class="add-saving"><b>Saved.</b> ${r.show ? 'Publishing to the site' : 'Updating the site\'s list'}… usually about a minute.</p>
        <p class="hint">${esc(r.path)}</p></div>`,
      live: `<div class="add-ok"><p><b>${r.show ? 'Live on the site ✓' : 'Saved, and hidden on the site as you chose ✓'}</b>
        ${link ? `<a href="${link}" target="_blank" rel="noopener">View it ↗</a>` : ''}</p>${after}</div>`,
      failed: `<div class="add-err"><p><b>Saved, but publishing failed.</b> The project is in the repo; the site's update didn't finish.
        ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">See what happened ↗</a>` : ''}</p>${after}</div>`,
      slow: `<div class="add-ok"><p><b>Saved.</b> Publishing is taking longer than usual; check the site in a few minutes.</p>${after}</div>`,
      error: `<div class="add-err"><p><b>Not saved.</b> ${esc((s.e && s.e.message) || 'The server didn\'t answer. Check your connection and try again.')}</p></div>`
    }[s.state];
    const another = $('another'), done = $('done');
    if (another) another.addEventListener('click', () => open(el, { ...ctx, keep: { course: d.course, assignment: d.assignment === '__new' ? assignmentId() : d.assignment, semester: d.semester, year: d.year } }));
    if (done) done.addEventListener('click', () => ctx.onClose(true));
  }

  /* ---------- small helpers ---------- */
  function totalBytes() { return d.files.reduce((n, f) => n + f.bytes.length, 0); }
  const mb = n => n < 1048576 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`;
  const text = bytes => new TextDecoder().decode(bytes);
  const sizeOf = s => { const m = /^(\d+)x(\d+)$/.exec(s || ''); return m ? [+m[1], +m[2]] : null; };
  function base64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function mimeOf(path) {
    const ext = path.split('.').pop().toLowerCase();
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
      mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', mp4: 'video/mp4', json: 'application/json', csv: 'text/csv',
      txt: 'text/plain', ttf: 'font/ttf', otf: 'font/otf', woff: 'font/woff', woff2: 'font/woff2' }[ext] || 'application/octet-stream';
  }
  function script(src) {
    if (window.JSZip) return Promise.resolve();
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = () => rej(new Error('JSZip'));
      document.head.appendChild(s);
    });
  }

  // Shared with "Add several" (batch.js).
  const util = { JSZIP, JUNK, PICTURE, MAX_BYTES, script, sketchDocument, showFrame, canvasOf, sizeOf, tidyName, slugify, joinNames, base64, mb };
  return { open, util };
})();
