/* Mainland-friendly artwork cache (same-origin only).
   HTML, CSS, scripts, JSON, API responses and embeds are NEVER cached here.
   Immutable hashed posters stay cache-first; mutable icons refresh quietly. */
const CACHE = 'liangyou-art-v2';
const MAX_ITEMS = 95;
const RECHECK_AFTER = 6 * 60 * 60 * 1000;
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
async function store(cache, request, response) {
  if (!response?.ok || response.type !== 'basic') return;
  const copied = response.clone();
  const headers = new Headers(copied.headers);
  headers.set('X-LiangYou-Cached-At', String(Date.now()));
  const stored = new Response(copied.body, { status:copied.status, statusText:copied.statusText, headers });
  await cache.put(request, stored);
  await trim(cache);
}
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode === 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname)) return;
  if (!/\.(?:svg|png|jpe?g|webp|avif|gif|ico)$/i.test(url.pathname)) return;
  if (!url.pathname.includes('/assets/') && !url.pathname.includes('/interactive/')) return;
  event.respondWith((async () => {
    let cache;
    try { cache = await caches.open(CACHE); }
    catch { return fetch(request); }
    const hit = await cache.match(request);
    if (hit) {
      // Filenames in media-posters are content-hashed: no refresh needed.
      const immutable = /\/assets\/media-posters\/[a-f0-9]{20}\.webp$/i.test(url.pathname);
      const createdAt = Number(hit.headers.get('X-LiangYou-Cached-At'));
      if (!immutable && (!Number.isFinite(createdAt) || Date.now() - createdAt >= RECHECK_AFTER)) {
        event.waitUntil(fetch(request, {cache:'no-cache'})
          .then(response => store(cache, request, response))
          .catch(() => {}));
      }
      return hit;
    }
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic')
        event.waitUntil(store(cache, request, response).catch(() => {}));
      return response;
    } catch {
      return Response.error();
    }
  })());
});
