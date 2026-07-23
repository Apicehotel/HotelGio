// Service worker — App Manutenzioni
// Solo notifiche push. La cache offline e' stata rimossa in via precauzionale.
// VERSION v3: all'attivazione svuota tutte le cache create dalla versione precedente.

const VERSION = 'v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Nessun handler 'fetch': le richieste vanno sempre alla rete, come prima.

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
