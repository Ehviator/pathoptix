const CACHE_NAME = 'pathoptix-v10';

// App shell — must load synchronously for the UI to render
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/pdf.worker.min.js',
  '/images/marker-icon.png',
  '/images/marker-icon-2x.png',
  '/images/marker-shadow.png',
];

// All JSON datasets required for offline dispatch — EVERY file in /data/ must
// be listed here so they are guaranteed present before the cockpit door closes.
// If any single file fails to precache (e.g. the device was offline during
// install) the install still completes; individual failures are logged.
const DATA_ASSETS = [
  '/data/nav_db.json',
  '/data/airport_db.json',
  '/data/airways_db.json',
  '/data/climb_perf.json',
  '/data/cruise_econ.json',
  '/data/descent_fpa.json',
  '/data/driftdown_oei.json',
  '/data/holding_endurance.json',
  '/data/terrain_db.json',
];

// Install Event: Precache app shell and ALL performance/nav datasets.
// skipWaiting is called inside waitUntil so the new SW only activates
// after caching is complete (prevents serving the new UI with old data).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        [...APP_SHELL, ...DATA_ASSETS].map((url) =>
          cache.add(url).catch((err) =>
            console.warn(`[SW] Precache miss for ${url}:`, err)
          )
        )
      )
    ).then(() => self.skipWaiting())
  );
});

// Activate Event: Clean up old configurations
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event: Cache-First Strategy with Network Fallback & Vite Dev Server Bypass
self.addEventListener('fetch', (event) => {
  // Handle shared file targets (PWA Web Share Target API)
  if (event.request.method === 'POST' && event.request.url.includes('/share-target')) {
    event.respondWith(
      (async () => {
        try {
          const formData = await event.request.formData();
          const pdfFile = formData.get('flight_plan');
          if (pdfFile) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('/shared-pdf.pdf', new Response(pdfFile));
            return Response.redirect('/?shared-flight-plan=1', 303);
          }
        } catch (e) {
          console.error("Service worker failed to parse shared target payload:", e);
        }
        return Response.redirect('/', 303);
      })()
    );
    return;
  }

  // Bypass service worker cache for Vite dev server files to prevent stale local source copies
  if (
    event.request.url.includes('/src/') ||
    event.request.url.includes('/@id/') ||
    event.request.url.includes('/@vite/') ||
    event.request.url.includes('node_modules') ||
    event.request.url.includes('?import')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // Stale-While-Revalidate for ALL performance/nav datasets.
  // Serve the cached copy immediately (zero latency on startup), then
  // refresh the cache from the network in the background.
  // If offline, the cached version is returned silently — no error.
  if (event.request.url.includes('/data/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cachedResponse) => {
          const networkFetch = fetch(event.request)
            .then((networkResponse) => {
              if (networkResponse.ok) {
                cache.put(event.request, networkResponse.clone());
              }
              return networkResponse;
            })
            .catch(() => null); // Network failure is silent — cache is the source of truth

          return cachedResponse || networkFetch;
        })
      )
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request);
    })
  );
});
