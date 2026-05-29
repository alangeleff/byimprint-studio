/* Brand Codex — service worker (intentionally minimal / no-op).

   Offline caching was removed on purpose. A stale cached worker from an
   earlier broken deploy caused production breakage, and offline support is
   non-critical for this client portal — a broken SW is worse than no SW.

   This worker installs immediately, purges ALL caches on activate, takes
   control of open clients, and registers NO fetch handler. With no fetch
   listener it never intercepts requests: every request goes straight to the
   network, so there is no cache that can ever serve stale/broken content. */

self.addEventListener("install", function () {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil((async function () {
    try {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    } catch (e) { /* ignore */ }
    try { await self.clients.claim(); } catch (e) { /* ignore */ }
  })());
});

// No "fetch" event handler — the worker deliberately does not intercept
// any requests.
