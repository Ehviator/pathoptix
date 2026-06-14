const CACHE_NAME = 'pathoptix-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/src/index.js',
  '/src/App.js',
  '/src/styles.css',
  '/manifest.json',
  '/data/climb_perf.json',
  '/data/cruise_econ.json',
  '/data/descent_fpa.json',
  '/data/holding_endurance.json',
  '/data/driftdown_oei.json'
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

// Fetch Event: Cache-First Strategy with Network Fallback
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request);
    })
  );
});
