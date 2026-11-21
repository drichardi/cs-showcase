/* ============================================================
   Teacher dashboard: adding a class set ("Add several").

   Every student's sketch for one assignment, published together, each as its own
   project. Drop the zips (or a folder of them, like a Google Classroom download);
   every index.html found becomes a row to check: title, students, show or not.
   Each sketch can be previewed before anything is saved.

   Publishing: small text files go along with the save; bigger files (p5.js
   itself, pictures, sounds) are identified by their git id, so the server is
   asked which ones it lacks and only those are uploaded, once each. Twenty copies
   of the same p5.js cost nothing. Then one save adds the whole set.
   ============================================================ */
window.AdminBatch = (function () {
  const esc = window.esc;
  const MAX_ROWS = 40, INLINE_MAX = 64 * 1024;
  let el, ctx, b, U, pollTimer, nextId = 1;

  function fresh(keep = {}) {
    const now = new Date();
    return {
      course: keep.course || '', assignment: keep.assignment || '', newAssignment: { title: '', blurb: '' },
      semester: keep.semester || (now.getMonth() < 6 ? 'spring' : 'fall'), year: keep.year || now.getFullYear(),
      instructions: '', rows: [], skipped: [], loading: false, consent: false, open: null, save: null, rowError: null
    };
  }

  function open(host, context) {
    el = host; ctx = context; U = window.AdminAdd.util;
    clearTimeout(pollTimer);
    b = fresh(context.keep || {});
    render();
    window.AdminDirty = () => b.rows.length > 0 && !(b.save && b.save.res);   // asked before leaving
    el.scrollIntoView({ block: 'start' });
  }

  const courseName = slug => (ctx.courses.find(c => c.slug === slug) || {}).name || slug;
  const assignmentsFor = slug => ctx.data.assignments[slug] || [];
  const assignmentId = () => b.assignment === '__new' ? U.slugify(b.newAssignment.title, 40) : b.assignment;
  const assignmentTitle = () => b.assignment === '__new' ? b.newAssignment.title.trim()
    : (assignmentsFor(b.course).find(a => a.id === b.assignment) || {}).title || '';
  const $ = id => el.querySelector('#' + id);

  /* ---------- page ---------- */
  function render() {
    const testMode = ctx.data.branch && ctx.data.branch !== 'main';
    el.innerHTML = `
      <div class="add-head">
        <button class="btn btn-ghost" id="back">← Projects</button>
        <h2>Add several projects</h2>
      </div>
      <p class="b-intro">For a class set: every student's sketch for one assignment, published together. Each becomes its own project.</p>
      ${testMode ? `<p class="add-test">Test mode: saves go to the <b>${esc(ctx.data.branch)}</b> branch, not the site.</p>` : ''}

      <section class="add-sec">
        <h3><span>1</span> Where they go</h3>
        <div class="add-row">
          <label>Course
            <select id="course"><option value="">Pick a course…</option>${ctx.courses.map(c =>
              `<option value="${esc(c.slug)}"${b.course === c.slug ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          </label>
          <label>Assignment
            <select id="assignment"${b.course ? '' : ' disabled'}>${assignmentOptions()}</select>
          </label>
          <label>Term
            <span class="add-term">
              <select id="semester"><option value="">No term</option>${['spring', 'summer', 'fall'].map(s =>
                `<option value="${s}"${b.semester === s ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select>
              <input id="year" type="number" min="2000" max="2100" value="${esc(b.year)}" aria-label="Year">
            </span>
          </label>
        </div>
        <div id="newAssignment" class="add-row"${b.assignment === '__new' ? '' : ' hidden'}>
          <label>New assignment's name <input id="naTitle" maxlength="60" value="${esc(b.newAssignment.title)}" placeholder="Generative Art"></label>
          <label class="wide">One-line description <span class="opt">optional</span>
            <input id="naBlurb" maxlength="300" value="${esc(b.newAssignment.blurb)}" placeholder="Make a piece of art that changes every time it runs."></label>
        </div>
      </section>

      <section class="add-sec">
        <h3><span>2</span> The sketches</h3>
        <div class="drop" id="drop" tabindex="0">
          <p><b>Drop the students' zips here</b>, or a folder of them</p>
          <p class="hint">A Google Classroom or Drive download works too, zips inside zips and all. Each index.html found becomes one project.</p>
          <p><label class="btn btn-ghost">Choose zips<input type="file" id="zipInput" accept=".zip" multiple hidden></label>
             <label class="btn btn-ghost">Choose a folder<input type="file" id="folderInput" webkitdirectory multiple hidden></label></p>
        </div>
        <div id="rows"></div>
      </section>

      <section class="add-sec">
        <h3><span>3</span> For all of them</h3>
        <label>How to use it <span class="opt">optional, one step per line. Shown as "Try it" beside each project. Each one can be changed later.</span>
          <textarea id="instructions" rows="3" placeholder="Move the mouse to steer&#10;Click to jump">${esc(b.instructions)}</textarea>
        </label>
        <p class="hint">Descriptions and covers can be added to each project afterwards. Covers are made automatically from a screenshot.</p>
      </section>

      <section class="add-sec">
        <h3><span>4</span> Publish</h3>
        <p class="hint" id="showSummary"></p>
        <label class="add-check" id="consentRow" hidden>
          <input type="checkbox" id="consent"${b.consent ? ' checked' : ''}> <span id="consentText"></span></label>
        <div class="add-go">
          <ul id="missing" class="add-missing"></ul>
          <button class="btn btn-primary" id="publish">Publish</button>
        </div>
        <div id="saveStatus" aria-live="polite"></div>
      </section>`;
    bind();
    renderRows();
  }

  function assignmentOptions() {
    if (!b.course) return '<option value="">Pick a course first</option>';
    return `<option value=""${b.assignment === '' ? ' selected' : ''}>No assignment (straight in the course)</option>` +
      assignmentsFor(b.course).map(a => `<option value="${esc(a.id)}"${b.assignment === a.id ? ' selected' : ''}>${esc(a.title)}</option>`).join('') +
      `<option value="__new"${b.assignment === '__new' ? ' selected' : ''}>New assignment…</option>`;
  }

  function bind() {
    $('back').addEventListener('click', () => {
      if (window.AdminDirty() && !confirm('Leave without publishing? The sketches you added here will be cleared.')) return;
      clearTimeout(pollTimer); ctx.onClose(!!(b.save && b.save.res));
    });
    $('course').addEventListener('change', e => {
      b.course = e.target.value; b.assignment = '';
      $('assignment').innerHTML = assignmentOptions(); $('assignment').disabled = !b.course;
      $('newAssignment').hidden = true; updateDerived();
    });
    $('assignment').addEventListener('change', e => { b.assignment = e.target.value; $('newAssignment').hidden = b.assignment !== '__new'; updateDerived(); });
    $('naTitle').addEventListener('input', e => { b.newAssignment.title = e.target.value; updateDerived(); });
    $('naBlurb').addEventListener('input', e => { b.newAssignment.blurb = e.target.value; });
    $('semester').addEventListener('change', e => { b.semester = e.target.value; });
    $('year').addEventListener('input', e => { b.year = Number(e.target.value) || ''; });
    $('instructions').addEventListener('input', e => { b.instructions = e.target.value; });
    $('consent').addEventListener('change', e => { b.consent = e.target.checked; updateDerived(); });
    $('publish').addEventListener('click', publish);

    const drop = $('drop');
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => {
      e.preventDefault(); drop.classList.remove('over');
      // The dropped items must be read now, before the browser clears them.
      const entries = [...e.dataTransfer.items].map(i => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
      const files = [...e.dataTransfer.files];
      load(entries.length ? walkEntries(entries) : Promise.resolve(files.map(f => item(f, f.name))));
    });
    $('zipInput').addEventListener('change', e => { const l = [...e.target.files]; e.target.value = ''; load(Promise.resolve(l.map(f => item(f, f.name)))); });
    $('folderInput').addEventListener('change', e => { const l = [...e.target.files]; e.target.value = ''; load(Promise.resolve(l.map(f => item(f, f.webkitRelativePath || f.name)))); });
  }

  /* ---------- reading what was dropped ---------- */
  // One file to look at: where it sits, and how to read it.
  function item(file, path) {
    return { path, read: () => file.arrayBuffer().then(x => new Uint8Array(x)) };
  }

  async function walkEntries(entries) {
    const out = [];
    const walk = async (entry, path) => {
      if (entry.isFile) {
        out.push(item(await new Promise((res, rej) => entry.file(res, rej)), path));
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        for (let batch; (batch = await new Promise((res, rej) => reader.readEntries(res, rej))).length;) {
          for (const e of batch) await walk(e, `${path}/${e.name}`);
        }
      }
    };
    for (const e of entries) await walk(e, e.name);
    return out;
  }

  // Zips are opened in place (and zips inside them, one level down).
  async function expand(list, depth, failed) {
    const out = [];
    for (const it of list) {
      if (U.JUNK.test(it.path) || it.path.split('/').some(p => p.startsWith('.'))) continue;
      if (/\.zip$/i.test(it.path) && depth < 2) {
        try {
          const zip = await JSZip.loadAsync(await it.read());
          const base = it.path.replace(/\.zip$/i, '');
          const inner = Object.values(zip.files).filter(z => !z.dir)
            .map(z => ({ path: `${base}/${z.name}`, read: () => z.async('uint8array') }));
          out.push(...await expand(inner, depth + 1, failed));
        } catch (e) { failed.push(it.path.split('/').join(' / ')); }
      } else out.push(it);
    }
    return out;
  }

  async function load(gather) {
    b.loading = true; b.loadError = ''; renderRows();
    try {
      await U.script(U.JSZIP);
      const failed = [];
      const all = await expand(await gather, 0, failed);
      // Every index.html is a sketch, unless it sits inside another sketch.
      const roots = all.filter(f => /(^|\/)index\.html$/i.test(f.path)).map(f => f.path.slice(0, -'index.html'.length))
        .sort((x, y) => x.split('/').length - y.split('/').length || x.localeCompare(y))
        .filter((r, i, list) => !list.slice(0, i).some(o => r !== o && r.startsWith(o)));
      const added = [];
      for (const root of roots) {
        if (b.rows.some(r => r.key === root)) continue;          // added already
        const files = [];
        for (const f of all.filter(x => x.path.startsWith(root))) {
          let path = f.path.slice(root.length);
          if (path.toLowerCase() === 'index.html') path = 'index.html';
          files.push({ path, bytes: await f.read() });
        }
        added.push(makeRow(root, files));
      }
      // A parent folder named like a person ("Noa Palakiko") is a student, unless
      // several sketches share it (then it's just the folder they were all in).
      const counts = {};
      added.forEach(r => { if (r.fromParent) counts[r.fromParent] = (counts[r.fromParent] || 0) + 1; });
      added.forEach(r => { if (r.fromParent && counts[r.fromParent] > 1) r.students = []; });
      b.rows.push(...added);
      // Say which folders (or things chosen directly) had no sketch: a student's folder in
      // a Classroom download that holds only a document, say. Loose files that sit
      // beside sketches, like a README, aren't worth mentioning.
      const around = new Set();
      roots.forEach(r => { const p = r.split('/').filter(Boolean); for (let i = 1; i <= p.length; i++) around.add(p.slice(0, i).join('/')); });
      const empty = new Set();
      for (const f of all) {
        if (roots.some(r => f.path.startsWith(r))) continue;
        const p = f.path.split('/');
        let dir = p.length === 1 ? f.path : null;
        for (let i = 1; i < p.length && !dir; i++) if (!around.has(p.slice(0, i).join('/'))) dir = p.slice(0, i).join('/');
        if (dir) empty.add(dir.split('/').join(' / '));
      }
      b.skipped = [...new Set([...b.skipped, ...failed.map(s => `${s} (couldn't be opened)`), ...empty])];
      if (!added.length && !failed.length && !empty.size) b.loadError = 'No new sketches found there (no index.html, or they were already added).';
    } catch (e) {
      b.loadError = 'Those files couldn\'t be read. Try downloading them again.';
    }
    b.loading = false;
    renderRows();
  }

  /* ---------- guessing titles and students from the folder names ---------- */
  const FULL = /^[A-Z][a-z'’-]+(?: [A-Z][a-z'’-]+){1,2}$/;   // Noa Palakiko
  const SHORT = /^[A-Z][a-z'’-]+ [A-Z]\.?$/;                  // Noa P
  const isName = s => FULL.test(s.trim()) || SHORT.test(s.trim());
  const shortName = s => { const w = s.trim().split(/\s+/); return `${w.slice(0, -1).join(' ')} ${w[w.length - 1][0].toUpperCase()}.`; };
  const pretty = s => s.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b\w/g, c => c.toUpperCase());
  const same = s => s.toLowerCase().replace(/\(\d+\)/g, '').replace(/[^a-z0-9]/g, '');

  function makeRow(root, files) {
    const segs = root.split('/').filter(Boolean).filter((s, i, a) => i === 0 || same(s) !== same(a[i - 1]));
    const own = segs[segs.length - 1] || 'Sketch';
    let students = [], title = own, fromParent = '';
    // "Noa Palakiko - Tiling" or "Tiling - Noa P", innermost folder first
    for (let i = segs.length - 1; i >= 0 && !students.length; i--) {
      const parts = segs[i].split(/\s+[-–—]\s+/);
      if (parts.length < 2) continue;
      // "Noa P" is surely a name; two capitalised words might be a title ("Second Try").
      let k = parts.findIndex(p => SHORT.test(p.trim()));
      if (k < 0) k = parts.findIndex(p => FULL.test(p.trim()));
      if (k < 0) continue;
      students = [shortName(parts[k])];
      if (i === segs.length - 1) title = parts.filter((_, j) => j !== k).join(' ');
    }
    // "Tiling_Noa_P"
    if (!students.length) {
      const m = pretty(own).match(/^(.+) ([A-Z][a-z'’-]+ [A-Z])$/);
      if (m) { students = [shortName(m[2])]; title = m[1]; }
    }
    // a parent folder named for the student
    if (!students.length) {
      for (let i = segs.length - 2; i >= 0; i--) if (isName(segs[i])) { students = [shortName(segs[i])]; fromParent = segs[i]; break; }
    }
    return {
      id: nextId++, key: root, label: segs.join(' / ') || 'Sketch', files, title: pretty(title) || 'Untitled', students, fromParent,
      show: false, canvas: U.canvasOf(files), bytes: files.reduce((n, f) => n + f.bytes.length, 0),
      // the same rule the server uses for names in the repo
      badNames: files.map(f => f.path).filter(p => p.split('/').length > 6 || p.split('/').some(s => !/^[\w\-. ()+@,]+$/.test(s)))
    };
  }

  /* ---------- the rows ---------- */
  function renderRows() {
    const box = $('rows');
    const n = b.rows.length;
    box.innerHTML = `
      ${b.loading ? '<p class="add-saving b-loading">Opening the files…</p>' : ''}
      ${b.loadError ? `<p class="add-err">${esc(b.loadError)}</p>` : ''}
      ${n ? `<div class="b-head">
          <p><b>${n} sketch${n === 1 ? '' : 'es'}</b> <span class="hint">Check each title and the students' names (first name and last initial).</span></p>
          <label class="add-check b-showall"><input type="checkbox" id="showAll"${b.rows.every(r => r.show) ? ' checked' : ''}> Show all on the site</label>
        </div>
        <div class="b-rows">${b.rows.map(rowHtml).join('')}</div>
        <p><button type="button" class="btn btn-ghost add-small" id="clearAll">Remove all</button></p>` : ''}
      ${b.skipped.length ? `<details class="b-skipped"><summary>${b.skipped.length} item${b.skipped.length === 1 ? '' : 's'} had no sketch in ${b.skipped.length === 1 ? 'it' : 'them'}</summary>
        <ul>${b.skipped.map(s => `<li>${esc(s)}</li>`).join('')}</ul>
        <p class="hint">A sketch needs an index.html. A student who sent something else can be added later with "Add project".</p></details>` : ''}`;
    box.querySelectorAll('.b-row').forEach(bindRow);
    const all = $('showAll');
    if (all) all.addEventListener('change', e => {
      b.rows.forEach(r => { r.show = e.target.checked; });
      box.querySelectorAll('[data-f=show]').forEach(c => { c.checked = e.target.checked; });
      updateDerived();
    });
    const clear = $('clearAll');
    if (clear) clear.addEventListener('click', () => { if (confirm('Remove all the sketches from this list?')) { b.rows = []; b.skipped = []; b.open = null; renderRows(); } });
    if (b.open) showPreview(b.open);
    updateDerived();
  }

  function rowHtml(r, i) {
    return `<div class="b-row${b.rowError && b.rowError.row === i ? ' b-bad' : ''}" data-id="${r.id}">
      <span class="b-num">${i + 1}</span>
      <label><span class="b-lab">Title</span> <input data-f="title" maxlength="100" value="${esc(r.title)}"></label>
      <label><span class="b-lab">Students</span> <input data-f="students" value="${esc(r.students.join(', '))}" placeholder="Noa P., Kai L."></label>
      <label class="add-check b-show"><input type="checkbox" data-f="show"${r.show ? ' checked' : ''}> Show</label>
      <button type="button" class="btn btn-ghost add-small b-x" data-act="remove" aria-label="Remove ${esc(r.title)}">×</button>
      <p class="b-meta"><button type="button" class="btn btn-ghost add-small" data-act="preview" aria-expanded="${b.open === r.id}">${b.open === r.id ? 'Close preview' : '▶ Preview'}</button>
        <span>${esc(r.label)} · ${r.files.length} file${r.files.length === 1 ? '' : 's'} · ${U.mb(r.bytes)}${r.canvas ? ` · canvas ${esc(r.canvas)}` : ''}</span></p>
      ${r.bytes > U.MAX_BYTES ? '<p class="add-err b-wide">Over the 25 MB limit for one project. Remove it, and add it as a Link from itch.io instead.</p>' : ''}
      ${r.badNames.length ? `<p class="add-err b-wide">${r.badNames.map(esc).join(', ')} ${r.badNames.length === 1 ? 'has' : 'have'} characters a file name can't use here
        (letters, numbers, spaces and - _ . ( ) are fine). Rename ${r.badNames.length === 1 ? 'it' : 'them'} in the sketch, download it again, and remove and re-add this one.</p>` : ''}
      ${b.rowError && b.rowError.row === i ? `<p class="add-err b-wide">${esc(b.rowError.message)}</p>` : ''}
      <p class="hint b-wide b-namehint"></p>
      <div class="b-preview b-wide"${b.open === r.id ? '' : ' hidden'}><div class="add-stage"></div></div>
    </div>`;
  }

  const rowOf = node => b.rows.find(r => r.id === +node.closest('.b-row').dataset.id);
  function bindRow(node) {
    const r = rowOf(node);
    node.querySelector('[data-f=title]').addEventListener('input', e => { r.title = e.target.value; updateDerived(); });
    const st = node.querySelector('[data-f=students]');
    st.addEventListener('input', e => { r.students = splitStudents(e.target.value); updateDerived(); });
    st.addEventListener('blur', () => { r.students = splitStudents(st.value).map(U.tidyName); st.value = r.students.join(', '); updateDerived(); });
    node.querySelector('[data-f=show]').addEventListener('change', e => {
      r.show = e.target.checked;
      const all = $('showAll'); if (all) all.checked = b.rows.every(x => x.show);
      updateDerived();
    });
    node.querySelector('[data-act=remove]').addEventListener('click', () => {
      b.rows = b.rows.filter(x => x !== r);
      if (b.open === r.id) b.open = null;
      b.rowError = null;
      renderRows();
    });
    node.querySelector('[data-act=preview]').addEventListener('click', () => {
      const was = b.open;
      b.open = was === r.id ? null : r.id;
      el.querySelectorAll('.b-row').forEach(n => {
        const id = +n.dataset.id, isOpen = id === b.open;
        const btn = n.querySelector('[data-act=preview]');
        btn.textContent = isOpen ? 'Close preview' : '▶ Preview';
        btn.setAttribute('aria-expanded', isOpen);
        const p = n.querySelector('.b-preview');
        p.hidden = !isOpen;
        if (!isOpen) p.firstElementChild.replaceChildren();   // stop sketches that aren't shown
      });
      if (b.open) showPreview(b.open);
    });
  }

  function showPreview(id) {
    const r = b.rows.find(x => x.id === id), node = el.querySelector(`.b-row[data-id="${id}"]`);
    if (!r || !node) return;
    U.showFrame({ srcdoc: U.sketchDocument(r.files) }, U.sizeOf(r.canvas), node.querySelector('.b-preview .add-stage'));
  }

  const splitStudents = v => v.split(/,|&|\band\b/).map(s => s.trim()).filter(Boolean).slice(0, 8);

  /* ---------- what's missing ---------- */
  function problems() {
    const p = [];
    if (!b.course) p.push('Pick a course');
    if (b.assignment === '__new' && !U.slugify(b.newAssignment.title)) p.push('Name the new assignment');
    if (!b.rows.length) p.push('Add the sketches');
    if (b.rows.length > MAX_ROWS) p.push(`Publish up to ${MAX_ROWS} at a time (remove ${b.rows.length - MAX_ROWS})`);
    const rowIssues = [];
    b.rows.forEach((r, i) => {
      if (!r.title.trim()) rowIssues.push(`Sketch ${i + 1}: add a title`);
      if (!r.students.length) rowIssues.push(`Sketch ${i + 1}: add the student(s)`);
      if (r.bytes > U.MAX_BYTES) rowIssues.push(`Sketch ${i + 1}: too big (over 25 MB)`);
      if (r.badNames.length) rowIssues.push(`Sketch ${i + 1}: rename or remove ${r.badNames[0]}`);
    });
    p.push(...rowIssues.slice(0, 6));
    if (rowIssues.length > 6) p.push(`and ${rowIssues.length - 6} more like these`);
    if (b.rows.some(r => r.show) && !b.consent) p.push('Confirm the students agreed, or untick Show');
    return p;
  }

  function updateDerived() {
    const shown = b.rows.filter(r => r.show).length, n = b.rows.length;
    $('showSummary').textContent = !n ? '' : shown === n ? `All ${n} will be shown on the site.`
      : shown ? `${shown} of ${n} will be shown on the site; the other ${n - shown} are saved but stay hidden.`
      : `All ${n} will be saved but stay hidden. Tick "Show" on the ones to put on the site.`;
    $('consentRow').hidden = !shown;
    $('consentText').textContent = `The students of the ${shown === 1 ? 'project' : `${shown} projects`} marked Show agreed to have ${shown === 1 ? 'it' : 'them'} shown publicly`;
    // Names should be first name and last initial; flag anything that looks like a full name.
    el.querySelectorAll('.b-row').forEach(node => {
      const r = rowOf(node), odd = r.students.filter(s => !/^\S+( \S+)? [A-Z]\.?$/.test(s));
      node.querySelector('.b-namehint').textContent = odd.length ? `Usually first name and last initial: check ${odd.join(', ')}.` : '';
    });
    const missing = problems();
    $('missing').innerHTML = missing.map(m => `<li>${esc(m)}</li>`).join('');
    const busy = b.save && ['preparing', 'uploading', 'saving'].includes(b.save.state);
    const done = b.save && b.save.res;
    $('publish').textContent = n ? `Publish ${n} project${n === 1 ? '' : 's'}` : 'Publish';
    $('publish').disabled = !!missing.length || busy || !!done || b.loading;
  }

  /* ---------- publishing ---------- */
  async function gitSha(bytes) {
    const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
    const all = new Uint8Array(head.length + bytes.length);
    all.set(head); all.set(bytes, head.length);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-1', all))].map(x => x.toString(16).padStart(2, '0')).join('');
  }
  const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  function inlineText(f) {
    if (f.bytes.length > INLINE_MAX || U.PICTURE.test(f.path)) return null;
    try { return utf8.decode(f.bytes); } catch (e) { return null; }
  }

  async function publish() {
    if (problems().length) return;
    const api = (path, o) => ctx.api.api(path, o);
    b.rowError = null;
    b.save = { state: 'preparing' }; renderSave(); updateDerived();
    try {
      const need = new Map(), projects = [];
      for (const r of b.rows) {
        const files = [];
        for (const f of r.files) {
          const text = inlineText(f);
          if (text !== null) { files.push({ path: f.path, content: text }); continue; }
          f.sha = f.sha || await gitSha(f.bytes);
          need.set(f.sha, f.bytes);
          files.push({ path: f.path, sha: f.sha });
        }
        projects.push({ title: r.title.trim(), students: r.students.map(U.tidyName), show: r.show, files });
      }

      // Which bigger files does the repo lack? Upload just those, a couple at a time.
      const shas = [...need.keys()], missing = [];
      for (let i = 0; i < shas.length; i += 1000) {
        missing.push(...(await api('/blobs/check', { method: 'POST', body: JSON.stringify({ shas: shas.slice(i, i + 1000) }) })).missing);
      }
      const total = missing.reduce((n, s) => n + need.get(s).length, 0);
      b.save = { state: 'uploading', done: 0, count: missing.length, sent: 0, total, reused: shas.length - missing.length };
      renderSave();
      const queue = missing.slice();
      const worker = async () => {
        for (let sha; (sha = queue.shift());) {
          const bytes = need.get(sha);
          await retry(() => api('/blobs?sha=' + sha, { method: 'POST', body: U.base64(bytes) }));
          b.save.done++; b.save.sent += bytes.length; renderSave();
        }
      };
      await Promise.all([worker(), worker()]);

      b.save = { state: 'saving' }; renderSave();
      const body = {
        course: b.course,
        assignment: b.assignment === '__new' ? { title: b.newAssignment.title.trim(), blurb: b.newAssignment.blurb.trim() } : { id: b.assignment },
        semester: b.semester, year: b.year || null,
        instructions: b.instructions.split('\n').map(s => s.trim()).filter(Boolean),
        consent: b.consent, projects
      };
      const res = await api('/projects/batch', { method: 'POST', body: JSON.stringify(body) });
      b.save = { state: res.published ? 'publishing' : 'test-branch', res };
      renderSave(); updateDerived();
      if (res.published) poll(res, Date.now());
    } catch (e) {
      if (e && typeof e.row === 'number') { b.rowError = { row: e.row, message: e.message }; renderRows(); }
      b.save = { state: 'error', e };
      renderSave(); updateDerived();
    }
  }

  // GitHub sometimes asks for a pause when many files arrive at once.
  async function retry(fn) {
    for (const wait of [3000, 15000, 0]) {
      try { return await fn(); } catch (e) {
        if (!wait || (e && e.status && e.status < 500)) throw e;
        await new Promise(r => setTimeout(r, wait));
      }
    }
  }

  function poll(res, started) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      try {
        const s = await ctx.api.api('/status?commit=' + res.commit);
        if (s.state === 'live' || s.state === 'failed') { b.save = { state: s.state, res, url: s.url }; renderSave(); return; }
      } catch (e) { /* keep waiting */ }
      if (Date.now() - started < 5 * 60 * 1000) poll(res, started);
      else { b.save = { state: 'slow', res }; renderSave(); }
    }, 6000);
  }

  function renderSave() {
    const s = b.save, box = $('saveStatus');
    if (!s) { box.innerHTML = ''; return; }
    const r = s.res || {}, n = (r.projects || []).length, shown = (r.projects || []).filter(p => p.show).length;
    const link = shown ? `../course.html?c=${encodeURIComponent(b.course)}${assignmentId() ? '#a=' + encodeURIComponent(assignmentId()) : ''}` : '';
    const after = `<p class="add-after">
      <button type="button" class="btn btn-primary" id="done">Back to projects</button>
      <button type="button" class="btn btn-ghost" id="another">Add another set</button></p>`;
    const list = n ? `<p class="hint">${n} project${n === 1 ? '' : 's'} in <code>${esc(r.dir)}</code>: ${shown} shown, ${n - shown} hidden.</p>` : '';
    box.innerHTML = {
      preparing: '<p class="add-saving">Getting the files ready…</p>',
      uploading: `<p class="add-saving">Uploading files: ${s.done} of ${s.count}${s.total ? ` (${U.mb(s.sent)} of ${U.mb(s.total)})` : ''}</p>
        ${s.reused ? `<p class="hint">${s.reused} file${s.reused === 1 ? ' is' : 's are'} already in the repo (like p5.js), so ${s.reused === 1 ? 'it isn\'t' : 'they aren\'t'} sent again.</p>` : ''}`,
      saving: `<p class="add-saving">Saving ${b.rows.length} projects to the repo…</p>`,
      'test-branch': `<div class="add-ok"><p><b>Saved to the test branch.</b> They're on <b>${esc(r.branch)}</b>. The site isn't affected.</p>${list}${after}</div>`,
      publishing: `<div class="add-ok"><p class="add-saving"><b>Saved.</b> Publishing to the site… usually a minute or two, while covers are made.</p>${list}</div>`,
      live: `<div class="add-ok"><p><b>${shown ? 'Live on the site ✓' : 'Saved, and hidden on the site as you chose ✓'}</b>
        ${link ? `<a href="${link}" target="_blank" rel="noopener">View them ↗</a>` : ''}</p>${list}${after}</div>`,
      failed: `<div class="add-err"><p><b>Saved, but publishing failed.</b> The projects are in the repo; the site's update didn't finish.
        ${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">See what happened ↗</a>` : ''}</p>${list}${after}</div>`,
      slow: `<div class="add-ok"><p><b>Saved.</b> Publishing is taking longer than usual; check the site in a few minutes.</p>${list}${after}</div>`,
      error: `<div class="add-err"><p><b>Not saved.</b> ${esc((s.e && s.e.message) || 'The server didn\'t answer. Check your connection and try again.')}</p>
        <p class="hint">Nothing was added. Publishing again only sends files that haven't reached the repo yet.</p></div>`
    }[s.state];
    const another = $('another'), done = $('done');
    if (done) done.addEventListener('click', () => { clearTimeout(pollTimer); ctx.onClose(true); });
    if (another) another.addEventListener('click', () => {
      clearTimeout(pollTimer);
      if (b.assignment === '__new') {          // so the new assignment is in the list straight away
        const list = ctx.data.assignments[b.course] = ctx.data.assignments[b.course] || [];
        if (!list.some(a => a.id === assignmentId())) list.push({ id: assignmentId(), title: assignmentTitle() });
      }
      open(el, { ...ctx, keep: { course: b.course, assignment: assignmentId(), semester: b.semester, year: b.year } });
    });
  }

  return { open };
})();
