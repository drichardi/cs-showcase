/* ============================================================
   Course editor — a form over data/courses.json so the catalog
   can be maintained without hand-editing JSON.
   ============================================================ */
(async function () {
  let data;
  const $ = s => document.querySelector(s);
  const slugify = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  try { data = await (await fetch('data/courses.json', { cache: 'no-cache' })).json(); }
  catch (e) { data = { meta: { distinctionSemesters: 7 }, lines: [], courses: [], skills: {}, presets: [] }; }

  const PRQ_TYPES = [
    ['anyOf', 'Any one of these courses'],
    ['allOf', 'All of these courses'],
    ['programmingSemesters', 'N semesters of programming'],
    ['csSemesters', 'N semesters of any CS course']
  ];

  /* ---------- render ---------- */
  function render() {
    const host = $('#courses');
    const open = new Set([...host.querySelectorAll('details[open]')].map(d => d.dataset.slug));
    host.innerHTML = '';

    data.courses.forEach((c, i) => {
      const col = (data.lines.find(l => l.id === c.line) || {}).color || '#789';
      const d = document.createElement('details');
      d.className = 'card';
      d.dataset.slug = c.slug;
      if (open.has(c.slug)) d.open = true;

      d.innerHTML = `
        <summary><span class="sw" style="background:${col}"></span>${esc(c.name || '(untitled)')}
          <span class="sl">${esc(c.slug)}</span></summary>
        <div class="inner">
          <div class="row">
            <div class="f"><label>Course name</label><input type="text" data-k="name" value="${esc(c.name)}"></div>
            <div class="f"><label>Short name</label><input type="text" data-k="short" value="${esc(c.short || '')}">
              <div class="hint">Used in prerequisite messages</div></div>
          </div>

          <div class="f"><label>Folder slug</label><input type="text" data-k="slug" value="${esc(c.slug)}">
            <div class="hint">Must match the folder name in the student-work repo</div></div>

          <div class="row">
            <div class="f"><label>Line</label><select data-k="line">${
              data.lines.map(l => `<option value="${l.id}" ${l.id === c.line ? 'selected' : ''}>${esc(l.label)}</option>`).join('')
            }</select></div>
            <div class="f"><label>Length</label><select data-k="semesters">
              <option value="1" ${c.semesters === 1 ? 'selected' : ''}>1 semester</option>
              <option value="2" ${c.semesters === 2 ? 'selected' : ''}>Full year</option>
            </select></div>
          </div>

          <div class="f"><label>Flags</label><div class="checks">
            <label><input type="checkbox" data-k="recommended" ${c.recommended ? 'checked' : ''}> Recommended</label>
            <label><input type="checkbox" data-k="isNew" ${c.isNew ? 'checked' : ''}> New</label>
            <label><input type="checkbox" data-k="countsAsProgramming" ${c.countsAsProgramming ? 'checked' : ''}> Counts as programming</label>
          </div></div>

          <div class="f"><label>Subtitle</label><input type="text" data-k="subtitle" value="${esc(c.subtitle || '')}">
            <div class="hint">Optional, e.g. "Built in Unity with C#"</div></div>

          <div class="f"><label>Tagline</label><input type="text" data-k="tagline" value="${esc(c.tagline || '')}">
            <div class="hint">One line, shown on the map card</div></div>

          <div class="f"><label>Highlights</label>
            <textarea data-k="highlights">${esc((c.highlights || []).join('\n'))}</textarea>
            <div class="hint">One bullet per line</div></div>

          <div class="f"><label>About</label><textarea data-k="about">${esc(c.about || '')}</textarea></div>

          <div class="f"><label>Note / callout</label><textarea data-k="note" style="min-height:56px">${esc(c.note || '')}</textarea>
            <div class="hint">Optional. Leave blank for none.</div></div>

          <div class="row">
            <div class="f"><label>Student quote</label><input type="text" data-k="quoteText" value="${esc((c.quote||{}).text || '')}">
              <div class="hint">One sentence in a student's own words. Get permission before publishing.</div></div>
            <div class="f"><label>Attributed to</label><input type="text" data-k="quoteBy" value="${esc((c.quote||{}).by || '')}">
              <div class="hint">First name, last initial, class year</div></div>
          </div>
          <div class="f"><div class="checks"><label>
            <input type="checkbox" data-k="quotePlaceholder" ${(c.quote||{}).placeholder ? 'checked' : ''}>
            This is placeholder text, not a real student quote</label></div></div>

          <div class="f"><label>Tags</label><input type="text" data-k="skills" value="${esc((c.skills || []).join(', '))}">
            <div class="hint">Comma separated. Existing: ${Object.keys(data.skills).slice(0, 10).map(esc).join(', ')}…</div></div>

          <div class="f"><label>Prerequisite text (what students read)</label>
            <input type="text" data-k="prereqText" value="${esc(c.prereqText || '')}"></div>

          <div class="f"><label>Prerequisite rules (what the planner enforces)</label>
            <div data-prq>${(c.prereqs || []).map((p, pi) => prqRow(c, p, pi)).join('')}</div>
            <button class="mini" data-addprq="${i}">+ Add rule</button>
          </div>

          <div style="display:flex;gap:8px;margin-top:18px;padding-top:14px;border-top:1px solid var(--hair)">
            <button class="mini" data-dup="${i}">Duplicate</button>
            <button class="mini" data-up="${i}">Move up</button>
            <button class="mini danger" data-del="${i}">Delete course</button>
          </div>
        </div>`;
      host.appendChild(d);
    });

    bind();
    preview();
  }

  function prqRow(c, p, pi) {
    const type = Object.keys(p)[0];
    const isList = type === 'anyOf' || type === 'allOf';
    return `<div class="prq" data-pi="${pi}">
      <div class="top">
        <select data-prqtype>${PRQ_TYPES.map(([v, l]) =>
          `<option value="${v}" ${v === type ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="mini danger" data-delprq="${pi}">Remove</button>
      </div>
      ${isList
        ? `<div class="checks">${data.courses.filter(x => x.slug !== c.slug).map(x =>
            `<label><input type="checkbox" data-prqc="${x.slug}" ${(p[type] || []).includes(x.slug) ? 'checked' : ''}> ${esc(x.short || x.name)}</label>`).join('')}</div>`
        : `<input type="number" min="1" max="8" data-prqn value="${p[type] || 1}" style="width:90px">`}
    </div>`;
  }

  /* ---------- read the form back into data ---------- */
  function collect() {
    document.querySelectorAll('#courses details').forEach((d, i) => {
      const c = data.courses[i]; if (!c) return;
      d.querySelectorAll('[data-k]').forEach(el => {
        const k = el.dataset.k;
        let v = el.type === 'checkbox' ? el.checked : el.value;
        if (k === 'semesters') v = +v;
        if (k === 'highlights') v = el.value.split('\n').map(s => s.trim()).filter(Boolean);
        if (k === 'skills') v = el.value.split(',').map(s => slugify(s)).filter(Boolean);
        if (k === 'slug') v = slugify(v);
        if ((k === 'subtitle' || k === 'note') && !String(v).trim()) { delete c[k]; return; }
        if ((k === 'recommended' || k === 'isNew') && v === false) { delete c[k]; return; }
        c[k] = v;
      });

      const qt = d.querySelector('[data-k="quoteText"]');
      if (qt) {
        const txt = qt.value.trim();
        if (txt) {
          c.quote = { text: txt,
                      by: d.querySelector('[data-k="quoteBy"]').value.trim(),
                      placeholder: d.querySelector('[data-k="quotePlaceholder"]').checked };
        } else { delete c.quote; }
      }
      ['quoteText','quoteBy','quotePlaceholder'].forEach(k => delete c[k]);

      const rules = [];
      d.querySelectorAll('[data-prq] .prq').forEach(box => {
        const type = box.querySelector('[data-prqtype]').value;
        if (type === 'anyOf' || type === 'allOf') {
          const list = [...box.querySelectorAll('[data-prqc]')].filter(x => x.checked).map(x => x.dataset.prqc);
          if (list.length) rules.push({ [type]: list });
        } else {
          const n = +box.querySelector('[data-prqn]').value || 1;
          rules.push({ [type]: n });
        }
      });
      c.prereqs = rules;

      (c.skills || []).forEach(k => { if (!data.skills[k]) data.skills[k] = k.replace(/-/g, ' ').replace(/^./, m => m.toUpperCase()); });
    });
  }

  /* ---------- validation ---------- */
  function validate() {
    const out = [];
    const slugs = data.courses.map(c => c.slug);
    slugs.forEach((s, i) => { if (slugs.indexOf(s) !== i) out.push(`Duplicate slug: ${s}`); });
    data.courses.forEach(c => {
      if (!c.name) out.push('A course has no name');
      if (!c.tagline) out.push(`${c.name || c.slug}: no tagline (the map card will look empty)`);
      if (!(c.highlights || []).length) out.push(`${c.name || c.slug}: no highlights`);
      if (c.quote && c.quote.placeholder) out.push(`${c.name || c.slug}: quote is still placeholder text`);
      (c.prereqs || []).forEach(p => {
        ['anyOf', 'allOf'].forEach(k => (p[k] || []).forEach(ref => {
          if (!slugs.includes(ref)) out.push(`${c.name}: prerequisite points at missing course "${ref}"`);
        }));
      });
    });
    return out;
  }

  function preview() {
    const issues = validate();
    $('#issues').innerHTML = issues.length
      ? `<div class="warnbox"><b>${issues.length} thing${issues.length === 1 ? '' : 's'} to check</b><br>${issues.map(esc).join('<br>')}</div>`
      : `<div class="warnbox" style="border-left-color:var(--cyb);background:color-mix(in srgb,var(--cyb) 10%,transparent)"><span class="ok">Looks valid.</span> ${data.courses.length} courses.</div>`;
    $('#preview').textContent = JSON.stringify(data, null, 2);
  }

  /* ---------- wiring ---------- */
  function bind() {
    document.querySelectorAll('#courses input,#courses textarea,#courses select').forEach(el => {
      el.addEventListener('input', () => { collect(); preview(); });
      el.addEventListener('change', () => { collect(); preview(); });
    });
    document.querySelectorAll('[data-prqtype]').forEach(el =>
      el.addEventListener('change', () => { collect(); render(); }));
  }

  document.addEventListener('click', e => {
    const t = e.target;
    if (t.dataset.addprq) {
      collect(); data.courses[+t.dataset.addprq].prereqs.push({ anyOf: [] }); render();
    } else if (t.dataset.delprq) {
      collect();
      const i = [...document.querySelectorAll('#courses details')].indexOf(t.closest('details'));
      data.courses[i].prereqs.splice(+t.dataset.delprq, 1); render();
    } else if (t.dataset.del) {
      collect();
      if (confirm('Delete "' + data.courses[+t.dataset.del].name + '"?')) { data.courses.splice(+t.dataset.del, 1); render(); }
    } else if (t.dataset.dup) {
      collect();
      const c = JSON.parse(JSON.stringify(data.courses[+t.dataset.dup]));
      c.slug += '-copy'; c.name += ' (copy)';
      data.courses.splice(+t.dataset.dup + 1, 0, c); render();
    } else if (t.dataset.up) {
      collect();
      const i = +t.dataset.up;
      if (i > 0) { const [c] = data.courses.splice(i, 1); data.courses.splice(i - 1, 0, c); render(); }
    }
  });

  $('#addCourse').addEventListener('click', () => {
    collect();
    data.courses.push({
      slug: 'new-course', name: 'New Course', short: 'New', line: (data.lines[0] || {}).id || 'tier1',
      semesters: 1, countsAsProgramming: true, tagline: '', about: '',
      highlights: [], prereqText: 'None', prereqs: [], skills: []
    });
    render();
    document.querySelector('#courses details:last-child').open = true;
  });

  $('#expandAll').addEventListener('click', () => document.querySelectorAll('#courses details').forEach(d => d.open = true));
  $('#collapseAll').addEventListener('click', () => document.querySelectorAll('#courses details').forEach(d => d.open = false));

  $('#loadFile').addEventListener('click', () => $('#fileIn').click());
  $('#fileIn').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    try { data = JSON.parse(await f.text()); render(); }
    catch (err) { alert('That file is not valid JSON.'); }
  });

  $('#dl').addEventListener('click', () => {
    collect();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'courses.json'; a.click();
    URL.revokeObjectURL(a.href);
  });

  $('#copy').addEventListener('click', async e => {
    collect();
    try { await navigator.clipboard.writeText(JSON.stringify(data, null, 2)); e.target.textContent = 'Copied ✓'; }
    catch (err) { e.target.textContent = 'Select the JSON and copy'; }
    setTimeout(() => { e.target.textContent = 'Copy'; }, 2000);
  });

  render();
})();
