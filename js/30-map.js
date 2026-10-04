/* Map, layers and tile loading.
   Polish rules: hierarchy by weight (TfL > Newham > private > fine lanes), soft casing on every road, symbols scale with zoom and
   yield when they collide, fine detail only when zoomed in. Roads, land and zones are not interactive: every click goes to the sheet.
   Data arrives in tiles (tiles/t_x_y.js) as the map moves, so the page scales to the whole borough. */
const LCOL = { retail: '#8a5bb0', carpark: '#8a5bb0', industrial: '#7a5f4a', commercial: '#7a5f4a', dlr: '#1b8a99', brownfield: '#888', estate: '#3a8a40' };
const LLAB = { retail: 'Private retail land', carpark: 'Private car park', industrial: 'Private industrial land',
  commercial: 'Private business park', dlr: 'DLR operational land', brownfield: 'Private brownfield site, no public parking', estate: 'Newham council estate land' };
const LTXT = [
  [/Gallions Reach Shopping Park/i, 'Managed by UKPC with ANPR. Free up to 4 hours, no extension. Closes midnight, 2 m height limit. PureGym night visitors (12am to 5:30am) must register their vehicle on the gym tablet.', 240],
  [/Gateway/i, 'The centre says free for 3 hours before 11pm, then 30 minutes maximum from 11pm to 6am. 660+ spaces, entered from Royal Docks Road onto Claps Gate Lane. The operator is not named on its page, so read the entrance signs.', 180],
  [/Depot/i, 'DLR depot and works site. Operational land, no public parking.'],
  [/Gas Works/i, 'Former gas works. Private brownfield land awaiting redevelopment.'],
  [/London City Airport/i, 'Airport staff car park, private permit use.'],
  [/Lidl|Tesco/i, 'Customer car park (free, customers only, per OpenStreetMap). Terms are on the entrance signs.'],
  [/London Industrial Park|Gemini/i, 'Private estate roads and yards. The landlord or estate manager sets and enforces the rules.']
];
const landInfo = a => LTXT.find(t => t[0].test((a.n || '') + ' ' + (a.op || ''))) || [0, 'Private land. The owner sets and enforces the rules.'];
const landNote = a => landInfo(a)[1];

const COARSE = matchMedia('(pointer:coarse)').matches;
const DARK = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches;
const map = L.map('map', { preferCanvas: true, zoomControl: false, zoomSnap: .5, zoomDelta: .5, wheelPxPerZoomLevel: 90 }).fitBounds([[51.5030, 0.0630], [51.5215, 0.0885]]);
L.control.zoom({ position: 'bottomright' }).addTo(map);
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/';
const ATTR = 'Tiles &copy; Esri. Roads &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (ODbL). Zones and highway boundary: Newham Council (OGL v3). Contains HM Land Registry data &copy; Crown copyright. Powered by TfL Open Data.';
const canvas = k => L.layerGroup([L.tileLayer(ESRI + `Canvas/World_${k}_Base/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 16, attribution: ATTR }),
  L.tileLayer(ESRI + `Canvas/World_${k}_Reference/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 19, maxNativeZoom: 16, pane: 'shadowPane' })]);
const BASES = { Light: canvas('Light_Gray'), Dark: canvas('Dark_Gray'),
  Streets: L.tileLayer(ESRI + 'World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: ATTR }),
  Satellite: L.tileLayer(ESRI + 'World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: ATTR }) };
let curBase = null, tileFails = 0, tileNote = 0;
function onTileErr() { if (++tileFails > 3 && Date.now() - tileNote > 60000) { tileNote = Date.now(); if (typeof toast === 'function') toast('No signal for the map background. Roads and rules still work.'); } }
Object.values(BASES).forEach(b => (b.eachLayer ? b.eachLayer(l => l.on('tileerror', onTileErr)) : b.on('tileerror', onTileErr)));
const TG = {}, TS = {}, TR = {};   // per-tile layer groups, tile state, tile roads (declared early: setBase restyles)
const FOG = {};          // fog cells still covering unloaded tiles (declared early: setBase restyles them)
function setBase(n) { if (curBase) map.removeLayer(BASES[curBase]); curBase = n; BASES[n].addTo(map); if (window.restyleRoads) restyleRoads(true); if (window.restyleFog) restyleFog(); }
setBase(DARK ? 'Dark' : 'Light');

['land', 'casing', 'roads', 'kerb', 'bays', 'fog', 'hl'].forEach((n, i) => { map.createPane(n); map.getPane(n).style.zIndex = 410 + i * 10; });
map.getPane('hl').style.pointerEvents = 'none';
map.getPane('fog').style.pointerEvents = 'none'; map.getPane('fog').style.filter = COARSE ? 'none' : 'blur(12px)';   // CSS blur over a full-screen pane is too heavy for phone GPUs
   // soft, misty edges between areas
const G = {}; ['hl', 'london', 'fog'].forEach(k => G[k] = L.layerGroup());
/* Per-tile layer groups. Leaflet re-projects EVERY layer on the map at each zoom, so keeping all ~50k layers on the map caused
   1 to 2 second stalls. Now a tile's groups are on the map only while the tile is near the view (see cull). */
const KINDS = ['tfl', 'newham', 'private', 'other', 'm_newham', 'm_private', 'm_other', 'strip', 'cas', 'fine', 'land', 'kerb', 'kstop', 'shapes', 'markers', 'cycle'];
/* A layer group that hands its layers to the map a few milliseconds per frame instead of all at once, so crossing a zoom level
   that brings in thousands of lines never freezes the page. */
const ADDQ = []; let addI = 0, pumping = false;
function pump() {
  const t0 = performance.now();
  while (addI < ADDQ.length && performance.now() - t0 < 7) { const [g, m, l] = ADDQ[addI++]; if (g._map === m && !m.hasLayer(l)) m.addLayer(l); }
  if (addI < ADDQ.length) requestAnimationFrame(pump); else { ADDQ.length = 0; addI = 0; pumping = false; requestAnimationFrame(declutter); }
}
const Staged = L.LayerGroup.extend({ onAdd(m) { this.eachLayer(l => ADDQ.push([this, m, l])); if (!pumping) { pumping = true; requestAnimationFrame(pump); } } });
function tg(k) { if (!TG[k]) { TG[k] = {}; KINDS.forEach(n => TG[k][n] = new Staged()); TS[k] = { vis: false, zs: null }; } return TG[k]; }
const NI = { interactive: false };
const MAXB = L.latLngBounds([[51.43, -0.13], [51.63, 0.20]]);
map.setMaxBounds(MAXB); map.options.maxBoundsViscosity = .9;
Object.assign(D, { roads: [], land: [], markers: [], klines: [], bayShapes: [], tfl30: [] });   // filled tile by tile

// ---- Newham boundary: light dashed edge, barely-there tint ----
const areaLayer = L.layerGroup((D.area || []).map(r => L.polygon(r, { ...NI, pane: 'land', color: '#5b6b7e', weight: 1.3, opacity: .5, dashArray: '7 6', fillColor: '#5b6b7e', fillOpacity: .025, lineJoin: 'round' }))).addTo(map);

// ---- roads ----
const BASEW = { tfl: 5, newham: 3.6, private: 2.2, other: 2 };
const zscale = z => z <= 14 ? .65 : z <= 15 ? .8 : z <= 16 ? 1 : z <= 17 ? 1.3 : 1.65;
const isFine = r => r.h === 'service' && /^Unnamed/.test(r.n);
/* Roads are drawn as batches: one multi-line layer per tile, class and width, instead of one layer per road. The canvas then makes a
   handful of stroke calls per tile rather than thousands, which is what keeps panning smooth at 12,000 roads. */
const wkOf = r => isFine(r) ? 'f' : ((r.h === 'primary' || r.h === 'trunk') && r.c === 'newham') ? 'p' : 'n';
const bweight = (c, wk, z) => (wk === 'f' ? 1.3 : BASEW[c] + (wk === 'p' ? .8 : 0)) * zscale(z);
const darkBase = () => curBase === 'Dark' || curBase === 'Satellite';
const casingStyle = (c, wk) => ({ color: darkBase() ? '#0b0b0d' : '#ffffff', opacity: darkBase() ? .6 : .85, weight: bweight(c, wk, map.getZoom()) + 2.4 });
/* Level of detail: at overview zooms only main roads are drawn (about a fifth of the layers), side streets join at zoom 15. */
const MAJOR = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link']);
const roadKind = r => r.c === 'tfl' || MAJOR.has(r.h) ? r.c : 'm_' + r.c;
function addBatch(b) {
  const T = tg(b.k), z = map.getZoom();
  b.layer = L.polyline(b.g, b.cas ? { ...NI, pane: 'casing', lineCap: 'round', lineJoin: 'round', ...casingStyle(b.c, b.wk) }
    : { ...NI, pane: 'roads', color: COL[b.c], weight: bweight(b.c, b.wk, z), opacity: b.wk === 'f' ? .6 : .95, lineCap: 'round', lineJoin: 'round' });
  (TR[b.k] || (TR[b.k] = [])).push(b);
  (b.cas ? T.cas : T[b.kind]).addLayer(b.layer);
}
/* Restyle only batches on tiles that are on the map, and only when the zoom bucket (or basemap) changed since last time. */
function restyleRoads(force) {
  if (!window.__mapReady) return;                   // setBase runs before the road styles are defined
  const z = map.getZoom(), sc = zscale(z);
  if (force) Object.values(TS).forEach(t => t.zs = null);
  Object.keys(TR).forEach(k => {
    const t = TS[k]; if (!t || !t.vis || t.zs === sc) return;
    TR[k].forEach(b => b.layer.setStyle(b.cas ? casingStyle(b.c, b.wk) : { weight: bweight(b.c, b.wk, z) }));
    t.zs = sc;
  });
}

function addLand(a) {
  const col = LCOL[a.k] || '#888', bf = a.k === 'brownfield';
  tg(a._k).land.addLayer(L.polygon(a.g, { ...NI, pane: 'land', color: col, weight: 1, opacity: .45, fillColor: col, fillOpacity: bf ? .05 : .1, dashArray: bf ? '2 5' : null, lineJoin: 'round' }));
}
function addKerb(k) {
  [L.polyline(k.g, { ...NI, pane: 'kerb', color: darkBase() ? '#0b0b0d' : '#fff', weight: 4.4, opacity: .7, lineCap: 'round' }),
    L.polyline(k.g, { ...NI, pane: 'kerb', color: LINE[k.k].color, weight: 2.4, opacity: 1, lineCap: 'round' })].forEach(l => (k.k === 'stop' ? tg(k._k).kstop : tg(k._k).kerb).addLayer(l));
}
function bayPopup(m) {
  const b = BAY[m.t];
  const where = m.c ? ((m.st && !/^Unnamed/.test(m.st)) ? `${m.st} (${LBL[m.c]})` : `Side road or access lane (${LBL[m.c]})`) : (m.parcel || m.op || 'private land');
  const unit = m.t === 'ev' ? 'charge points' : m.t === 'cycle' ? 'spaces' : 'bays';
  let h = `<div class="pop"><div class="poph">${symbolSVG(m.t, 32)}<div><b>${b.label}</b><div class="who">${m.n > 1 ? m.n + ' ' + unit : '1 space'}</div></div></div>`;
  h += `<p><b>Where:</b> ${where}</p><p>${b.what}</p>`;
  if (m.t === 'permit') h += `<p><b>Zone:</b> ${zoneStatus(m.z)}</p>${m.pbp ? '<p class="warn">Newham lists pay-by-phone or limited-stay bays on this street. Check the bay sign.</p>' : ''}`;
  if (m.name) h += `<p><b>Name:</b> ${m.name}</p>`;
  if (m.op) h += `<p><b>Operator:</b> ${m.op}</p>`;
  if (m.mx) h += `<p><b>Max stay:</b> ${m.mx}${m.mxc ? ', then ' + m.mxc.replace('@', 'at') : ''}</p>`;
  return h + `<p class="who"><b>Rule set by:</b> ${b.who}<br><b>Confidence:</b> ${b.conf}</p></div>`;
}
const allMarkers = [];
function addMarker(m) {
  const mk = L.marker([m.lat, m.lon], { icon: bayIcon(m), pane: 'bays', riseOnHover: true }).bindPopup(() => bayPopup(m), { maxWidth: Math.min(300, innerWidth - 70), autoPanPaddingTopLeft: [10, 70], autoPanPaddingBottomRight: [10, 170] });
  mk.on('add', () => {
    applyIdle(mk, m); requestAnimationFrame(declutter);
    const bi = mk.getElement() && mk.getElement().firstChild, c = map.latLngToContainerPoint(mk.getLatLng()), s = map.getSize();
    if (bi) bi.style.animationDelay = Math.round(Math.min(520, Math.hypot(c.x - s.x / 2, c.y - s.y / 2) * .45)) + 'ms';
  });
  allMarkers.push([mk, m]);
  (m.t === 'cycle' ? tg(m._k).cycle : tg(m._k).markers).addLayer(mk);
}
const PRIO = { disabled: 7, ev: 6, permit: 5, customer: 4, private: 3, carpark: 2, taxi: 2, cycle: 1 };
function declutter() {
  const z = map.getZoom(), gap = z >= 18 ? 0 : z >= 17 ? 17 : z >= 16 ? 21 : 24, shown = [], b = map.getBounds().pad(.1);
  allMarkers.filter(([mk]) => mk._map && b.contains(mk.getLatLng())).sort((a, c) => PRIO[c[1].t] - PRIO[a[1].t] || c[1].n - a[1].n).forEach(([mk, m]) => {
    const el = mk.getElement(); if (!el) return;
    const p = map.latLngToLayerPoint(mk.getLatLng()), hide = gap > 0 && shown.some(q => Math.hypot(q.x - p.x, q.y - p.y) < gap);
    if (!hide) shown.push(p);
    el.classList.toggle('dh', hide);
  });
}

// ---- tile loader ----
const TIDX = D.tileIndex, TSET = new Set(TIDX.tiles.map(t => t[0] + '_' + t[1])), TLOADED = new Set(), TLOADING = new Set(), WAIT = [];
const MINZ = 14;
function tilesFor(bounds) {
  const out = [], x0 = Math.floor((bounds.getWest() - TIDX.W) / TIDX.dlon), x1 = Math.floor((bounds.getEast() - TIDX.W) / TIDX.dlon);
  const y0 = Math.floor((bounds.getSouth() - TIDX.S) / TIDX.dlat), y1 = Math.floor((bounds.getNorth() - TIDX.S) / TIDX.dlat);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (TSET.has(x + '_' + y)) out.push([x, y]);
  return out;
}
// ---- fog of war: every data tile starts under mist and the mist lifts when that tile's data arrives ----
const fogRenderer = L.svg({ pane: 'fog' });
const fogStyle = () => ({ fillColor: darkBase() ? '#04060a' : '#44505f', fillOpacity: darkBase() ? .55 : .4 });
TIDX.tiles.forEach(([gx, gy]) => {
  const s = TIDX.S + gy * TIDX.dlat, w = TIDX.W + gx * TIDX.dlon;
  FOG[gx + '_' + gy] = L.rectangle([[s, w], [s + TIDX.dlat, w + TIDX.dlon]], { renderer: fogRenderer, interactive: false, stroke: false, ...fogStyle() });
  G.fog.addLayer(FOG[gx + '_' + gy]);
});
function restyleFog() { Object.values(FOG).forEach(p => p.setStyle(fogStyle())); }
function liftFog(k) {
  const p = FOG[k]; if (!p) return; delete FOG[k];
  const el = p.getElement && p.getElement();
  if (!el) { G.fog.removeLayer(p); return; }
  const c = map.getCenter(), b = p.getBounds().getCenter(), d = Math.min(1, c.distanceTo(b) / 6000);   // nearer areas clear first
  el.classList.remove('fog-loading');
  el.style.transition = 'opacity 1.3s cubic-bezier(.22,.61,.36,1) ' + Math.round(d * 380) + 'ms'; el.style.opacity = 0;
  setTimeout(() => G.fog.removeLayer(p), 1800);
}
function fogCount() { const el = document.getElementById('fogcount'); if (el) el.textContent = `Revealed ${TLOADED.size} of ${TSET.size} areas`; }
const DRAWQ = [], PEND = {}; let draining = false;
const KRANK = { tfl: 0, newham: 1, m_newham: 2, private: 3, m_private: 3, other: 4, m_other: 4, fine: 5 };
function drain() {
  const t0 = performance.now();
  while (DRAWQ.length && performance.now() - t0 < 9) {
    const b = DRAWQ.pop(); addBatch(b);
    if (--PEND[b.k] === 0) { liftFog(b.k); fogCount(); }
  }
  if (DRAWQ.length) requestAnimationFrame(drain); else draining = false;
}
function queueRoads(k, list) {
  const m = {};
  list.forEach(r => {
    const wk = wkOf(r), kind = wk === 'f' ? 'fine' : roadKind(r);
    (m[kind + wk + r.c] || (m[kind + wk + r.c] = { k, kind, wk, c: r.c, g: [] })).g.push(r.g);
    if (wk !== 'f') (m['cas' + wk + r.c] || (m['cas' + wk + r.c] = { k, kind: 'cas', cas: true, wk, c: r.c, g: [] })).g.push(r.g);
  });
  const bs = Object.values(m); if (!bs.length) { liftFog(k); return; }
  PEND[k] = bs.length;
  DRAWQ.push(...bs); DRAWQ.sort((a, b) => KRANK[b.cas ? 'tfl' : b.kind] - KRANK[a.cas ? 'tfl' : a.kind]);      // pop() takes the most important first
  if (!draining) { draining = true; requestAnimationFrame(drain); }
}
window.__tile = (gx, gy, d) => {
  const k = gx + '_' + gy; TLOADING.delete(k); TLOADED.add(k); fogCount();
  document.getElementById('loadhint').classList.toggle('show', TLOADING.size > 0 && map.getZoom() >= MINZ);
  (d.r || []).forEach(r => D.roads.push(r)); queueRoads(k, d.r || []);
  (d.s || []).forEach(s => { D.tfl30.push(s); tg(k).strip.addLayer(L.polyline(s.g, { ...NI, pane: 'roads', color: COL.tfl, weight: 6, opacity: .25, dashArray: '1 7', lineCap: 'round' })); });
  (d.l || []).forEach(a => { a._k = k; D.land.push(a); addLand(a); });
  (d.m || []).forEach(m => { m._k = k; D.markers.push(m); addMarker(m); });
  (d.b || []).forEach(b => { D.bayShapes.push(b); tg(k).shapes.addLayer(L.polygon(b.g, { ...NI, pane: 'bays', color: '#fff', weight: .7, opacity: .9, fillColor: BAY[b.t].color, fillOpacity: .72, lineJoin: 'round' })); });
  (d.k || []).forEach(kk => { kk._k = k; D.klines.push(kk); addKerb(kk); });
  tg(k); cull(); if (window.applyTime) applyTime();
  WAIT.splice(0).forEach(w => { if (w.tiles.every(t => TLOADED.has(t[0] + '_' + t[1]))) w.cb(); else WAIT.push(w); });
};
function loadTiles(bounds) {
  const need = tilesFor(bounds).filter(t => !TLOADED.has(t[0] + '_' + t[1]) && !TLOADING.has(t[0] + '_' + t[1]));
  need.forEach(([x, y]) => {
    const k = x + '_' + y; TLOADING.add(k);
    const fe = FOG[k] && FOG[k].getElement && FOG[k].getElement(); if (fe) fe.classList.add('fog-loading');
    const s = document.createElement('script'); s.src = `tiles/t_${x}_${y}.js`; s.onerror = () => TLOADING.delete(k); document.body.appendChild(s);
  });
  document.getElementById('loadhint').classList.toggle('show', TLOADING.size > 0 && map.getZoom() >= MINZ);
}
/* run cb once every tile covering `bounds` is in; used by search and share links */
function whenLoaded(bounds, cb) {
  const t = tilesFor(bounds); loadTiles(bounds);
  if (t.every(x => TLOADED.has(x[0] + '_' + x[1]))) cb(); else WAIT.push({ tiles: t, cb });
}
const tilesReady = latlng => { const k = Math.floor((latlng.lng - TIDX.W) / TIDX.dlon) + '_' + Math.floor((latlng.lat - TIDX.S) / TIDX.dlat); return TLOADED.has(k) || !TSET.has(k); };

// ---- London-wide TfL Red Routes, loaded on demand ----
let londonState = 0;
window.__tfl = rows => { rows.forEach(r => G.london.addLayer(L.polyline(r[2], { ...NI, pane: 'casing', color: COL.tfl, weight: 2.4, opacity: .75, lineCap: 'round' }))); londonState = 2; sync(); };
function loadLondon() { if (londonState) return; londonState = 1; const s = document.createElement('script'); s.src = 'tiles/tfl_london.js'; s.onerror = () => { londonState = 0; }; document.body.appendChild(s); }

let zoneLayer = null; const ZP = {};
function restyleZones() {
  if (!zoneLayer) return;
  Object.entries(ZP).forEach(([i, p]) => { const ov = zoneOverlap(+i, WHEN, DUR), run = ov && ov.length; p.setStyle(run ? { fillColor: '#f29f05', fillOpacity: .2, color: '#f29f05', weight: 1, opacity: .5 } : { fillColor: '#0a84ff', fillOpacity: .05, color: '#0a84ff', weight: 1, opacity: .25 }); });
}
const ON = { zones: false, roads: true, bays: true, kerb: true, land: true, area: true, cycle: false, london: false, fog: true };
const tileBox = k => { const [x, y] = k.split('_').map(Number), s0 = TIDX.S + y * TIDX.dlat, w0 = TIDX.W + x * TIDX.dlon; return L.latLngBounds([s0, w0], [s0 + TIDX.dlat, w0 + TIDX.dlon]); };
const TBOX = {};
/* Which kinds are drawn at this zoom. Casings wait for zoom 15: they double the layer count and are invisible at overview scale. */
const kindOn = z => ({ tfl: ON.roads && z >= MINZ, newham: ON.roads && z >= MINZ, private: ON.roads && z >= MINZ, other: ON.roads && z >= MINZ, m_newham: ON.roads && z >= 15, m_private: ON.roads && z >= 15, m_other: ON.roads && z >= 15, strip: ON.roads && z >= MINZ,
  cas: ON.roads && z >= (COARSE ? 16 : 15), fine: ON.roads && z >= 17, land: ON.land && z >= MINZ, markers: ON.bays && z >= 15, shapes: ON.bays && z >= 17,
  kerb: ON.kerb && z >= 16, kstop: ON.kerb && z >= 18, cycle: ON.cycle && z >= 16.5 });
function cull() {
  const z = map.getZoom(), view = map.getBounds().pad(.35), on = kindOn(z);
  Object.keys(TG).forEach(k => {
    const box = TBOX[k] || (TBOX[k] = tileBox(k)), inView = box.intersects(view);
    TS[k].vis = inView && on.tfl;
    KINDS.forEach(n => { const g = TG[k][n], want = inView && on[n], has = map.hasLayer(g); if (want && !has) g.addTo(map); else if (!want && has) map.removeLayer(g); });
  });
  restyleRoads(); requestAnimationFrame(declutter);
}
function sync() {
  const z = map.getZoom(), set = (g, on) => on ? g.addTo(map) : map.removeLayer(g);
  if (ON.zones && !zoneLayer) { zoneLayer = L.layerGroup(D.zones.map(z => (ZP[z.i] = L.polygon(z.g, { ...NI, pane: 'land', lineJoin: 'round' })))); restyleZones(); }
  if (zoneLayer) set(zoneLayer, ON.zones);
  set(areaLayer, ON.area); set(G.hl, true); set(G.fog, ON.fog); fogCount(); document.getElementById('fogcount').hidden = !ON.fog;
  set(G.london, ON.london && londonState === 2); if (ON.london) loadLondon();
  map.setMaxBounds(ON.london ? null : MAXB);                       // can't fling the map out to sea, unless the London layer is on
  document.getElementById('zoomhint').classList.toggle('show', z < MINZ);
  document.getElementById('map').style.setProperty('--bs', z <= 15 ? .78 : z <= 16 ? .88 : z <= 17 ? 1 : 1.15);
  cull();
}
map.on('moveend', () => { if (map.getZoom() >= MINZ) loadTiles(map.getBounds().pad(.25)); cull(); });
map.on('zoomend', sync);
if (map.getZoom() >= MINZ) loadTiles(map.getBounds().pad(.25)); sync();
window.__mapReady = true; restyleRoads(true);
