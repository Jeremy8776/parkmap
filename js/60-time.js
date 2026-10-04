/* Direct manipulation: drag the time handle and the map answers live (permit bays fade when their zone is off).
   Also the length-of-stay chips: the answer is for the whole stay, not one instant. */
const scrub = document.getElementById('scrub');
const bandsEl = document.getElementById('bands'), handle = document.getElementById('handle');
const pct = m => (m / 1440 * 100).toFixed(2) + '%';

function applyIdle(mk, m) {
  const el = mk.getElement && mk.getElement(); if (!el) return;
  const s = pinState(m); el.classList.toggle('st-run', s === 'run'); el.classList.toggle('st-off', s === 'off');
}
function applyTime() { allMarkers.forEach(([mk, m]) => applyIdle(mk, m)); if (window.restyleZones) restyleZones(); const pc = document.getElementById('planchip'); if (pc) pc.querySelector('b').textContent = whenText(WHEN) + ' \u00b7 ' + durText(DUR); }

/* zones nearest the middle of the screen, so the bars match what you are looking at */
const zbox = {}; D.zones.forEach(z => { const ys = z.g[0].map(p => p[0]), xs = z.g[0].map(p => p[1]); zbox[z.i] = [Math.min(...ys), Math.max(...ys), Math.min(...xs), Math.max(...xs)]; });
function zonesInView() {
  const c = map.getCenter();
  return D.zones.filter(z => { const b = zbox[z.i]; return c.lat >= b[0] && c.lat <= b[1] && c.lng >= b[2] && c.lng <= b[3]; })
    .sort((a, b) => ((zbox[a.i][1] - zbox[a.i][0]) * (zbox[a.i][3] - zbox[a.i][2])) - ((zbox[b.i][1] - zbox[b.i][0]) * (zbox[b.i][3] - zbox[b.i][2]))).map(z => z.i);
}
function drawBands() {
  const ids = LAST && LAST.zid != null ? [LAST.zid] : zonesInView().slice(0, 4), one = !!(LAST && LAST.zid != null);
  const noZone = !!LAST && LAST.zid == null;
  bandsEl.className = (one ? 'one ' : '') + (noZone ? 'dim' : '');
  const stay = [minsOf(WHEN), Math.min(minsOf(WHEN) + DUR, 1440)];
  bandsEl.innerHTML = ids.map(id => `<div class="band" title="${ZNAME[id]}">${zoneSegs(id, WHEN).map(([s, e]) =>
    `<i style="left:${pct(s)};width:${(((e - s) / 1440) * 100).toFixed(2)}%;background:${zcol(id)}"></i>`).join('')}</div>`).join('') +
    (ids.length ? '' : '<div class="band"></div>') + `<div class="stay" style="left:${pct(stay[0])};width:${(((stay[1] - stay[0]) / 1440) * 100).toFixed(2)}%"></div>`;
  const cap = document.getElementById('bandCap'); cap.className = 'cap';
  cap.textContent = one ? `${ZNAME[ids[0]]} permit zone` + (zoneSegs(ids[0], WHEN).length ? '' : ': not running this day')
    : noZone ? 'No permit zone applies here, so the time does not change this answer'
    : ids.length ? 'Bars show when nearby permit zones run. The grey bar is your stay.' : 'No permit zone in this part of the map';
}
function refreshTime(commit) {
  const m = minsOf(WHEN);
  handle.style.left = pct(m);
  document.getElementById('tip').textContent = hhmm(m) + (DUR < 1440 ? ' to ' + hhmm(m + DUR) : '');
  document.getElementById('whenLabel').textContent = whenText(WHEN);
  document.getElementById('nowbtn').hidden = Math.abs(WHEN - new Date()) < 90000;
  document.querySelectorAll('#days button').forEach(b => b.classList.toggle('on', +b.dataset.d === dayNum(WHEN)));
  document.querySelectorAll('#durs button').forEach(b => b.classList.toggle('on', +b.dataset.m === DUR));
  document.querySelectorAll('#presets [data-p]').forEach(b => b.classList.toggle('on', b.dataset.p === PRESET));
  document.getElementById('whenSum').textContent = whenText(WHEN) + ' for ' + durText(DUR);
  drawBands(); applyTime();
  if (LAST) {
    const M = analyse(LAST.latlng); M.pre = LAST.pre; if (M.pre) M.sub = M.pre + M.sub; LAST = M;
    setHead({ tone: M.tone, title: M.title, sub: M.sub });
    if (commit && MODE === 'spot') { setBody(spotBody(M), 'spot'); if (sheetDetent() === 'fit') setDetent('fit'); }
  }
  scrub.setAttribute('aria-valuenow', m); scrub.setAttribute('aria-valuetext', whenText(WHEN) + ', stay ' + durText(DUR));
  if (window.updateHash) updateHash();
}
function setMinutes(m, commit) {
  m = Math.max(0, Math.min(1439, Math.round(m / 5) * 5));
  const d = new Date(WHEN); d.setHours(Math.floor(m / 60), m % 60, 0, 0); WHEN = d; PRESET = null; refreshTime(commit);
}
function minsAt(e) { const r = scrub.getBoundingClientRect(); return (e.clientX - r.left) / r.width * 1440; }
let scrubbing = false, raf = 0;
scrub.addEventListener('pointerdown', e => { scrubbing = true; scrub.setPointerCapture(e.pointerId); scrub.classList.add('active'); setMinutes(minsAt(e), false); });
scrub.addEventListener('pointermove', e => { if (scrubbing && !raf) raf = requestAnimationFrame(() => { raf = 0; setMinutes(minsAt(e), false); }); });
const endScrub = e => { if (!scrubbing) return; scrubbing = false; scrub.classList.remove('active'); setMinutes(minsAt(e), true); };
scrub.addEventListener('pointerup', endScrub); scrub.addEventListener('pointercancel', endScrub);
scrub.addEventListener('keydown', e => {
  const step = e.shiftKey ? 60 : 15;
  if (e.key === 'ArrowRight') { setMinutes(minsOf(WHEN) + step, true); e.preventDefault(); }
  if (e.key === 'ArrowLeft') { setMinutes(minsOf(WHEN) - step, true); e.preventDefault(); }
});
document.getElementById('days').innerHTML = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((l, i) => `<button data-d="${i + 1}" aria-label="${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][i]}">${l}</button>`).join('');
document.getElementById('days').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  const now = new Date(), d = new Date(WHEN); d.setFullYear(now.getFullYear(), now.getMonth(), now.getDate() + ((+b.dataset.d - dayNum(now) + 7) % 7)); WHEN = d; PRESET = null; refreshTime(true);
});
document.getElementById('durs').innerHTML = [[60, '1h'], [120, '2h'], [240, '4h'], [1440, 'All day']].map(([m, l]) => `<button data-m="${m}">${l}</button>`).join('');
document.getElementById('durs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { DUR = +b.dataset.m; PRESET = null; refreshTime(true); } });
document.getElementById('nowbtn').onclick = () => { WHEN = new Date(); PRESET = null; refreshTime(true); };
map.on('moveend', () => { if (!LAST) drawBands(); });
