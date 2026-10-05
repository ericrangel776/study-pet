// Service worker: lets the app open and run offline once it has loaded online.
// The build replaces __VERSION__ and __FONT_CSS__, so each release gets a fresh cache.
// It only runs in the built app (dist/), never in `npm run dev`.

const VERSION = "__VERSION__";
const FONT_CSS = "__FONT_CSS__";
const APP_CACHE = `study-pet-${VERSION}`;
const FONT_CACHE = "study-pet-fonts";
const SHELL = ["./", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
               "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil(Promise.all([
    caches.open(APP_CACHE).then(c => c.addAll(SHELL)),
    cacheFonts().catch(() => {})      // best effort: the app still works with fallback fonts
  ]).then(() => self.skipWaiting()));
});

// Remove caches from older releases.
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("study-pet-") && k !== APP_CACHE && k !== FONT_CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// The page's font stylesheet points at font files, so cache both up front.
async function cacheFonts() {
  const res = await fetch(FONT_CSS);
  if (!res.ok) return;
  const css = await res.clone().text();
  const cache = await caches.open(FONT_CACHE);
  await cache.put(FONT_CSS, res);
  // A variable font lists the same file once per weight; addAll rejects duplicates.
  await cache.addAll([...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map(m => m[1]))]);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The page itself: try the network first so updates show up, fall back to the cached copy.
  if (req.mode === "navigate") {
    e.respondWith(fetch(req)
      .then(res => { const copy = res.clone(); caches.open(APP_CACHE).then(c => c.put("./", copy)); return res; })
      .catch(() => caches.match("./")));
    return;
  }
  // Fonts, icons and the manifest rarely change: serve from the cache, fetch if missing.
  if (url.origin === location.origin || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
  }
});
