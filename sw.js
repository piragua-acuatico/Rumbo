// Guarda la app en el teléfono para que abra sin internet y se actualice sola.
// VERSION la cambia `node tools/publicar.cjs` en cada publicación: al cambiar este
// archivo, el iPhone detecta la versión nueva y la instala.
const VERSION = '2.4.0';
const CACHE = `rumbo-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './manifest.webmanifest',
  './js/actions.js',
  './js/app.js',
  './js/components.js',
  './js/config.js',
  './js/focus.js',
  './js/fx.js',
  './js/guides.js',
  './js/handlers.js',
  './js/icons.js',
  './js/morph.js',
  './js/night.js',
  './js/onboarding.js',
  './js/parse.js',
  './js/push.js',
  './js/sheet.js',
  './js/sheets.js',
  './js/sleep.js',
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

/* ---------- Notificaciones ----------
   El servidor manda { k: tipo, e: contenido cifrado }. Aquí se descifra con la
   clave que solo vive en este teléfono (IndexedDB) y se muestra el aviso.
   iOS exige mostrar SIEMPRE una notificación: si algo falla, sale un texto genérico. */
const FALLBACK = {
  agua: ['💧 Hora de tomar agua', 'Un vaso y sigues.'],
  tarea: ['⏰ Tienes una tarea en unos minutos', 'Abre Rumbo para verla.'],
  planear: ['🌙 Hora de planear mañana', 'Cierra el día en 3 minutos.'],
  noche: ['😴 En 15 min empieza el modo noche', ''],
  manana: ['☀️ Buenos días', 'Mira tu día en Rumbo.'],
  enfoque: ['⏱ Terminó tu sesión de enfoque', ''],
  recordar: ['📲 Abre Rumbo un momento', 'Así sigues recibiendo tus avisos.'],
  alarma: ['⏰ Hora de despertar', 'Abre Rumbo y resuelve tu misión.'],
  prueba: ['🔔 Rumbo', 'Aviso de prueba'],
};

function keyStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('rumbo-push', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const r = fn(db.transaction('keys', mode).objectStore('keys'));
      r.onsuccess = () => { db.close(); resolve(r.result); };
      r.onerror = () => { db.close(); reject(r.error); };
    };
  });
}

// La clave está guardada como 32 bytes (en el iPhone, el service worker no puede leer objetos CryptoKey).
async function pushKey() {
  const raw = await keyStore('readonly', s => s.get('raw'));
  if (!(raw instanceof Uint8Array) || raw.length !== 32) throw new Error('sin clave');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']);
}

const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), c => c.charCodeAt(0));

// La hora y el tipo van sellados junto al texto: si alguien los cambiara, no se abre.
async function openMessage(sealed, due, kind) {
  const key = await pushKey();
  const [iv, ct] = String(sealed).split('.');
  const additionalData = new TextEncoder().encode(`${due}|${kind}`);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(iv), additionalData }, key, unb64u(ct));
  return JSON.parse(new TextDecoder().decode(plain));
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let data = {};
    try { data = e.data ? e.data.json() : {}; } catch { /* sin datos */ }
    let msg = null;
    try {
      msg = await openMessage(data.e, data.d, data.k);
    } catch (err) {
      // Clave perdida o mensaje alterado: se muestra el texto genérico y se anota el motivo para la app.
      try { await keyStore('readwrite', s => s.put({ at: Date.now(), kind: data.k, error: String(err?.name || err) }, 'diag')); } catch { /* sin almacenamiento */ }
    }
    const [title, body] = FALLBACK[data.k] || ['Rumbo', ''];
    await self.registration.showNotification(msg?.t || title, {
      body: msg?.b ?? body,
      tag: msg?.g || data.k || 'rumbo',
      icon: './icons/icon-192.png',
      data: { url: msg?.u || './#hoy' },
    });
  })());
});

// Tocar el aviso abre Rumbo (o la trae al frente si ya estaba abierta).
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || './#hoy', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (!('focus' in w)) continue;
      await w.focus();
      try { await w.navigate(url); } catch { /* ventana no controlada: basta con traerla al frente */ }
      return;
    }
    await self.clients.openWindow(url);
  })());
});
