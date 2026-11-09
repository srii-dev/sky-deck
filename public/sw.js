/*
 * SkyDeck service worker (Phase 16c). It does two small things: it keeps the built files (scripts, styles, fonts,
 * icons) so the app starts faster, and it shows a plain "you are offline" page when a page cannot be fetched.
 * It never stores or answers live data: aircraft, weather, airport and sign-in requests always go to the network.
 * Change CACHE when this file or the offline page changes, so old copies are removed.
 */
const CACHE = "skydeck-shell-v1";
const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];
const STATIC_PREFIXES = ["/assets/", "/fonts/", "/icons/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Built files have a hash in their name, so a stored copy is always the right one.
  if (STATIC_PREFIXES.some((p) => url.pathname.startsWith(p))) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Pages: always try the network first; only when it fails show the offline page.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
  // Everything else (server functions, the API, data) is left alone and goes straight to the network.
});
