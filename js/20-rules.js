/* Zone hours (from D.zinfo, parsed from Newham's own text), stay windows, enforcement text. */
const ZI = {}; D.zinfo.forEach(z => ZI[z.i] = z);
const zcol = i => `hsl(${(i * 47) % 360} 55% 45%)`;
const ZNAME = new Proxy({}, { get: (_, i) => (ZI[i] || {}).n });
const COL = { tfl: '#e5383b', newham: '#2b6fdc', private: '#f29f05', other: '#9aa0a8' };
const LBL = { tfl: 'TfL Red Route', newham: 'Newham road', private: 'Private or unadopted road', other: 'Other borough' };
const OWNER = { tfl: 'Transport for London', newham: 'Newham Council', private: 'A private landowner', other: 'Another borough' };
const ENFORCER = { tfl: 'TfL officers', newham: 'Newham officers', private: 'The landowner or its parking company', other: 'That borough' };
const FINE = {
  tfl: '£160, or £80 if paid within 14 days. Appeal to TfL.',
  newham: '£130 (£65 within 14 days) for yellow lines or pavement. £80 (£40) for overstaying a paid bay. Appeal to Newham, then London Tribunals.',
  private: 'A private Parking Charge Notice. A contract claim, not a council fine. Appeal to the operator, then the trade-body appeals service.',
  other: 'Set by that borough.'
};

let WHEN = new Date(), DUR = 120, PRESET = 'now';           // DUR = length of stay in minutes
const dayNum = d => d.getDay() === 0 ? 7 : d.getDay();
const minsOf = d => d.getHours() * 60 + d.getMinutes();
const hhmm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); };
function zoneOn(id, d) {
  const z = ZI[id]; if (!z || !z.h.length) return null;
  const day = dayNum(d), m = minsOf(d);
  return z.h.some(([days, s, e]) => days.includes(day) && m >= s && m < e);
}
function zoneSegs(id, d) {
  const z = ZI[id], day = dayNum(d);
  return z ? z.h.filter(([days]) => days.includes(day)).map(([, s, e]) => [s, e]) : [];
}
/* Intervals of zone control that overlap the stay [start, start+DUR], in minutes from the start of the start day. */
function zoneOverlap(id, d, dur) {
  const z = ZI[id]; if (!z || !z.h.length) return null;
  const m0 = minsOf(d), m1 = m0 + dur, day = dayNum(d), out = [];
  for (let k = 0; k <= Math.ceil(m1 / 1440); k++) {
    const dn = ((day - 1 + k) % 7) + 1;
    z.h.forEach(([days, s, e]) => { if (days.includes(dn)) { const a = Math.max(s + k * 1440, m0), b = Math.min(e + k * 1440, m1); if (b > a) out.push([a, b]); } });
  }
  return out.sort((a, b) => a[0] - b[0]);
}
const durText = m => m >= 1440 ? 'all day' : m % 60 === 0 ? `${m / 60} hour${m === 60 ? '' : 's'}` : `${m} mins`;
const stayWord = () => DUR >= 1440 ? 'all-day' : DUR % 60 === 0 ? `${DUR / 60}-hour` : `${DUR}-minute`;
function whenText(d) { return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + hhmm(minsOf(d)); }
const onBadge = on => on === null ? '' : `<span class="state ${on ? 'on' : 'off'}">${on ? 'On' : 'Off'}</span>`;
const zoneStatus = id => ZI[id] ? `${ZI[id].n}, ${ZI[id].t || 'hours not listed'} ${onBadge(zoneOn(id, WHEN))}${ZI[id].e ? '<br><span class="who">Longer controls apply on stadium event days.</span>' : ''}` : 'No zone mapped here.';
const pill = (c, t) => `<span class="pill" style="background:${COL[c]}">${t || LBL[c]}</span>`;
/* "30 mins", "1 hour", "4 hours" to minutes */
function parseMax(s) { const m = /(\d+)\s*(min|hour|hr)/i.exec(s || ''); return m ? (+m[1]) * (/min/i.test(m[2]) ? 1 : 60) : null; }

/* ---- what happens next: the "Zone starts / ends" fact (the stay-limit idea, derived from zone hours) ---- */
function onAt(z, dn, m) { return z.h.some(([days, s, e]) => days.includes(dn) && m >= s && m < e); }
function nextChange(id, d) {
  const z = ZI[id]; if (!z || !z.h.length) return null;
  const on0 = onAt(z, dayNum(d), minsOf(d)), m0 = minsOf(d), day0 = dayNum(d);
  for (let t = 5; t <= 7 * 1440; t += 5) {
    const abs = m0 + t, dn = ((day0 - 1 + Math.floor(abs / 1440)) % 7) + 1, m = abs % 1440;
    if (onAt(z, dn, m) !== on0) {
      let tt = t; while (tt > t - 5) { const a2 = m0 + tt - 1, d2 = ((day0 - 1 + Math.floor(a2 / 1440)) % 7) + 1; if (onAt(z, d2, a2 % 1440) !== on0) tt--; else break; }   // snap to the exact minute
      return { on: on0, mins: tt, at: new Date(d.getTime() + tt * 60000) };
    }
  }
  return { on: on0, mins: null, at: null };
}
function relMins(t) { const h = Math.floor(t / 60), m = t % 60; return h >= 24 ? `${Math.round(h / 24)} day${h >= 48 ? 's' : ''}` : h ? `${h}h${m ? ' ' + m + 'm' : ''}` : `${m}m`; }
function clockOf(d, ref) { const same = d.toDateString() === ref.toDateString(); return (same ? '' : d.toLocaleDateString('en-GB', { weekday: 'short' }) + ' ') + hhmm(minsOf(d)); }
/* Pin verdict for the chosen stay: 'run' (restricted or over a known limit), 'off' (permit zone not running), or null. Never a green light. */
function pinState(m) {
  if (m.t === 'permit' && m.z != null) { const ov = zoneOverlap(m.z, WHEN, DUR); return ov === null ? null : ov.length ? 'run' : 'off'; }
  if (m.t === 'customer' || m.t === 'carpark' || m.t === 'private') { const lim = landInfo({ n: m.name, op: m.op })[2]; if (lim && DUR > lim) return 'run'; }
  return null;
}
const walkMin = m => Math.max(1, Math.round(m / 80));
