/* ============================================================
   Route builder. 8 slots (grades 9–12 × fall/spring).
   Yearlong courses occupy both slots of their grade year.
   Validation, semester count, skill coverage, shareable URL.
   ============================================================ */
window.Planner = (function () {
  let data, plan = {};               // slotIndex -> slug  (yearlong recorded on the fall slot)
  const GRADES = [9, 10, 11, 12];
  const esc = window.esc;

  const course = slug => data.courses.find(c => c.slug === slug);
  const line = id => (data.lines.find(l => l.id === id) || {}).color || '#789';

  /* ---------- plan helpers ---------- */
  function occupied() {                       // slotIndex -> {slug, isSpan}
    const map = {};
    Object.entries(plan).forEach(([i, slug]) => {
      const idx = +i, c = course(slug);
      if (!c) return;
      map[idx] = { slug, isSpan: false };
      if (c.semesters === 2) map[idx + 1] = { slug, isSpan: true };
    });
    return map;
  }

  function placedBefore(idx) {                // slugs completed strictly before slot idx
    return Object.entries(plan)
      .filter(([i, slug]) => {
        const c = course(slug);
        const end = +i + (c && c.semesters === 2 ? 1 : 0);
        return end < idx;
      })
      .map(([, slug]) => slug);
  }

  function csSemesters(slugs) {
    return slugs.reduce((n, s) => { const c = course(s); return n + (c ? c.semesters : 0); }, 0);
  }

  function programmingSemesters(slugs) {
    return slugs.reduce((n, s) => {
      const c = course(s);
      return n + (c && c.countsAsProgramming ? c.semesters : 0);
    }, 0);
  }

  function eligibility(slug, idx) {
    const c = course(slug);
    if (!c) return { ok: false, why: '' };
    if (Object.values(plan).includes(slug)) return { ok: false, why: 'Already in your plan' };
    const done = placedBefore(idx);
    for (const p of c.prereqs) {
      if (p.anyOf && !p.anyOf.some(s => done.includes(s))) {
        return { ok: false, why: 'Needs ' + p.anyOf.map(s => course(s).short).join(' or ') + ' first' };
      }
      if (p.allOf && !p.allOf.every(s => done.includes(s))) {
        return { ok: false, why: 'Needs ' + p.allOf.map(s => course(s).short).join(' and ') + ' first' };
      }
      if (p.programmingSemesters) {
        const have = programmingSemesters(done);
        if (have < p.programmingSemesters) {
          return { ok: false, why: `Needs ${p.programmingSemesters} semesters of programming (you'd have ${have})` };
        }
      }
      if (p.csSemesters) {
        const have = csSemesters(done);
        if (have < p.csSemesters) {
          return { ok: false, why: `Needs ${p.csSemesters} semester${p.csSemesters === 1 ? '' : 's'} of CS coursework first` };
        }
      }
    }
    if (c.semesters === 2) {
      if (idx % 2 !== 0) return { ok: false, why: 'Full-year course — start it in the fall' };
      if (occupied()[idx + 1]) return { ok: false, why: 'Spring of that year is taken' };
    }
    return { ok: true, why: '' };
  }

  /* ---------- rendering ---------- */
  function renderGrid() {
    const host = document.getElementById('grid');
    const occ = occupied();
    host.innerHTML = '';

    GRADES.forEach((g, gi) => {
      const row = document.createElement('div');
      row.className = 'year-row';
      row.innerHTML = `<span class="year-tag">Grade ${g}</span>`;

      [0, 1].forEach(half => {
        const idx = gi * 2 + half;
        const cell = occ[idx];
        const btn = document.createElement('button');
        btn.className = 'slot';
        btn.dataset.idx = idx;

        if (cell) {
          const c = course(cell.slug);
          btn.classList.add('filled');
          if (cell.isSpan) btn.classList.add('span');
          btn.style.setProperty('--c', line(c.line));
          btn.innerHTML = cell.isSpan
            ? `<span class="sm">${esc(c.short)} continues</span>`
            : `<span class="nm">${esc(c.name)}</span><span class="sm">${c.semesters === 2 ? 'Full year' : '1 semester'}</span>
               <span class="rm" data-remove="${idx}" role="button" aria-label="Remove">×</span>`;
        } else {
          btn.classList.add('empty');
          btn.innerHTML = `<span class="plus">+ add a course</span>`;
        }
        row.appendChild(btn);
      });
      host.appendChild(row);
    });
  }

  function renderReadout() {
    const slugs = Object.values(plan);
    const sems = slugs.reduce((n, s) => n + (course(s) ? course(s).semesters : 0), 0);
    const need = data.meta.distinctionSemesters;
    const pct = Math.min(100, (sems / need) * 100);

    const have = new Set();
    slugs.forEach(s => (course(s).skills || []).forEach(k => have.add(k)));
    const all = Object.keys(data.skills);
    const missing = all.filter(k => !have.has(k));

    const hitsCapstone = slugs.includes('software-development-studio') || slugs.includes('advanced-projects');

    let note;
    if (!slugs.length) note = 'Add a course, or start from one of the presets above.';
    else if (sems >= need) note = `This route earns the DTE distinction with ${sems} semesters.`;
    else note = `${need - sems} more semester${need - sems === 1 ? '' : 's'} would reach the distinction.`;

    document.getElementById('readout').innerHTML = `
      <p class="mono" style="color:var(--ink-3);margin:0 0 14px">Your route</p>
      <div class="big">${sems}<small> / ${need} semesters</small></div>
      <div class="meter"><i style="width:${pct}%"></i></div>
      <p class="status ${sems >= need ? 'good' : ''}">${esc(note)}</p>

      <p class="mono" style="color:var(--ink-3);margin:26px 0 9px">You'd cover (${have.size})</p>
      <div class="cover-list">${
        have.size ? [...have].map(k => `<span class="cov on">#${esc(k)}</span>`).join('')
                  : '<span class="cov off">nothing yet</span>'}</div>

      ${slugs.length ? `
      <p class="mono" style="color:var(--ink-3);margin:22px 0 9px">Never touched (${missing.length})</p>
      <div class="cover-list">${missing.slice(0, 16).map(k => `<span class="cov off">#${esc(k)}</span>`).join('')}</div>` : ''}

      ${slugs.length && !hitsCapstone ? `<p class="gap-note">No capstone in this route yet. Software Development Studio (K) is where the team project and Ke Kilohana credit live.</p>` : ''}
    `;
  }

  /* ---------- picker ---------- */
  function closePicker() { document.querySelectorAll('.picker').forEach(n => n.remove()); }

  function openPicker(idx, anchor) {
    closePicker();
    const box = document.createElement('div');
    box.className = 'picker';
    const items = data.courses.map(c => {
      const e = eligibility(c.slug, idx);
      return `<button ${e.ok ? '' : 'disabled'} data-pick="${c.slug}" data-idx="${idx}">
        ${esc(c.name)}
        <span class="why">${e.ok ? (c.semesters === 2 ? 'Full year' : '1 semester') + ' · ' + esc(c.tagline) : esc(e.why)}</span>
      </button>`;
    }).join('');
    box.innerHTML = `<div class="ph">Add to this semester</div>${items}`;
    document.body.appendChild(box);

    const b = anchor.getBoundingClientRect();
    const w = box.offsetWidth, h = box.offsetHeight;
    let left = Math.min(b.left, innerWidth - w - 16);
    let top = b.bottom + 8;
    if (top + h > innerHeight - 10) top = Math.max(10, b.top - h - 8);
    box.style.left = Math.max(16, left) + 'px';
    box.style.top = top + 'px';
  }

  /* ---------- share link ---------- */
  function encode() {
    const parts = Object.entries(plan).map(([i, s]) => i + ':' + s);
    return parts.length ? btoa(parts.join('|')).replace(/=+$/, '') : '';
  }
  function decode(hash) {
    try {
      const raw = atob(hash);
      const next = {};
      raw.split('|').forEach(p => {
        const [i, slug] = p.split(':');
        if (course(slug)) next[+i] = slug;
      });
      plan = next;
    } catch (e) { plan = {}; }
  }

  function syncHash() {
    const code = encode();
    history.replaceState(null, '', code ? '#route=' + code : location.pathname);
  }

  function refresh() { renderGrid(); renderReadout(); syncHash(); }

  /* ---------- wiring ---------- */
  function init(d) {
    data = d;

    document.getElementById('presets').innerHTML = data.presets.map((p, i) =>
      `<button class="preset" data-preset="${i}">${esc(p.name)}</button>`).join('');

    const m = location.hash.match(/route=([A-Za-z0-9+/]+)/);
    if (m) decode(m[1]);

    document.addEventListener('click', e => {
      const rm = e.target.closest('[data-remove]');
      if (rm) { e.stopPropagation(); delete plan[+rm.dataset.remove]; closePicker(); refresh(); return; }

      const pick = e.target.closest('[data-pick]');
      if (pick && !pick.disabled) {
        plan[+pick.dataset.idx] = pick.dataset.pick;
        closePicker(); refresh(); return;
      }

      const slot = e.target.closest('.slot');
      if (slot && !slot.classList.contains('filled')) { openPicker(+slot.dataset.idx, slot); return; }

      const pre = e.target.closest('[data-preset]');
      if (pre) {
        applyPreset(data.presets[+pre.dataset.preset]);
        document.getElementById('plan').scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      if (!e.target.closest('.picker')) closePicker();
    });

    addEventListener('keydown', e => { if (e.key === 'Escape') closePicker(); });

    document.getElementById('btnClear').addEventListener('click', () => { plan = {}; refresh(); });
    document.getElementById('btnShare').addEventListener('click', async (e) => {
      syncHash();
      try {
        await navigator.clipboard.writeText(location.href);
        e.target.textContent = 'Link copied ✓';
      } catch (err) { e.target.textContent = 'Link is in the address bar'; }
      setTimeout(() => { e.target.textContent = 'Copy shareable link'; }, 2200);
    });

    refresh();
  }

  /* Lay a preset out across the four years, earliest slot that validates. */
  function applyPreset(preset) {
    plan = {};
    preset.courses.forEach(slug => {
      for (let idx = 0; idx < 8; idx++) {
        if (occupied()[idx]) continue;
        if (eligibility(slug, idx).ok) { plan[idx] = slug; break; }
      }
    });
    refresh();
  }

  return { init };
})();
