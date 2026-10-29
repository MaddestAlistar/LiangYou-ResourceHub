/* LiangYou resource hub: bounded artwork cache for repeat visits.
   Deliberately never intercepts HTML, scripts, styles, JSON feeds, API calls,
   video embeds, or other domains, so editorial/data updates remain fresh. */
const CACHE = 'liangyou-art-v1';
const MAX_ITEMS = 95;
const scope = new URL(self.registration.scope);
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter(k => k.startsWith('liangyou-art-') && k !== CACHE).map(k => caches.delete(k)));
  await self.clients.claim();
})()));
let writes = 0;
async function trim(cache) {
  if (++writes % 12 !== 0) return;
  const entries = await cache.keys();
  if (entries.length > MAX_ITEMS) {
    await Promise.all(entries.slice(0, entries.length - MAX_ITEMS).map(key => cache.delete(key)));
  }
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode === 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (!/\.(?:svg|png|jpe?g|webp|avif|gif|ico)$/i.test(url.pathname)) return;
  if (!url.pathname.includes('/assets/') && !url.pathname.includes('/interactive/')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        event.waitUntil(cache.put(request, response.clone()).then(() => trim(cache)).catch(() => {}));
      }
      return response;
    } catch (error) {
      return Response.error();
    }
  })());
});
