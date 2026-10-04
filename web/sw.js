/* Offline support. Version and tile list are stamped in by build.py.
   Strategy: precache the app shell and every data tile, so the whole borough works with no signal after the first visit.
   The map background (Esri tiles) is cross-origin and is NOT cached: opaque responses count 7 MB each against the storage quota. */
const V = "ngp-__VERSION__";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];
const TILES = __TILES__;

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
