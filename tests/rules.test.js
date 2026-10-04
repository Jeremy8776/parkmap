// Tests for the zone-timing logic in js/20-rules.js. Run: node tests/rules.test.js   (no dependencies)
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', '20-rules.js'), 'utf8');
// Mon to Fri 10:00 to 14:00, and Sat all day
const D = { zinfo: [{ i: 1, n: 'Test zone', t: 'x', e: false, h: [[[1, 2, 3, 4, 5], 600, 840], [[6], 0, 1440]] }, { i: 2, n: 'Empty', t: '', e: false, h: [] }] };
const ctx = vm.createContext({ D, console, Math, Date, Proxy, location: { href: '' } });
vm.runInContext(src + '\n;globalThis.api = { zoneOn, zoneOverlap, nextChange, parseMax, durText, hhmm, relMins, clockOf, setDur: d => { DUR = d; } };', ctx);
const A = ctx.api;
// 5 Oct 2026 is a Monday
const at = (day, h, m = 0) => new Date(2026, 9, day, h, m);
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('zone is on inside its hours and off outside', () => {
  assert.strictEqual(A.zoneOn(1, at(5, 11)), true);
  assert.strictEqual(A.zoneOn(1, at(5, 9, 59)), false);
  assert.strictEqual(A.zoneOn(1, at(5, 14)), false);          // end is exclusive
  assert.strictEqual(A.zoneOn(1, at(10, 3)), true);           // Saturday 03:00: the all-day Saturday window
  assert.strictEqual(A.zoneOn(1, at(11, 3)), false);          // Sunday: not covered
});
t('zone with no hours is unknown, not off', () => assert.strictEqual(A.zoneOn(2, at(5, 11)), null));
t('stay that misses the zone has no overlap', () => assert.strictEqual(A.zoneOverlap(1, at(5, 15), 120).length, 0));
t('stay that clips the zone start overlaps', () => { const o = A.zoneOverlap(1, at(5, 8), 180); assert.strictEqual(o.length, 1); assert.strictEqual(o[0][0], 600); });
t('overnight stay reaches next morning zone', () => assert.ok(A.zoneOverlap(1, at(5, 22), 14 * 60).length > 0));
t('next change snaps to the exact minute', () => {
  const c = A.nextChange(1, at(5, 9, 7));
  assert.strictEqual(c.on, false); assert.strictEqual(A.hhmm(c.at.getHours() * 60 + c.at.getMinutes()), '10:00'); assert.strictEqual(c.mins, 53);
});
t('next change when running is the end time', () => {
  const c = A.nextChange(1, at(5, 11, 30)); assert.strictEqual(c.on, true); assert.strictEqual(c.mins, 150);
});
t('friday evening: next start is Saturday midnight', () => {
  const c = A.nextChange(1, at(9, 20)); assert.strictEqual(c.on, false); assert.strictEqual(c.at.getDay(), 6);
});
t('stay length parsing', () => { assert.strictEqual(A.parseMax('30 mins'), 30); assert.strictEqual(A.parseMax('4 hours'), 240); assert.strictEqual(A.parseMax('no limit'), null); });
t('wording helpers', () => { assert.strictEqual(A.durText(60), '1 hour'); assert.strictEqual(A.durText(120), '2 hours'); assert.strictEqual(A.durText(1440), 'all day'); assert.strictEqual(A.relMins(150), '2h 30m'); assert.strictEqual(A.relMins(45), '45m'); });
// The GPS fallback must point to the road itself and refuse distant matches.
const spotSrc = fs.readFileSync(path.join(__dirname, '..', 'js', '40-spot.js'), 'utf8');
const spotCtx = vm.createContext({
  D: { roads: [{ g: [[51.5, 0], [51.5, 0.002]] }] },
  L: { latLng: (lat, lng) => ({ lat, lng }) },
  map: { on: () => {} }, Math
});
vm.runInContext(spotSrc + '\n;globalThis.snap = snapToRoad;', spotCtx);
t('GPS fallback snaps to the nearest point on a road', () => {
  const r = spotCtx.snap(51.5005, 0.001, 120);
  assert.ok(r && Math.abs(r.d - 55.287) < 0.1);
  assert.ok(Math.abs(r.ll.lat - 51.5) < 1e-8);
  assert.ok(Math.abs(r.ll.lng - 0.001) < 1e-8);
});
t('GPS fallback does not invent a road beyond its limit', () => assert.strictEqual(spotCtx.snap(51.503, 0.001, 120), null));
console.log(`${n} passed`);
