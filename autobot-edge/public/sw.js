const CACHE_NAME = 'autobot-edge-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/static/dashboard-logic.js',
  '/manifest.json'
];

// Install Event - Cache Core Assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Activate Event - Clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) return caches.delete(cache);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event - Network First, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip intercepting page navigations to allow browser native basic auth handling
  if (event.request.mode === 'navigate') {
    return;
  }

  // We don't want to cache API routes (Supabase live data)
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});

