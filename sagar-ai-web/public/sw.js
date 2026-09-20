/**
 * Sagar AI - minimal offline app-shell service worker.
 *
 * Scope, deliberately kept small (Phase 4: "do not build a complicated
 * service worker"):
 *  - Caches same-origin GET requests (the app shell: HTML/JS/CSS, map
 *    tiles, icons) AS THEY ARE FETCHED, network-first with a cache
 *    fallback - no hardcoded precache manifest, so it needs no changes
 *    when Vite's build output hashes change between builds.
 *  - Precaches the root document ("/") on install and falls back to it
 *    for a failed navigation while offline, so a hard refresh of any
 *    route (including one never visited before, e.g. "/area/123")
 *    still loads Sagar's UI instead of the browser's own "no internet"
 *    page.
 *  - NEVER intercepts /api/* requests - those must always reach the
 *    real network (or fail loudly) so the app's own online/offline
 *    decision logic (useConnectivity, the local snapshot fallback)
 *    is what decides what happens next, not this worker silently
 *    serving stale API data as if it were current.
 *  - Does not know or claim anything about live marine data - it only
 *    ever caches static assets and tiles, never a chat/API response.
 */

const CACHE_NAME = "sagar-shell-v1";

// The app shell document. Every navigation the browser makes goes to
// the *route's own* path ("/chat", "/area/123", ...), never literally
// to "/index.html" - static hosts (see vercel.json) rewrite any path
// to index.html's content, but the Request/cache key the browser (and
// this worker) sees is still the original route path. Precaching the
// root document here - and matching against it in the fetch handler's
// offline fallback below - gives every route a real, guaranteed cache
// hit to fall back to, instead of relying on "/chat" or "/area/123"
// having already been individually visited and cached before going
// offline.
const APP_SHELL_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(APP_SHELL_URL))
      .catch(() => {
        // Best-effort: if the shell can't be fetched right now, normal
        // per-request caching in the fetch handler below still applies
        // once the app is used online.
      })
  );
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
          const shell = await caches.match(APP_SHELL_URL);
          if (shell) {
            return shell;
          }
        }

        throw new Error("Sagar is offline and this resource was never cached.");
      })
  );
});
