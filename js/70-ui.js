/* Search, layers, guide and the home state. Depth: guide and detail live one tap away. */
const $ = id => document.getElementById(id);
const CHEV = '<i class="chev"></i>';

// ---- home ----
const TRY = ['Atlantis Avenue', 'Romford Road', 'Barking Road', 'Gallions Reach Shopping Park'];
function goHome() {
  LAST = null; G.hl.clearLayers(); $('q').value = '';
  setHead({ tone: 'home', title: 'Newham parking', sub: PHONE() ? 'Tap the map, or check where you are' : 'Tap the map to check a spot' });
  setBody(`<p class="lead">Tap anywhere on the map. You get a plain answer: whose road it is, who enforces it, and whether a permit zone is running at the time you set above.</p>
    <h5>Try</h5><div class="group flush">${TRY.map(t => `<button class="nav" data-find="${t}"><span>${t}</span>${CHEV}</button>`).join('')}</div>
    <div class="group flush"><button class="nav" id="openNearby"><span><b>Nearby spots</b><br><small>Bays and car parks around you, nearest first</small></span>${CHEV}</button><button class="nav" id="openGuide"><span><b>Guide</b><br><small>Areas, symbols and rules</small></span>${CHEV}</button></div>`, 'home');
  drawBands(); refreshTime(false);
}
sbody.addEventListener('click', e => {
  const f = e.target.closest('[data-find]'); if (f) { $('q').value = f.dataset.find; find(f.dataset.find); }
  if (e.target.closest('#openGuide')) showGuide();
  if (e.target.closest('#openNearby')) showNearby();
  const nr = e.target.closest('[data-near]'); if (nr) { const [la, lo] = nr.dataset.near.split(',').map(Number), ll = L.latLng(la, lo); map.setView(ll, 17, { animate: false }); whenLoaded(ll.toBounds(300), () => showFramed(ll)); }
  if (e.target.closest('#guideDone')) back();
});
function back() {
  if (LAST) { setHead({ tone: LAST.tone, title: LAST.title, sub: LAST.sub }); setBody(spotBody(LAST), 'spot'); setDetent('fit'); }
  else goHome();
}

// ---- guide ----
function showGuide(seg) {
  const box = document.createElement('div');
  box.appendChild($('tpl-guide').content.cloneNode(true));
  box.querySelector('[data-seg="symbols"]').innerHTML = legendHTML();
  const segs = [['areas', 'Areas'], ['symbols', 'Symbols'], ['rules', 'Rules']];
  setHead({ tone: 'home', title: 'Guide', sub: 'Areas, symbols and rules' });
  setBody(`<div class="segbar"><div class="seg">${segs.map(s => `<button data-s="${s[0]}">${s[1]}</button>`).join('')}</div><button id="guideDone" class="done">Done</button></div><div id="guideBody"></div>`, 'guide');
  $('guideBody').innerHTML = box.innerHTML;
  $('pbp').innerHTML = D.paybyphone.map(p => `<tr><td>${p.street}</td><td>${p.where}</td><td>${p.hours}</td><td>${p.max}</td></tr>`).join('');
  const X = D.xstats, sv = X.votes;
  $('srcList').innerHTML = `<div class="group">${D.sources.map(s => `<div class="row stack"><b>${s.n}</b><span>${s.r}. ${s.u}.</span></div>`).join('')}</div>
    <p class="who pad"><b>Cross-check results.</b> Road classification: ${sv.high || 0} high, ${sv.medium || 0} medium and ${sv.low || 0} low confidence. ${X.conflicts} roads have sources that disagree, shown on their card. Dedupe: ${X.dedupe.spaces_merged_into_polygons} bay shapes merged into their car park outline, ${X.dedupe.dup_ev} duplicate charge point records dropped.</p>
    <p class="who pad"><b>Checked, nothing to add.</b></p><ul class="who">${D.checked.map(c => `<li>${c}</li>`).join('')}</ul>`;
  const km = c => (D.xstats.km[c] || 0).toFixed(1) + ' km';
  ['tfl', 'newham', 'private'].forEach(c => { const e = $('km-' + c); if (e) e.textContent = km(c); });
  const pick = s => {
    sbody.querySelectorAll('[data-seg]').forEach(x => x.hidden = x.dataset.seg !== s);
    sbody.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.s === s));
  };
  sbody.querySelectorAll('.seg button').forEach(b => b.onclick = () => pick(b.dataset.s));
  sbody.querySelectorAll('[data-fit]').forEach(el => el.querySelector('summary').addEventListener('click', () => fitFree(JSON.parse(el.dataset.fit), 17)));
  $('coverage').innerHTML = `<div class="group">${D.coverage.map(c => `<div class="cov"><i class="${c.c}"></i><div><b>${c.b}</b><br><span class="who">${c.s}</span></div></div>`).join('')}</div>`;
  pick(seg || 'areas'); setDetent('full'); $('clearbtn').hidden = false;
}
function legendHTML() {
  const li = (ic, h, t) => `<div class="li">${ic}<div><b>${h}</b><br><span class="who">${t}</span></div></div>`;
  return `<h5>Bays</h5>` + ['permit', 'disabled', 'ev', 'customer', 'private', 'carpark', 'taxi', 'cycle'].map(t => li(symbolSVG(t, 34), BAY[t].label, `${BAY[t].what} <b>Rule set by:</b> ${BAY[t].who}.`)).join('') +
    `<h5>Kerb lines</h5>` + ['wait', 'stop'].map(k => li(lineSwatch(k), LINE[k].label, LINE[k].what)).join('') +
    `<h5>Road colours</h5>
    ${li('<i class="line" style="border-color:#e5383b"></i>', 'Red: TfL Red Route <span class="tag" id="km-tfl"></span>', 'TfL owns and enforces. Dashed pale red marks the first ~30 m of side roads, which follow Red Route rules too.')}
    ${li('<i class="line" style="border-color:#2b6fdc"></i>', 'Blue: Newham road <span class="tag" id="km-newham"></span>', 'Council owned. Newham officers enforce, with permit zones.')}
    ${li('<i class="line" style="border-color:#f29f05"></i>', 'Amber: private or unadopted <span class="tag" id="km-private"></span>', 'Landowner or managing agent rules. Inferred. No council fine.')}
    ${li('<i class="line" style="border-color:#9aa0a8"></i>', 'Grey: other borough', 'Barking Riverside and similar. Not covered here.')}
    <h5>Shaded areas</h5>
    ${li('<i class="sw" style="background:#7b3fa0"></i>', 'Purple', 'Private retail land and car parks')}${li('<i class="sw" style="background:#6b4f3a"></i>', 'Brown', 'Private industrial and business parks')}
    ${li('<i class="sw" style="background:#0f7c8c"></i>', 'Teal', 'DLR depot land')}${li('<i class="sw" style="background:#2e7d32"></i>', 'Green', 'Newham council estate land')}
    ${li('<i class="ringkey off"></i>', 'Blue ring on a pin', 'The permit zone is not running during your stay. Usually open to anyone, but this is not a green light: read the lines and signs.')}
    ${li('<i class="ringkey run"></i>', 'Amber ring on a pin', 'The permit zone is running during your stay, or your stay is longer than that car park\'s limit.')}`;
}

// ---- search ----
/* show a spot we navigated to (search, locate, shared link) and keep it clear of the sheet */
function showFramed(ll) {
  showSpot(ll, true);
  const go = () => reveal(ll, 'fit');
  if (map._animatingZoom || map._panAnim && map._panAnim._inProgress) map.once('moveend', () => setTimeout(go, 60)); else setTimeout(go, 80);
}
const NAMES = [...D.streets.map(s => [s[0], 'Road', s[1], s[2]]), ...D.places.map(p => [p[0], 'Place', p[1], p[2]])].sort((a, b) => a[0].localeCompare(b[0]));
const NMAP = new Map(); NAMES.forEach(n => { if (!NMAP.has(n[0].toLowerCase())) NMAP.set(n[0].toLowerCase(), n); });
function find(q) {
  q = q.trim().toLowerCase(); if (!q) return; $('sugg').hidden = true;
  const n = NMAP.get(q);
  if (!n) { setHead({ tone: 'mute', title: 'No match', sub: 'Try a street or place name' }); setBody('<p class="lead">No street or place by that name in the mapped area.</p>', 'home'); setDetent('half'); return; }
  const c = L.latLng(n[2], n[3]), box = c.toBounds(260);
  map.fitBounds(box, { maxZoom: 17, paddingBottomRight: [0, 160] });
  whenLoaded(box.pad(1), () => {
    const rs = D.roads.filter(r => r.n.toLowerCase() === q);
    if (rs.length) { const best = rs.slice().sort((a, b) => b.g.length - a.g.length)[0], m = best.g[Math.floor(best.g.length / 2)]; return showFramed(L.latLng(m[0], m[1])); }
    showFramed(c);
  });
}
$('q').addEventListener('input', () => {
  const v = $('q').value.trim().toLowerCase(), s = $('sugg');
  if (!v) { s.hidden = true; return; }
  const m = NAMES.filter(n => n[0].toLowerCase().includes(v)).sort((a, b) => a[0].toLowerCase().indexOf(v) - b[0].toLowerCase().indexOf(v)).slice(0, 6);
  s.innerHTML = m.map(n => `<button data-find="${n[0]}"><span>${n[0]}</span><small>${n[1]}</small></button>`).join('') || '<div class="none">No matches</div>';
  s.hidden = false;
});
$('sugg').addEventListener('click', e => { const b = e.target.closest('[data-find]'); if (b) { $('q').value = b.dataset.find; find(b.dataset.find); } });
$('q').addEventListener('keydown', e => {
  if (e.key === 'Escape') $('sugg').hidden = true;
  if (e.key !== 'Enter') return;
  const typed = $('q').value.trim().toLowerCase(), exact = NMAP.get(typed), first = $('sugg').querySelector('[data-find]');
  const pick = exact ? exact[0] : first ? first.dataset.find : $('q').value;
  $('q').value = pick; find(pick);
});
$('clearbtn').onclick = () => { goHome(); setDetent('peek');
fitFree(L.latLngBounds([[51.5030, 0.0640], [51.5215, 0.0885]]), 16); $('sugg').hidden = true; };
document.addEventListener('click', e => { if (!e.target.closest('#search')) $('sugg').hidden = true; if (!e.target.closest('#layersPop,#btnLayers')) $('layersPop').hidden = true; });

// ---- layers popover ----
const LAYERS = [['zones', 'Permit zones (amber = running)'], ['roads', 'Roads'], ['bays', 'Bays and symbols'], ['kerb', 'Kerb lines'], ['land', 'Private land'], ['fog', 'Fog of war'], ['area', 'Newham boundary'], ['cycle', 'Cycle racks'], ['london', 'All TfL Red Routes in London']];
$('layersPop').innerHTML = `<div class="group flush">${LAYERS.map(l => `<label class="toggle"><span>${l[1]}</span><input type="checkbox" role="switch" data-layer="${l[0]}" ${ON[l[0]] ? 'checked' : ''}><i></i></label>`).join('')}</div>
  <div class="seg bases">${Object.keys(BASES).map(b => `<button data-base="${b}" class="${b === curBase ? 'on' : ''}">${b}</button>`).join('')}</div>`;
$('layersPop').addEventListener('change', e => { const c = e.target.closest('[data-layer]'); if (c) { ON[c.dataset.layer] = c.checked; sync(); } });
$('layersPop').addEventListener('click', e => { const b = e.target.closest('[data-base]'); if (b) { setBase(b.dataset.base); $('layersPop').querySelectorAll('[data-base]').forEach(x => x.classList.toggle('on', x === b)); } });
$('btnLayers').onclick = () => { $('layersPop').hidden = !$('layersPop').hidden; };
$('btnGuide').onclick = () => showGuide();
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (MODE === 'guide' || MODE === 'list') back(); else if (MODE === 'spot') deselect(); } });

goHome(); setDetent('peek');

// ---- actions on a spot card: ticket help, report, share ----
const HELP = {
  tfl: ['TfL Red Route penalty', 'Pay within 14 days for the half-price rate, or within 28 days at full price. You can challenge it with TfL first. If TfL rejects it you can appeal to London Tribunals, usually within 28 days of the rejection.'],
  newham: ['Newham penalty charge notice', 'The discount applies if you pay within 14 days. You can make an informal challenge inside that window, and Newham normally holds the discount while it decides. If you are refused, or after a Notice to Owner, you make formal representations, and can then appeal to London Tribunals within 28 days.'],
  private: ['Private parking charge', 'This is a contract claim, not a council fine. Appeal to the operator first, as most appeal windows are 28 days. If refused, the operator\'s trade body runs an independent appeal service (POPLA or the IAS), and you generally have 28 days from the rejection. A keeper is only liable if the operator sends a compliant Notice to Keeper, so check the dates and wording on it.'],
  other: ['Another borough', 'Check that borough\'s website for the PCN process.']
};
const spotUrl = () => location.href.split('#')[0] + '#' + (LAST ? [LAST.latlng.lat.toFixed(5), LAST.latlng.lng.toFixed(5), minsOf(WHEN), DUR, dayNum(WHEN)].join(',') : '');
const toast = t => { let e = $('toast'); if (!e) { e = document.createElement('div'); e.id = 'toast'; e.className = 'glass'; e.style.cssText = 'position:absolute;z-index:2000;top:68px;left:50%;transform:translateX(-50%);padding:8px 16px;border-radius:20px;font-weight:600;font-size:13px'; $('mapwrap').appendChild(e); } e.textContent = t; e.hidden = false; clearTimeout(e._t); e._t = setTimeout(() => e.hidden = true, 2200); };
const copy = t => (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => true, () => false);
sbody.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || !LAST) return;
  if (b.dataset.act === 'share') copy(spotUrl()).then(ok => toast(ok ? 'Link copied' : 'Copy failed'));
  if (b.dataset.act === 'report') copy(`Parking guide note: ${LAST.title} at ${LAST.latlng.lat.toFixed(5)}, ${LAST.latlng.lng.toFixed(5)} (${LAST.cls}). What is wrong: `).then(ok => toast(ok ? 'Details copied, paste them into a message' : 'Copy failed'));
  if (b.dataset.act === 'ticket') {
    const h = HELP[LAST.cls] || HELP.other;
    setBody(`<div class="help"><h6>${h[0]}</h6><p>${h[1]}</p><p class="who">General rules, not legal advice. The notice itself states your exact dates and who to write to. Keep photos of the signs and lines.</p><button id="helpDone" class="done">Back</button></div>`, 'guide');
    $('helpDone').onclick = () => back(); setDetent('fit');
  }
});
function updateHash() { if (LAST) history.replaceState(null, '', spotUrl()); }
(function () {
  const m = /^#(-?[\d.]+),(-?[\d.]+),(\d+),(\d+),(\d)$/.exec(location.hash); if (!m) return;
  const now = new Date(), d = new Date(); d.setDate(now.getDate() + ((+m[5] - dayNum(now) + 7) % 7)); d.setHours(Math.floor(+m[3] / 60), +m[3] % 60, 0, 0); WHEN = d; DUR = +m[4];
  const ll = L.latLng(+m[1], +m[2]); map.setView(ll, 17); whenLoaded(ll.toBounds(300), () => showFramed(ll));
})();

// ---- phone: quick presets, with the slider, day and stay behind "Adjust" ----
const atTime = (h, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const PRESETS = { now: () => [new Date(), 120], eve: () => [atTime(18), 240], night: () => [atTime(22), 600], day: () => [new Date(), 1440] };
$('presets').addEventListener('click', e => {
  const b = e.target.closest('[data-p]'); if (!b) return;
  [WHEN, DUR] = PRESETS[b.dataset.p](); PRESET = b.dataset.p; refreshTime(true);
});
$('moreTime').onclick = () => {
  const open = $('timeBox').classList.toggle('tm-open');
  $('moreTime').setAttribute('aria-expanded', String(open));
  $('moreTime').textContent = open ? 'Done' : 'Adjust';
  setDetent(sheetDetent());
};
$('ctaLocate').onclick = () => $('btnLocate').click();
sbody.addEventListener('toggle', e => { if (e.target.matches('details.more')) setDetent(sheetDetent()); }, true);
// ---- locate me: "am I parked legally here?" ----
let meMarker = null, ME = null;
$('btnLocate').onclick = () => {
  if (!navigator.geolocation) return toast('Location is not available in this browser');
  $('btnLocate').classList.add('busy');
  navigator.geolocation.getCurrentPosition(pos => {
    $('btnLocate').classList.remove('busy');
    const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
    if (!MAXB.contains(ll)) return toast('You are outside the London area this guide covers');
    if (meMarker) map.removeLayer(meMarker);
    ME = ll; meMarker = L.layerGroup([L.circle(ll, { radius: Math.max(pos.coords.accuracy || 20, 10), interactive: false, color: '#0a84ff', weight: 1, fillOpacity: .12 }),
      L.circleMarker(ll, { radius: 7, interactive: false, color: '#fff', weight: 3, fillColor: '#0a84ff', fillOpacity: 1 })]).addTo(map);
    map.setView(ll, 17, { animate: false });
    whenLoaded(ll.toBounds(300), () => {
      if (analyse(ll).cls) return showFramed(ll);                    // standing on something we know about
      const sn = snapToRoad(ll.lat, ll.lng, 120);                    // otherwise the nearest road, and say so
      if (!sn) { showFramed(ll); return toast('No mapped road within 120 m of you'); }
      showFramed(sn.ll); LAST.pre = `Nearest road, ${Math.max(1, Math.round(sn.d))} m from you · `; LAST.sub = LAST.pre + LAST.sub; setHead({ tone: LAST.tone, title: LAST.title, sub: LAST.sub });
    });
  }, err => { $('btnLocate').classList.remove('busy'); toast(err.code === 1 ? 'Location permission was declined' : 'Could not get your location'); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 });
};
// ---- native share sheet on phones ----
sbody.addEventListener('click', e => {
  const b = e.target.closest('[data-act="share"]'); if (!b || !navigator.share || !LAST) return;
  e.stopImmediatePropagation();
  navigator.share({ title: LAST.title, text: `${LAST.title}: ${LAST.sub}`, url: spotUrl() }).catch(() => {});
}, true);

// ---- nearby list (Parkopedia-style list view), nearest first, judged for the chosen stay ----
function nearStatus(m) {
  const st = pinState(m), b = BAY[m.t];
  if (m.t === 'permit') return st === 'run' ? ['warn', 'Permit zone running: permit holders only'] : st === 'off' ? ['info', 'Permit zone off for your stay. Check signs.'] : ['mute', 'Permit bay, zone hours not listed'];
  if (m.t === 'customer' || m.t === 'carpark' || m.t === 'private') { const lim = landInfo({ n: m.name, op: m.op })[2]; return st === 'run' ? ['warn', `Limit about ${durText(lim)}, shorter than your stay`] : ['mute', lim ? `Limit about ${durText(lim)}` : 'Owner\'s rules apply']; }
  return ['mute', b.who];
}
function showNearby() {
  const o = ME || (LAST && LAST.latlng) || map.getCenter(), from = ME ? 'you' : LAST ? 'the spot you picked' : 'the map centre';
  const list = D.markers.filter(m => m.t !== 'cycle').map(m => [m, o.distanceTo(L.latLng(m.lat, m.lon))]).filter(x => x[1] <= 450).sort((a, b) => a[1] - b[1]).slice(0, 30);
  setHead({ tone: 'home', title: 'Nearby spots', sub: `Within 450 m of ${from}` });
  setBody(`<div class="segbar"><span class="who">Judged for ${whenText(WHEN)}, ${durText(DUR)}</span><button id="guideDone" class="done">Done</button></div>` +
    (list.length ? `<div class="group flush">${list.map(([m, d]) => { const s = nearStatus(m), b = BAY[m.t], name = m.name || (m.st && !/^Unnamed/.test(m.st) ? m.st : b.label);
      return `<button class="nav near" data-near="${m.lat},${m.lon}">${symbolSVG(m.t, 30)}<span><b>${name}</b>${m.n > 1 ? ` <small>${m.n} ${m.t === 'ev' ? 'points' : 'bays'}</small>` : ''}<br><small class="st-${s[0]}">${s[1]}</small></span><em>${walkMin(d)} min<small>${Math.round(d)} m</small></em></button>`; }).join('')}</div>`
      : '<p class="lead">No mapped bays or car parks within 450 m. Zoom the map to where you are, or try another spot.</p>'), 'list');
  setDetent('half'); $('clearbtn').hidden = false;
}
// ---- plan chip under the search box: always shows the time and stay being judged ----
(function () {
  const c = document.createElement('button'); c.id = 'planchip'; c.className = 'glass'; c.setAttribute('aria-label', 'Change the time and length of stay');
  c.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><b></b>';
  $('mapwrap').appendChild(c);
  c.onclick = () => { $('timeBox').classList.add('tm-open'); $('moreTime').textContent = 'Done'; $('moreTime').setAttribute('aria-expanded', 'true'); if (sheetDetent() === 'peek') setDetent(MODE === 'spot' ? 'fit' : 'half'); else setDetent(sheetDetent()); };
  applyTime();
})();
