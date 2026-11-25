/*
 * SkyDeck service worker (Phase 16c). It keeps the built files (scripts, styles, fonts, icons) so the app starts
 * faster, and it shows a plain "you are offline" page when a page cannot be fetched.
 * It never stores or answers live data: aircraft, weather, airport and sign-in requests always go to the network.
 * Phase 10f: it also shows closed-page alerts (web push) and opens the map on the aircraft when one is clicked.
 * Change CACHE when this file or the offline page changes, so old copies are removed.
 */
const CACHE = "skydeck-shell-v3";
// The host redirects /offline.html to /offline (307), and a stored redirect cannot answer a page load, so the
// final address is the one kept. The file itself is public/offline.html.
const OFFLINE = "/offline";
const PRECACHE = [
  "/offline",
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
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
  }
  // Everything else (server functions, the API, data) is left alone and goes straight to the network.
});

// ---------- closed-page alerts (web push, Phase 10f) ----------

/** Only a path on this site may be opened from a notification. */
function safePath(url) {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/";
}

function text(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = text(data.title, 80) || "SkyDeck alert";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: text(data.body, 160),
      tag: text(data.tag, 80) || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    safePath(event.notification.data && event.notification.data.url),
    self.location.origin,
  ).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === self.location.origin && "navigate" in c) {
          return c.focus().then(() => c.navigate(target));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
