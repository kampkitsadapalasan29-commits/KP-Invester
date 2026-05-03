const CACHE = "kp-invest-v1";
const ASSETS = [
  "/KP-Invester/",
  "/KP-Invester/index.html",
  "/KP-Invester/style.css",
  "/KP-Invester/script.js",
  "/KP-Invester/icon-192.png",
  "/KP-Invester/icon-512.png"
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  // Network first for API calls, cache first for assets
  if (e.request.url.includes("api.") || e.request.url.includes("finnhub") || e.request.url.includes("alphavantage")) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
  } else {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
  }
});
