// Service worker — App Manutenzioni
// 1) Notifiche push
// 2) Cache offline: l'app si apre anche senza rete e mostra gli ultimi dati scaricati

const VERSION = 'v2';
const SHELL_CACHE = `shell-${VERSION}`;   // pagina e file statici dell'app
const DATA_CACHE  = `data-${VERSION}`;    // ultime risposte lette da Supabase

const SHELL_FILES = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon-192.png',
  '/apple-touch-icon-180.png',
  '/manuale.pdf',
  '/sounds/classico.mp3',
  '/sounds/jazz.mp3',
  '/sounds/melodia.mp3',
  '/sounds/miao.mp3',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll fallisce tutto se un file manca: li aggiungiamo singolarmente
      .then((cache) => Promise.all(
        SHELL_FILES.map((u) => cache.add(u).catch(() => null))
      ))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== SHELL_CACHE && k !== DATA_CACHE)
            .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isSupabaseRest(url) {
  return url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // scritture: solo online

  const url = new URL(req.url);

  // A) Navigazione (apertura app): prima la rete, se manca si usa la copia salvata
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // B) Dati Supabase: prima la rete, offline si mostrano gli ultimi dati scaricati
  if (isSupabaseRest(url)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(DATA_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // C) File statici dell'app (JS, CSS, immagini, suoni, PDF): dalla cache se ci sono,
  //    con aggiornamento in background
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  }
});

// ---- Notifiche push ----

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'App Manutenzioni', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'App Manutenzioni';
  const options = {
    body: data.body || '',
    icon: '/favicon-192.png',
    badge: '/favicon-192.png',
    tag: data.tag,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
