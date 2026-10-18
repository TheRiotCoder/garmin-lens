/* Garmin Lens service worker – offline app shell (pattern from SatPass). VERSION is the single version string; bump it (and APP_VERSION in js/app.js) on every release. */
const VERSION = "garmin-lens-v1.2.0";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "js/dates.js", "js/stats.js", "js/zip.js", "js/fit.js", "js/parsers.js", "js/importer.js", "js/crypto.js", "js/db.js", "js/demo.js", "js/models.js", "js/insights.js", "js/charts.js", "js/ui.js", "js/app.js", "js/views.js", "js/data-view.js", "js/worker.js", 
  "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png"
];

// A host that redirects /index.html -> / (clean URLs) answers the install fetch with a REDIRECTED response, which Chrome refuses to serve to a navigation.
// So every cached/served shell response is rebuilt as a plain (non-redirected) Response.
function plain(res) { return res && res.redirected ? res.blob().then((b) => new Response(b, { status: 200, statusText: "OK", headers: res.headers })) : Promise.resolve(res); }
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) =>
    fetch(new Request(u, { cache: "reload" })).then((r) => { if (!r.ok) throw new Error("precache " + u + " " + r.status); return plain(r); }).then((r) => c.put(u, r))))));
  if (!self.registration.active) self.skipWaiting(); // first install takes over at once; updates wait for the user
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("garmin-lens-") && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("message", (event) => { if (event.data === "skipWaiting") self.skipWaiting(); });

function isActiveWorker() { return self.registration.active === self.serviceWorker || !self.serviceWorker; }
function cachedShell() { return caches.match("index.html").then((r) => r || caches.match("./")).then(plain); }

// Cache-consistent per VERSION: every app file is served from the cache this worker's install step filled, so the page can never mix files of two releases.
// Cross-origin requests are never touched (the app makes none; the CSP forbids them anyway). User data never passes through the worker: it lives in IndexedDB.
self.addEventListener("fetch", (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  const wantsShell = req.mode === "navigate";
  event.respondWith(
    (wantsShell ? cachedShell() : caches.match(req, { ignoreSearch: true })).then((cached) => {
      if (cached) return plain(cached);
      return fetch(req).then((res) => {
        if (res && res.ok && !wantsShell && isActiveWorker()) { const copy = res.clone(); event.waitUntil(caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {})); }
        return res;
      }, () => Response.error());
    })
  );
});
