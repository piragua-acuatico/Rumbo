// Guarda la app en el teléfono para que abra sin internet y se actualice sola.
// VERSION la cambia `node tools/publicar.cjs` en cada publicación: al cambiar este
// archivo, el iPhone detecta la versión nueva y la instala.
const VERSION = '2.2.0';
const CACHE = `rumbo-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './manifest.webmanifest',
  './js/actions.js',
  './js/app.js',
  './js/components.js',
  './js/focus.js',
  './js/fx.js',
  './js/guides.js',
  './js/handlers.js',
  './js/icons.js',
  './js/morph.js',
  './js/night.js',
  './js/onboarding.js',
  './js/parse.js',
  './js/sheet.js',
  './js/sheets.js',
  './js/store.js',
  './js/swipe.js',
  './js/ui.js',
  './js/update.js',
  './js/utils.js',
  './js/version.js',
  './js/views/crossfit.js',
  './js/views/diary.js',
  './js/views/inbox.js',
  './js/views/plan.js',
  './js/views/profile.js',
  './js/views/ritual.js',
  './js/views/stats.js',
  './js/views/today.js',
  './icons/apple-touch-icon.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' evita que la caché HTTP entregue archivos de la versión anterior.
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero, siempre revalidando con el servidor; sin conexión, la copia guardada.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        if (res.ok && !url.pathname.includes('/tools/')) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('./index.html')))
  );
});
