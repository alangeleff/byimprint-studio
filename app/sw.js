/* Brand Codex — service worker
   Cache-first for assets, network-first for brand.json, shell fallback for nav. */
const VERSION = "codex-v1";
const SHELL_CACHE = "codex-shell-" + VERSION;
const ASSET_CACHE = "codex-assets-" + VERSION;

const SHELL = [
  "/app/",
  "/app/index.html",
  "/app/manifest.json",
  "/app/imprint-mark.svg",
  "/app/imprint-wordmark.svg",
  "/app/icons/icon-192.png",
  "/app/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Only manage same-origin requests inside the /app/ scope.
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/app/")) return;

  // SPA navigations: try network, fall back to cached shell when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("/app/index.html", { ignoreSearch: true }))
    );
    return;
  }

  // brand.json: network-first so brand data stays fresh, cache as offline fallback.
  if (url.pathname.endsWith("/brand.json")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else under /app/ (icons, logos, fonts-on-origin, downloads): cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
