// Service worker: la app funciona sin internet (tu lista vive en IndexedDB).
// Cambia VERSION en cada publicación para que los teléfonos reciban la actualización.
const VERSION = 'v2.1.0';
const SHELL = `shell-${VERSION}`;
const IMAGES = 'covers-v1';
const ASSETS = [
  './', 'index.html', 'manifest.json', 'css/styles.css',
  'js/app.js', 'js/db.js', 'js/ui.js', 'js/store.js', 'js/links.js', 'js/api.js', 'js/editor.js', 'js/sections.js', 'js/football.js', 'js/sports.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
];
const IMAGE_HOSTS = ['s4.anilist.co', 'static.tvmaze.com', 'upload.wikimedia.org', 'thumb.wikimedia.org'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Archivos de la app: primero caché, luego red
  if (url.origin === self.location.origin) {
    if (req.mode === 'navigate') {
      e.respondWith(caches.match('index.html', { ignoreSearch: true }).then((r) => r || fetch(req)));
      return;
    }
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
    return;
  }

  // Portadas de las APIs: se guardan para verlas sin conexión (máx. ~300)
  if (req.destination === 'image' || IMAGE_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const cache = await caches.open(IMAGES);
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          cache.put(req, res.clone());
          trim(cache, 300);
        }
        return res;
      } catch {
        return new Response('', { status: 504 });
      }
    })());
  }
  // El resto (APIs de datos) va directo a la red.
});

async function trim(cache, max) {
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}
