// Page loads go network-first so every new deployment shows up on the very
// next reload; hashed static assets use stale-while-revalidate (they're
// immutable). API and cross-origin requests (tiles, data services) are never
// cached here. The cache still makes the installed PWA open offline.
const CACHE = 'sidequest-v3';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  // Navigations: fresh HTML first, cache only as offline fallback.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        fetch(event.request)
          .then((res) => {
            if (res.ok) cache.put(event.request, res.clone());
            return res;
          })
          .catch(async () => (await cache.match(event.request)) ?? Response.error()),
      ),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request);
      const fetched = fetch(event.request)
        .then((res) => {
          if (res.ok) cache.put(event.request, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    }),
  );
});
