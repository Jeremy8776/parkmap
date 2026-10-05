/* Offline support. Version and tile list are stamped in by build.py.
   Strategy: precache the app shell and every data tile, so the whole borough works with no signal after the first visit.
   The map background (Esri tiles) is cross-origin and is NOT cached: opaque responses count 7 MB each against the storage quota. */
const V = "ngp-9721428cad";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
const TILES = ["tiles/t_-1_1.js", "tiles/t_0_0.js", "tiles/t_0_1.js", "tiles/t_0_2.js", "tiles/t_0_3.js", "tiles/t_1_0.js", "tiles/t_1_1.js", "tiles/t_1_2.js", "tiles/t_1_3.js", "tiles/t_2_0.js", "tiles/t_2_1.js", "tiles/t_2_2.js", "tiles/t_2_3.js", "tiles/t_3_0.js", "tiles/t_3_1.js", "tiles/t_3_2.js", "tiles/t_3_3.js", "tiles/t_4_0.js", "tiles/t_4_1.js", "tiles/t_4_2.js", "tiles/t_4_3.js"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll([...SHELL, ...TILES])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k.startsWith("ngp-")).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;            // leave map tiles and everything cross-origin alone
  if (r.mode === "navigate") {                                              // pages: fresh when online, cached when not
    e.respondWith(fetch(r).then(res => { const c = res.clone(); caches.open(V).then(x => x.put("index.html", c)); return res; }).catch(() => caches.match("index.html")));
    return;
  }
  e.respondWith(caches.match(r).then(hit => hit || fetch(r).then(res => { if (res.ok) { const c = res.clone(); caches.open(V).then(x => x.put(r, c)); } return res; })));
});
