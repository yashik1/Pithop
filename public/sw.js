// Page loads go network-first so every new deployment shows up on the very
// next reload; hashed static assets use stale-while-revalidate (they're
// immutable). Map tiles and place photos are cached cache-first (capped) so a
// trip planned online keeps its map imagery when the signal drops. Data APIs
// are never cached here — the app persists the trip itself in localStorage.
const CACHE = 'sidequest-v4';
const EXT_CACHE = 'sidequest-ext-v1';
const EXT_HOSTS = ['tile.openstreetmap.org', 'maps.geoapify.com', 'upload.wikimedia.org'];
const EXT_MAX_ENTRIES = 600;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE && k !== EXT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;

  // Tiles + photos: serve from cache, fetch and store on miss. Tile URLs are
  // effectively immutable, so cache-first is safe and instant offline.
  if (EXT_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(
      caches
        .open(EXT_CACHE)
        .then(async (cache) => {
          const cached = await cache.match(event.request);
          if (cached) return cached;
          const res = await fetch(event.request);
          // Opaque responses are what no-cors <img> tiles return — cacheable.
          if (res.ok || res.type === 'opaque') {
            await cache.put(event.request, res.clone());
            const keys = await cache.keys();
            if (keys.length > EXT_MAX_ENTRIES) await cache.delete(keys[0]);
          }
          return res;
        })
        .catch(() => Response.error()),
    );
    return;
  }

  if (url.origin !== location.origin || url.pathname.startsWith('/api/')) {
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
