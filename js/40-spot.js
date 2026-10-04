/* Working out what a tapped spot is, and describing it (Clarity: one verdict, details on demand). */
const KX = 111320 * Math.cos(51.51 * Math.PI / 180), KY = 110574;
const xy = (lat, lon) => [lon * KX, lat * KY];
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
function lineDist(p, g) {
  let best = 1e9;
  for (let i = 1; i < g.length; i++) best = Math.min(best, segDist(p, g[i - 1].xy || (g[i - 1].xy = xy(...g[i - 1])), g[i].xy || (g[i].xy = xy(...g[i]))));
  return best;
}
function inPoly(lat, lon, ring) {
  let ins = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i], [yj, xj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}
function nearestRoad(lat, lon, maxd) {
  const p = xy(lat, lon); let best = null, bd = maxd;
  D.roads.forEach(r => { const d = lineDist(p, r.g); if (d < bd) { bd = d; best = r; } });
  return best ? { r: best, d: bd } : null;
}
/* Closest point on any road within maxd metres. Used by "Check where I am": a GPS fix is rarely exactly on the carriageway. */
function snapToRoad(lat, lon, maxd) {
  const p = xy(lat, lon); let best = null, bd = maxd;
  D.roads.forEach(r => {
    const g = r.g;
    for (let i = 1; i < g.length; i++) {
      const a = g[i - 1].xy || (g[i - 1].xy = xy(...g[i - 1])), b = g[i].xy || (g[i].xy = xy(...g[i]));
      const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
      const d = Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
      if (d < bd) { bd = d; best = [(a[1] + t * dy) / KY, (a[0] + t * dx) / KX]; }
    }
  });
  return best ? { ll: L.latLng(best[0], best[1]), d: bd } : null;
}
function landAt(lat, lon) {
  const order = ['carpark', 'retail', 'commercial', 'industrial', 'dlr', 'estate', 'brownfield'];
  const hits = D.land.filter(a => inPoly(lat, lon, a.g));
  hits.sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k));
  return hits[0] || null;
}
const first = t => (t || '').toLowerCase().replace(/[^a-z ]/g, '').trim().split(/\s+/)[0];
/* pay-by-phone rows for a street; when the zone is known its first word must also match, because street names repeat across the borough */
function pbpFor(road, zid) {
  const rows = D.paybyphone.filter(x => x.street.replace(/ \d+$/, '').toLowerCase() === road.n.toLowerCase());
  const z = ZI[zid]; return z ? rows.filter(x => first(x.zone) === first(z.n)) : rows;
}
function zoneOverlapClock(m0, dur, a, b) { for (let t = m0; t < m0 + dur; t += 15) { const m = t % 1440; if (m >= a || m < b - 1440) return true; } return false; }
const zoneAt = (lat, lon) => { const z = D.zones.find(z => z.g.some(r => inPoly(lat, lon, r))); return z ? z.i : null; };

const CONF = {
  tfl: 'Official. TfL roads come from the TfL road list in Newham\'s parking policy and the OpenStreetMap operator tag.',
  newham: 'The road follows Newham\'s adopted-highway map, so the council side is solid. Bays are inferred from the zone, because public map data has no per-bay signs.',
  private: 'No adopted-highway boundary was found, so this is probably private, but newer adoptions can be missing. Ask Newham Highways for its street gazetteer entry to be sure.',
  other: 'The road is outside Newham\'s borough boundary.'
};

function analyse(latlng) {
  const { lat, lng } = latlng, p = xy(lat, lng);
  const mpp = 156543 * Math.cos(lat * Math.PI / 180) / Math.pow(2, map.getZoom()), tol = Math.max(8, Math.min(48, (matchMedia('(pointer:coarse)').matches ? 22 : 14) * mpp));   // ~14 px, so a click well away from any road is a click away
  const nr = nearestRoad(lat, lng, tol), land = landAt(lat, lng), road = nr && nr.r;
  const bays = D.markers.filter(m => m.t !== 'cycle' && Math.hypot(xy(m.lat, m.lon)[0] - p[0], xy(m.lat, m.lon)[1] - p[1]) < 45);
  const kerb = []; D.klines.forEach(k => { if (lineDist(p, k.g) < 14 && !kerb.find(x => x.k === k.k)) kerb.push(k); });
  const landMode = !!land && (!road || road.c === 'private' || nr.d > 14);
  const cls = landMode ? 'private' : road ? road.c : null;
  const M = { latlng, road, land, landMode, cls, bays, kerb, zid: null, tone: 'mute', title: 'Nothing mapped here', text: 'No road or private land at that point. Tap on a road.' };
  const m0 = minsOf(WHEN), stayTxt = `${hhmm(m0)} to ${hhmm(m0 + DUR)}`;
  if (landMode) {
    const info = landInfo(land); Object.assign(M, { tone: 'warn', title: 'Private: owner\'s rules', text: info[1] });
    const night = /Gateway/i.test(land.n || '') && zoneOverlapClock(m0, DUR, 1380, 1800);       // 23:00 to 06:00
    if (night && DUR > 30) Object.assign(M, { tone: 'bad', title: 'Over the night limit', text: `Your stay (${stayTxt}) falls between 11pm and 6am, when this car park allows 30 minutes. ${info[1]}` });
    else if (info[2] && DUR > info[2]) Object.assign(M, { tone: 'bad', title: 'Longer than the limit', text: `This car park allows about ${durText(info[2])}, and your stay is ${durText(DUR)}. Overstaying risks a private Parking Charge Notice. ${info[1]}` });
  } else if (cls === 'tfl') Object.assign(M, { tone: 'bad', title: 'Red Route: no stopping', text: 'This is a TfL Red Route. Double red: never stop. Single red: only in the hours on the plate. Loading and Blue Badge set-down are allowed where signed.' });
  else if (cls === 'newham') {
    M.zid = road.z != null ? road.z : zoneAt(lat, lng);
    const ov = zoneOverlap(M.zid, WHEN, DUR);
    if (ov === null) Object.assign(M, { tone: 'mute', title: 'Newham road', text: 'Newham controls the parking here. Read the signs.' });
    else if (ov.length) {
      const from = ov[0][0] <= m0 ? 'for the whole of it' : `from ${hhmm(ov[0][0])}`;
      Object.assign(M, { tone: 'warn', title: 'Permit holders only', text: `The permit zone is running during your ${stayWord()} stay (${stayTxt}), ${from}. Permit bays are for permit holders then. Pay-by-phone and limited-stay bays are signed separately. Never park on yellow lines in their hours.` });
    } else Object.assign(M, { tone: 'info', title: 'Permit zone is off', text: `The permit zone is not running during your ${stayWord()} stay (${stayTxt}), so permit bays are usually open to anyone. That is not a green light: check the lines and signs.` });
  } else if (cls === 'private') Object.assign(M, { tone: 'warn', title: 'Private: owner\'s rules', text: 'This road is outside Newham\'s adopted highway as far as the data shows. Parking is set by the owner or management company.' });
  else if (cls === 'other') Object.assign(M, { tone: 'mute', title: 'Another borough', text: 'This is outside Newham, so Newham\'s rules do not apply.' });
  M.place = landMode ? (land.n || LLAB[land.k]) : road ? road.n + (road.ref ? ' (' + road.ref + ')' : '') : 'Unmapped';
  M.sub = cls ? `${/^Unnamed/.test(M.place) ? 'Side road' : M.place} · ${landMode && land.op ? land.op : ENFORCER[cls]}` : 'Try a road or car park';
  M.pbp = road && !landMode ? pbpFor(road, M.zid) : [];
  const cap = Math.min(...M.pbp.map(x => parseMax(x.max)).filter(Boolean));
  if (isFinite(cap) && DUR > cap) { M.text += ` Pay-by-phone bays on this street allow at most ${durText(cap)}, shorter than your stay.`; if (M.tone === 'ok' || M.tone === 'info') M.tone = 'warn'; }
  return M;
}

const item = (icon, title, badge, inner) =>
  `<div class="item">${icon}<div class="ib"><div class="it"><b>${title}</b>${badge ? `<span class="tag">${badge}</span>` : ''}</div>${inner}</div></div>`;
const row = (k, v) => v ? `<div class="row"><span>${k}</span><b>${v}</b></div>` : '';
const bayFacts = ms => ms.map(m => [m.st && !/^Unnamed/.test(m.st) ? m.st : null, m.name, m.op ? 'Operator: ' + m.op : null, m.mx ? 'Max stay: ' + m.mx + (m.mxc ? ', then ' + m.mxc.replace('@', 'at') : '') : null].filter(Boolean).join(' · ')).filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 4);

/* Evidence from several sources, with how many agree. Sources vote adopted (+) or private (-); a vote agrees if it matches the class shown. */
function sureBox(M) {
  const ev = M.road && !M.landMode && M.road.ev && M.road.ev.length ? M.road.ev.map(t => ({ s: D.xstats.evS[t[0]], v: t[1], t: D.xstats.evT[t[2]] })) : null;
  if (!ev) return `<div class="sure"><b>${M.cls === 'tfl' ? 'Official' : 'Inferred'}.</b> ${CONF[M.cls]} The sign on the street always wins.</div>`;
  const want = M.cls === 'private' ? -1 : 1, voters = ev.filter(e => e.v !== 0), agree = voters.filter(e => e.v === want).length;
  const lvl = { high: 'High confidence', medium: 'Medium confidence', low: 'Low confidence' }[M.road.cf] || '';
  const head = M.cls === 'tfl' ? `${ev.filter(e => e.v > 0).length} of ${ev.length} sources confirm it is TfL`
    : `${agree} agree, ${voters.length - agree} disagree (${M.cls === 'private' ? 'private' : 'adopted'} chosen)`;
  return `<h5>How sure is this?</h5><div class="group"><div class="row stack"><b>${lvl ? lvl + ': ' : ''}${head}</b></div>` +
    ev.map(e => `<div class="ev"><i class="vt ${e.v === 0 ? 'n' : e.v === want ? 'y' : 'x'}">${e.v === 0 ? '–' : e.v === want ? '✓' : '!'}</i><div class="evt"><b>${e.s}:</b> <span class="who">${e.t}</span></div></div>`).join('') +
    `<p class="who pad">${CONF[M.cls]} The sign on the street always wins.</p></div>`;
}

/* Everything on one card: no tap-to-expand, the sheet grows to fit (see setDetent('fit')). */
/* three quick facts under the headline: zone state, what changes next, what a ticket costs */
function factStrip(M) {
  const cell = (k, v, s) => `<div class="fact"><small>${k}</small><b>${v}</b>${s ? `<span>${s}</span>` : ''}</div>`;
  let a, b, c = ['Ticket', { tfl: '\u00a3160', newham: '\u00a380 to \u00a3130', private: 'Private charge', other: 'Set by that borough' }[M.cls] || '', ''];
  if (M.cls === 'tfl') { a = ['Stopping', 'Banned', 'unless the plate says so']; b = ['Loading', 'Check plate', 'Blue Badge set-down may apply']; }
  else if (M.cls === 'newham' && M.zid != null && ZI[M.zid]) {
    const z = ZI[M.zid], nc = nextChange(M.zid, WHEN), on = zoneOn(M.zid, WHEN);
    a = ['Permit zone', on ? 'Running' : 'Off', z.n];
    b = nc && nc.at ? [nc.on ? 'Zone ends' : 'Zone starts', clockOf(nc.at, WHEN), 'in ' + relMins(nc.mins)] : ['Hours', 'Not listed', ''];
  } else if (M.landMode || M.cls === 'private') {
    const lim = M.landMode ? landInfo(M.land)[2] : null;
    a = ['Rules', 'Owner\'s', 'read the entrance signs']; b = ['Time limit', lim ? durText(lim) : 'Check signs', lim && DUR > lim ? 'shorter than your stay' : ''];
  } else { a = ['Permit zone', 'None mapped', '']; b = ['Time limit', 'Check signs', '']; }
  return `<div class="facts">${cell(...a)}${cell(...b)}${cell(...c)}</div>`;
}
/* short reason lines: what the map data says, in plain words, each with a colour dot */
function reasonsFor(M) {
  const r = [], add = (t, x) => r.push(`<li class="${t}"><i></i><span>${x}</span></li>`);
  M.kerb.forEach(k => add(k.k === 'stop' ? 'bad' : 'warn', k.k === 'stop' ? 'A red line is mapped here: no stopping.' : 'A yellow line is mapped here. Read the plate for the hours.'));
  if (M.pbp.length) { const cap = Math.min(...M.pbp.map(x => parseMax(x.max)).filter(Boolean)); add(isFinite(cap) && DUR > cap ? 'warn' : 'info', isFinite(cap) ? `Pay-by-phone bays here: up to ${durText(cap)}${DUR > cap ? ', shorter than your stay' : ''}.` : 'Pay-by-phone bays are listed on this street.'); }
  if (M.road && !M.landMode && M.road.x) add('warn', 'Our sources disagree on who owns this road.');
  else if (M.road && !M.landMode && M.road.cf === 'low') add('warn', 'Low confidence: the data for this road is thin.');
  if (M.cls === 'newham' && M.zid == null) add('info', 'No permit zone is mapped on this road.');
  return r.length ? `<ul class="why">${r.join('')}</ul>` : '';
}
function spotBody(M) {
  const phone = innerWidth <= 760 || (innerHeight <= 520 && innerWidth > innerHeight);
  const acts = `<div class="actions"><button data-act="ticket">I got a ticket here</button><button data-act="report">Something wrong?</button><button data-act="share">Share this spot</button></div>`;
  let h = `<div class="cols"><div class="c1"><p class="lead">${M.text}</p>${M.cls ? factStrip(M) : ''}${phone && M.cls ? acts : ''}${M.cls ? reasonsFor(M) : ''}`;
  if (M.cls) {
    const owner = M.landMode && M.land.op ? M.land.op : OWNER[M.cls];
    h += `<div class="group">${row('Where', M.place + ' ' + pill(M.cls, M.landMode ? 'Private land' : LBL[M.cls]))}${phone ? '' : row('Owner', owner)}${row('Enforced by', M.landMode && M.land.op ? M.land.op : ENFORCER[M.cls])}
      ${M.zid && !phone ? row('Zone', zoneStatus(M.zid)) : ''}${row('If you get a ticket', FINE[M.cls])}</div>`;
  }
  h += phone ? `</div><details class="more"><summary>More detail: bays, pay-by-phone, how sure we are</summary><div class="c2">` : `</div><div class="c2">`;
  if (M.pbp.length) h += `<h5>Pay-by-phone bays Newham lists here</h5><div class="group">${M.pbp.map(x => `<div class="row stack"><span>${x.where.replace(/^The /, '')}</span><b>${x.hours}, max ${x.max}</b></div>`).join('')}<p class="who pad">These can run outside permit hours. Read the bay sign. Prices are not in Newham's open data.</p></div>`;
  const sum = {}; M.bays.forEach(b => { (sum[b.t] = sum[b.t] || { n: 0, ms: [] }).n += b.n; sum[b.t].ms.push(b); });
  if (M.kerb.length || M.bays.length) {
    h += `<h5>Around here (45 m)</h5><div class="group">`;
    M.kerb.forEach(k => { h += item(lineSwatch(k.k), LINE[k.k].label, '', `<p>${LINE[k.k].what}</p>`); });
    Object.entries(sum).forEach(([t, v]) => {
      const f = bayFacts(v.ms);
      h += item(symbolSVG(t, 26), BAY[t].label, v.n, `<p>${BAY[t].what}</p>${f.length ? `<p class="who">${f.join(' · ')}</p>` : ''}<p class="who">Rule set by: ${BAY[t].who}.</p>`);
    });
    h += `</div>`;
  } else if (M.cls && !M.landMode) h += `<p class="who pad">No bays or kerb markings are mapped within 45 m. The kerb may be unmarked, or just not recorded.</p>`;
  if (M.cls) h += sureBox(M);
  if (M.cls && !phone) h += acts;
  return h + (phone ? `</div></details></div>` : `</div></div>`);
}
function showSpot(latlng, framed) {
  const M = analyse(latlng);
  if (!M.cls && !framed) { deselect(); return; }      // clicking away from anything clears the selection
  LAST = M;
  setHead({ tone: M.tone, title: M.title, sub: M.sub });
  setBody(spotBody(M), 'spot');
  G.hl.clearLayers();
  G.hl.addLayer(L.marker(latlng, { pane: 'hl', interactive: false, icon: L.divIcon({ className: 'pulse', html: '<i></i><b></b>', iconSize: [24, 24], iconAnchor: [12, 12] }) }));
  if (M.road && !M.landMode) D.roads.filter(r => r.n === M.road.n && r.c === M.road.c).forEach(r => G.hl.addLayer(L.polyline(r.g, { pane: 'hl', color: '#4cc9f0', weight: bweight(r.c, wkOf(r), map.getZoom()) + 7, opacity: .45, lineCap: 'round' })));
  drawBands(); applyTime();      // before measuring: the band rows change the head height
  setDetent('fit');
  if (!framed) reveal(latlng, 'fit');
}
let LAST = null;
function deselect() {
  if (MODE === 'guide') return;
  if (LAST || MODE !== 'home') { goHome(); setDetent('peek'); }
}
map.on('click', e => showSpot(e.latlng));
