/* Skin + mode control, shared across pages.
   ?skin=a|b|c in the URL wins, then localStorage, then default. */
(function () {
  const K_SKIN = 'cs-skin', K_MODE = 'cs-mode';
  const root = document.documentElement;
  const VALID = ['a', 'b', 'c'];
  const NAMES = { a: 'Catalog', b: 'Survey', c: 'Wayfinding' };

  const q = new URLSearchParams(location.search).get('skin');
  const skin = VALID.includes(q) ? q : (localStorage.getItem(K_SKIN) || 'b');
  const mode = localStorage.getItem(K_MODE) || 'day';

  root.setAttribute('data-skin', skin);
  root.setAttribute('data-mode', mode);
  if (q) localStorage.setItem(K_SKIN, q);

  function setSkin(s) {
    root.setAttribute('data-skin', s);
    localStorage.setItem(K_SKIN, s);
    document.querySelectorAll('[data-setskin]').forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.setskin === s));
    if (window.Topo) window.Topo.build();
    if (window.CSMap) setTimeout(window.CSMap.drawConnectors, 60);
  }
  function setMode(m) {
    root.setAttribute('data-mode', m);
    localStorage.setItem(K_MODE, m);
    const b = document.getElementById('modeBtn');
    if (b) b.textContent = m === 'day' ? 'Night' : 'Day';
    if (window.Topo) window.Topo.build();
  }

  document.addEventListener('DOMContentLoaded', () => {
    const ctl = document.querySelector('.ctl');
    if (ctl) {
      ctl.innerHTML = `
        <select id="skinSel" aria-label="Design direction">
          ${VALID.map(s => `<option value="${s}">${NAMES[s]}</option>`).join('')}
        </select>
        <button id="modeBtn" aria-label="Toggle day and night"></button>`;
      ctl.querySelector('#skinSel').value = root.getAttribute('data-skin');
      ctl.querySelector('#skinSel').addEventListener('change', e => setSkin(e.target.value));
      ctl.querySelector('#modeBtn').addEventListener('click', () =>
        setMode(root.getAttribute('data-mode') === 'day' ? 'night' : 'day'));
      setMode(root.getAttribute('data-mode'));
    }

    const strip = document.querySelector('.fb .pick');
    if (strip) {
      strip.innerHTML = VALID.map(s =>
        `<button data-setskin="${s}" aria-pressed="${s === skin}">${NAMES[s]}</button>`).join('');
      strip.addEventListener('click', e => {
        const b = e.target.closest('[data-setskin]');
        if (b) setSkin(b.dataset.setskin);
      });
    }
  });

  window.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.tagChip = (key, label, href) =>
    `<a class="tag" href="${href || ('index.html#tag=' + encodeURIComponent(key))}">#${esc(label || key)}</a>`;
})();
