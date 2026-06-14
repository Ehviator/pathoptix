const CACHE_NAME = 'pathoptix-v5';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/data/climb_perf.json',
  '/data/cruise_econ.json',
  '/data/descent_fpa.json',
  '/data/holding_endurance.json',
  '/data/driftdown_oei.json',
  '/images/marker-icon.png',
  '/images/marker-icon-2x.png',
  '/images/marker-shadow.png'
];

// Install Event: Cache all assets and data engines
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
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

  // Stale-while-revalidate for large data files
  if (event.request.url.includes('/data/nav_db.json')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => 
        cache.match(event.request).then(cachedResponse => {
          const fetchPromise = fetch(event.request).then(networkResponse => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          }).catch(() => cachedResponse);
          return cachedResponse || fetchPromise;
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
