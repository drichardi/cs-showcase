/* Blue survey contours. Skin B only. */
window.Topo = (function () {
  function build() {
    const svg = document.getElementById('topo');
    if (!svg) return;
    if (document.documentElement.getAttribute('data-skin') !== 'b') { svg.innerHTML = ''; return; }
    const w = innerWidth, h = innerHeight;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    let out = '';
    const peaks = [{ x: w * .82, y: h * .16, s: 1 }, { x: w * .1, y: h * .9, s: .72 }];
    peaks.forEach((pk, pi) => {
      for (let r = 1; r <= 16; r++) {
        const base = (r / 16) * Math.max(w, h) * .72 * pk.s;
        let d = '';
        for (let i = 0; i <= 130; i++) {
          const th = (i / 130) * Math.PI * 2;
          const warp = 1 + Math.sin(th * 3 + r * .2 + pi) * .12
                         + Math.sin(th * 5.4 + r * .1) * .07 + Math.sin(th * 8.1 + pi) * .035;
          d += (i ? 'L' : 'M') + (pk.x + Math.cos(th) * base * warp).toFixed(1) + ' '
                               + (pk.y + Math.sin(th) * base * warp * .66).toFixed(1);
        }
        const major = r % 5 === 0;
        out += `<path d="${d} Z" stroke-opacity="${major ? .2 : .1}" stroke-width="${major ? 1.4 : 1}"/>`;
      }
    });
    svg.innerHTML = out;
  }
  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(build, 220); });
  document.addEventListener('DOMContentLoaded', build);
  return { build };
})();
