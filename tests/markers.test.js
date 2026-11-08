const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync('js/30-map.js', 'utf8');
const start = code.indexOf('function groupMarkers(');
const end = code.indexOf('function declutter()', start);
const ctx = vm.createContext({});
vm.runInContext(code.slice(start, end) + ';globalThis.group = groupMarkers;', ctx);
const entries = [[{getLatLng: () => ({x: 1, y: 1})}], [{getLatLng: () => ({x: 55, y: 1})}], [{getLatLng: () => ({x: 150, y: 1})}]];
for (const zoom of [8, 13, 14, 15, 16, 17, 18, 19]) {
  const groups = ctx.group(entries, zoom, p => p);
  assert.strictEqual(groups.flat().length, 3, 'every location retained at zoom ' + zoom);
  assert.strictEqual(new Set(groups.flat()).size, 3, 'no duplicate locations');
}
assert.strictEqual(ctx.group(entries, 13, p => p).length, 2);
assert.strictEqual(ctx.group(entries, 17, p => p).length, 3);
const samePlace = [[{getLatLng: () => ({x: 1, y: 1})}], [{getLatLng: () => ({x: 1, y: 1})}]];
assert.strictEqual(ctx.group(samePlace, 17, p => p).length, 1);
assert.strictEqual(ctx.group(samePlace, 18, p => p).length, 2);
assert.strictEqual(ctx.group([], 10, p => p).length, 0);
assert(code.includes('markers: false') && code.includes('cycle: false'), 'tile groups must not duplicate clustered markers');
assert(!code.includes('if (map.getZoom() >= MINZ) loadTiles'), 'overview must load unseen tiles');
console.log('Marker grouping checks passed');
