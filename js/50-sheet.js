/* The bottom sheet (Apple Maps style): three detents, drag to resize, head always visible. */
const GL = {
  ok: '<circle cx="20" cy="20" r="20" fill="#34c759"/><path d="M11.5 20.5l6 6 11-12.5" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>',
  warn: '<circle cx="20" cy="20" r="20" fill="#ff9f0a"/><path d="M20 10.5v11" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/><circle cx="20" cy="28.5" r="2.2" fill="#fff"/>',
  bad: '<circle cx="20" cy="20" r="20" fill="#ff3b30"/><path d="M13 13l14 14M27 13L13 27" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>',
  info: '<circle cx="20" cy="20" r="20" fill="#0a84ff"/><path d="M20 18v9" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/><circle cx="20" cy="12" r="2.2" fill="#fff"/>',
  mute: '<circle cx="20" cy="20" r="20" fill="#8e8e93"/><path d="M12.5 20h15" stroke="#fff" stroke-width="3.6" stroke-linecap="round"/>',
  home: '<circle cx="20" cy="20" r="20" fill="#1c1c1e"/><text x="20" y="27" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="800" font-size="21" fill="#fff">P</text>'
};
const sheet = document.getElementById('sheet'), sbody = document.getElementById('sheetBody');
let MODE = 'home';
/* Layouts: desktop (floating card, two columns when wide), phone portrait (bottom sheet) and phone landscape (side panel). */
const LAND = () => innerHeight <= 520 && innerWidth > innerHeight;
const PHONE = () => innerWidth <= 760 || LAND();
const SIDE = () => map.getSize().x > 760 || LAND();                    // card sits beside the map, not under it
const dims = () => {
  const H = document.getElementById('mapwrap').clientHeight;
  if (LAND()) return { peek: 128, half: H - 16, full: H - 16 };
  if (innerWidth <= 760) return { peek: 150, half: Math.round(H * .5), full: H - 76 };
  return { peek: 164, half: Math.min(Math.round(H * .6), 600), full: H - 88 };
};
const sheetDetent = () => sheet.dataset.detent || 'peek';
// 'fit' = exactly as tall as the content (capped at full), so a spot card needs no scrolling
const fitCap = () => innerWidth <= 760 && !LAND() ? Math.round(mapH() * .62) : dims().full;      // phones keep a third of the map in view
const mapH = () => document.getElementById('mapwrap').clientHeight;
function fitHeight() {
  const chrome = [...sheet.children].filter(c => c !== sbody).reduce((a, c) => a + c.offsetHeight, 0);
  sbody.style.flex = 'none'; sbody.style.height = 'auto';      // measure the content's natural height
  const natural = sbody.offsetHeight;
  sbody.style.flex = ''; sbody.style.height = '';
  return Math.min(fitCap(), Math.max(dims().peek, Math.ceil(chrome + natural + 2)));
}
// natural height; if even that exceeds the screen, tighten spacing once before resorting to scroll
function fitNow() {
  let h = fitHeight();
  if (h >= dims().full - 1 && !sheet.classList.contains('tight')) { sheet.classList.add('tight'); h = fitHeight(); }
  return h;
}
let fitTimer = 0;
function setDetent(n) {
  sheet.dataset.detent = n;
  sheet.style.height = (n === 'fit' ? fitNow() : dims()[n]) + 'px';
  document.documentElement.style.setProperty('--sheetH', (sheet.offsetHeight && n !== 'full' ? parseInt(sheet.style.height) : 164) + 'px');
  if (n === 'fit') {   // columns can settle a few px later than the first measure: correct once the height transition ends
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => {
      if (sheet.dataset.detent !== 'fit') return;
      const over = sbody.scrollHeight - sbody.clientHeight;
      if (over > 2) { const h = sheet.offsetHeight + over + 2; if (h > fitCap()) sheet.classList.add('tight'); sheet.style.height = Math.min(fitCap(), Math.max(h, fitNow())) + 'px'; }
    }, 480);
  }
}
function setHead(h) {
  document.getElementById('glyph').innerHTML = `<svg width="42" height="42" viewBox="0 0 40 40" aria-hidden="true">${GL[h.tone] || GL.mute}</svg>`;
  document.getElementById('hTitle').textContent = h.title;
  document.getElementById('hSub').textContent = h.sub || '';
  document.getElementById('clearbtn').hidden = !LAST && MODE !== 'guide';
}
function setBody(html, mode) {
  MODE = mode || MODE; sheet.dataset.mode = MODE; sbody.innerHTML = html; sbody.scrollTop = 0; sheet.classList.remove('tight');
  sheet.classList.toggle('wide', MODE === 'spot' && window.innerWidth >= 1000);   // two columns so the whole card fits
}

// drag to resize
let drag = null;
function dStart(e) {
  if (e.button > 0) return;
  drag = { y0: e.clientY, h0: sheet.offsetHeight, t0: performance.now(), moved: false };
  sheet.classList.add('dragging'); e.currentTarget.setPointerCapture(e.pointerId);
}
function dMove(e) {
  if (!drag) return;
  const dy = drag.y0 - e.clientY; if (Math.abs(dy) > 4) drag.moved = true;
  const d = dims(); sheet.style.height = Math.max(d.peek, Math.min(d.full, drag.h0 + dy)) + 'px';
}
function dEnd(e) {
  if (!drag) return;
  sheet.classList.remove('dragging');
  const d = dims(); d.fit = fitHeight(); const cur = sheet.offsetHeight, v = (drag.y0 - e.clientY) / Math.max(1, performance.now() - drag.t0);
  if (!drag.moved) { setDetent(sheetDetent() === 'peek' ? (MODE === 'spot' ? 'fit' : 'half') : 'peek'); drag = null; return; }
  const proj = cur + v * 220;
  setDetent(['peek', MODE === 'spot' ? 'fit' : 'half', 'full'].sort((a, b) => Math.abs(d[a] - proj) - Math.abs(d[b] - proj))[0]);
  drag = null;
}
['grab', 'statusRow'].forEach(id => {
  const el = document.getElementById(id);
  el.addEventListener('pointerdown', dStart); el.addEventListener('pointermove', dMove);
  el.addEventListener('pointerup', dEnd); el.addEventListener('pointercancel', dEnd);
});
window.addEventListener('resize', () => setDetent(sheetDetent()));

// keep the tapped point in the free part of the map, not under the sheet
const sheetW = () => LAND() ? 372 : sheet.classList.contains('wide') ? 780 : 410;
function freeCentre(detent) {
  const W = map.getSize().x, H = map.getSize().y, wide = SIDE();
  return wide ? L.point((W + sheetW() + 12) / 2, H / 2) : L.point(W / 2, (H - (detent === 'fit' ? fitHeight() : dims()[detent])) / 2 + 30);
}
function reveal(latlng, detent) {
  const c = map.latLngToContainerPoint(latlng), t = freeCentre(detent || sheetDetent());
  const W = map.getSize().x, H = map.getSize().y, wide = SIDE(), d = detent || sheetDetent(), sh = d === 'fit' ? fitHeight() : dims()[d];
  const clear = wide ? c.x > sheetW() + 60 && c.x < W - 50 && c.y > 90 && c.y < H - 50 : c.y > 90 && c.y < H - sh - 40;
  if (clear) return;                                   // already in the open part of the map: leave the view alone, no jumpy pan
  map.panBy([c.x - t.x, c.y - t.y], { animate: true, duration: .45 });
}
function fitFree(bounds, maxZoom) {
  const wide = SIDE();
  map.fitBounds(bounds, { maxZoom: maxZoom || 17, paddingTopLeft: [wide ? sheetW() + 20 : 20, 80], paddingBottomRight: [20, wide ? 20 : dims().half + 10] });
}
