/* Transit map: stations link to their course page. Tag filter dims the rest. */
window.CSMap = (function () {
  let data, activeTag = null;
  const ORDER = ['tier1', 'cyber', 'tier2', 'tier3', 'capstone'];
  const lineById = id => data.lines.find(l => l.id === id) || { color: '#789' };

  function quoteBlock(c) {
    const q = c.quote;
    if (!q || !q.text) return '';
    return `<blockquote class="pull${q.placeholder ? ' is-placeholder' : ''}">
      ${esc(q.text)}<cite>${esc(q.by || '')}${q.placeholder ? ' · sample' : ''}</cite></blockquote>`;
  }

  function codeFor(c, n) {
    const pre = { tier1: 'T1', tier2: 'T2', tier3: 'T3', capstone: 'CP', cyber: 'SA' }[c.line] || '--';
    return `${pre} · ${String(n).padStart(2, '0')} · ${c.semesters === 2 ? 'Full year' : '1 sem'}`;
  }

  function render(d) {
    data = d;
    let counter = 0;
    document.getElementById('legend').innerHTML = data.lines.map(l =>
      `<span><i style="background:${l.color}"></i>${esc(l.label)}</span>`).join('');

    const grid = document.getElementById('mapGrid');
    const svg = document.getElementById('connectors');
    grid.querySelectorAll('.tier-row').forEach(n => n.remove());

    ORDER.forEach(lineId => {
      const line = lineById(lineId);
      const courses = data.courses.filter(c => c.line === lineId);
      if (!courses.length) return;

      const row = document.createElement('div');
      row.className = 'tier-row';
      const parts = line.label.split('·');
      row.innerHTML = `<div class="tier-label"><b>${esc(parts[0].trim())}</b>${parts[1] ? esc(parts[1].trim()) : ''}</div>
        <div class="tier-courses"></div>`;
      const host = row.querySelector('.tier-courses');

      courses.forEach(c => {
        const n = ++counter;
        const a = document.createElement('a');
        a.className = 'station';
        a.href = 'course.html?c=' + encodeURIComponent(c.slug);
        a.style.setProperty('--c', line.color);
        a.dataset.slug = c.slug;
        a.dataset.tags = (c.skills || []).join(' ');
        a.innerHTML = `
          <span class="num">${n}</span>
          <span class="code">${esc(codeFor(c, n))}</span>
          <h3>${esc(c.name)}</h3>
          ${c.subtitle ? `<span class="sub">${esc(c.subtitle)}</span>` : ''}
          <p class="tl">${esc(c.tagline)}</p>
          <div class="meta">
            <span class="badge">${c.semesters === 2 ? 'Full year' : '1 semester'}</span>
            ${c.recommended ? '<span class="badge solid">Recommended</span>' : ''}
            ${c.isNew ? '<span class="badge solid">New</span>' : ''}
            <span class="badge">${c.prereqs.length ? esc(c.prereqText) : 'No prerequisite'}</span>
          </div>
          <div class="tags">${(c.skills || []).slice(0, 5)
            .map(k => `<span class="tag">#${esc(k)}</span>`).join('')}</div>
          ${quoteBlock(c)}`;
        host.appendChild(a);
      });
      grid.appendChild(row);
    });

    requestAnimationFrame(drawConnectors);
  }

  function elbow(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (Math.abs(dx) < 6) return `M${x1} ${y1} L${x2} ${y2}`;
    const r = Math.min(18, Math.abs(dx) / 2, Math.abs(dy) / 2), midY = y1 + dy / 2, sx = Math.sign(dx);
    return `M${x1} ${y1} L${x1} ${midY - r} Q${x1} ${midY} ${x1 + sx * r} ${midY} L${x2 - sx * r} ${midY} Q${x2} ${midY} ${x2} ${midY + r} L${x2} ${y2}`;
  }

  function drawConnectors() {
    const grid = document.getElementById('mapGrid'), svg = document.getElementById('connectors');
    if (!grid || !svg || !data) return;      // a resize can arrive before the courses have loaded
    const gb = grid.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${gb.width} ${gb.height}`);
    svg.innerHTML = '';
    const pos = {};
    grid.querySelectorAll('.station').forEach(el => {
      const b = el.getBoundingClientRect();
      pos[el.dataset.slug] = { cx: b.left - gb.left + b.width / 2, top: b.top - gb.top, bottom: b.top - gb.top + b.height };
    });
    data.courses.forEach(c => {
      const to = pos[c.slug]; if (!to) return;
      const src = [];
      c.prereqs.forEach(p => { if (p.anyOf) src.push(...p.anyOf); if (p.allOf) src.push(...p.allOf); });
      if (!src.length && c.prereqs.some(p => p.programmingSemesters || p.csSemesters)) src.push('data-structures-algorithms');
      [...new Set(src)].forEach(s => {
        const from = pos[s]; if (!from || from.bottom > to.top) return;
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', elbow(from.cx, from.bottom + 2, to.cx, to.top - 2));
        path.setAttribute('stroke', lineById(c.line).color);
        path.setAttribute('opacity', activeTag ? '.12' : '.4');
        svg.appendChild(path);
      });
    });
  }

  function filter(tag) {
    activeTag = tag;
    document.querySelectorAll('.station').forEach(el => {
      el.classList.toggle('dim', !!tag && !el.dataset.tags.split(' ').includes(tag));
    });
    document.querySelectorAll('#tagBar .tag').forEach(el =>
      el.classList.toggle('sel', el.dataset.tag === tag));
    drawConnectors();
  }

  let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(drawConnectors, 160); });
  return { render, drawConnectors, filter };
})();
