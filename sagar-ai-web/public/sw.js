/**
 * Sagar AI - minimal offline app-shell service worker.
 *
 * Scope, deliberately kept small (Phase 4: "do not build a complicated
 * service worker"):
 *  - Caches same-origin GET requests (the app shell: HTML/JS/CSS, map
 *    tiles, icons) AS THEY ARE FETCHED, network-first with a cache
 *    fallback - no hardcoded precache manifest, so it needs no changes
 *    when Vite's build output hashes change between builds.
 *  - Falls back to the cached page shell (index.html) for a failed
 *    navigation while offline, so a hard refresh with no network still
 *    loads Sagar's UI instead of the browser's own "no internet" page.
 *  - NEVER intercepts /api/* requests - those must always reach the
 *    real network (or fail loudly) so the app's own online/offline
 *    decision logic (useConnectivity, the local snapshot fallback)
 *    is what decides what happens next, not this worker silently
 *    serving stale API data as if it were current.
 *  - Does not know or claim anything about live marine data - it only
 *    ever caches static assets and tiles, never a chat/API response.
 */

const CACHE_NAME = "sagar-shell-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  // Cross-origin (map tiles from OpenStreetMap, any external API) and
  // this app's own /api/* calls are left alone entirely - only this
  // app's own static assets/navigation are cached.
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) {
          return cached;
        }

        if (request.mode === "navigate") {
          const shell = await caches.match("/index.html");
          if (shell) {
            return shell;
          }
        }

        throw new Error("Sagar is offline and this resource was never cached.");
      })
  );
});
