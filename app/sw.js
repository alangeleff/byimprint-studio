/* Brand Codex — service worker
   Cache-first for assets, network-first for navigations + brand.json.
   v2: purges old caches, precaches only non-redirecting URLs, and never
   lets a precache failure break installation. */
const VERSION = "codex-v2";
const SHELL_CACHE = "codex-shell-" + VERSION;
const ASSET_CACHE = "codex-assets-" + VERSION;
const KEEP = [SHELL_CACHE, ASSET_CACHE];

// Use the clean shell URL (/app, 200) — NOT "/app/" or "/app/index.html",
// which redirect under cleanUrls and would reject cache.put / break addAll.
const SHELL_URL = "/app";
const PRECACHE = [
  SHELL_URL,
  "/app/manifest.json",
  "/app/imprint-mark.svg",
  "/app/imprint-wordmark.svg",
  "/app/icons/icon-192.png",
  "/app/icons/icon-512.png"
];

// Cache one URL, tolerating redirects and failures (never throws).
async function safePut(cache, url) {
  try {
    const res = await fetch(url, { redirect: "follow", cache: "no-cache" });
    if (res && res.ok && !res.redirected && res.type === "basic") {
      await cache.put(url, res.clone());
    }
  } catch (e) { /* ignore — precache is best-effort */ }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(PRECACHE.map((u) => safePut(cache, u)));
    } catch (e) { /* never block install on precache */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => KEEP.indexOf(k) === -1).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try { url = new URL(req.url); } catch (e) { return; }

  // Only manage same-origin requests inside the /app/ scope.
  if (url.origin !== self.location.origin || !url.pathname.startsWith("/app/")) return;

  // SPA navigations: network-first (always get fresh shell + code when online),
  // fall back to the cached clean shell only when the network fails.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match(SHELL_URL, { ignoreSearch: true }))
    );
    return;
  }

  // brand.json: network-first so brand data stays fresh; cache as offline fallback.
  if (url.pathname.endsWith("/brand.json")) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Everything else under /app/ (icons, logos, downloads): cache-first.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === "basic" && !res.redirected) {
          const copy = res.clone();
          caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      });
    })
  );
});
