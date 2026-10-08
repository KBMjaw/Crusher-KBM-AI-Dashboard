/* Crusher Monitor service worker — offline app shell + push-ready handlers. */

const VERSION = 'cm-v1.0.0';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/js/main.js',
  '/js/config.js',
  '/js/router.js',
  '/js/core/auth.js',
  '/js/core/control.js',
  '/js/core/format.js',
  '/js/core/settings.js',
  '/js/core/storage.js',
  '/js/core/store.js',
  '/js/services/dataService.js',
  '/js/services/mockService.js',
  '/js/services/mockData.js',
  '/js/services/apiService.js',
  '/js/services/reportService.js',
  '/js/pwa/install.js',
  '/js/pwa/notifications.js',
  '/js/ui/icons.js',
  '/js/ui/components.js',
  '/js/ui/charts.js',
  '/js/ui/shell.js',
  '/js/ui/scene.js',
  '/js/ui/widgets.js',
  '/assets/logo-mark.svg',
  '/assets/logo-mark.png',
  '/assets/logo-full.svg',
  '/js/views/login.js',
  '/js/views/dashboard.js',
  '/js/views/machine.js',
  '/js/views/camera.js',
  '/js/views/alerts.js',
  '/js/views/analytics.js',
  '/js/views/profile.js',
  '/js/views/help.js',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/apple-touch-icon.png',
  '/icons/favicon-32.png',
];
// Large report libraries are cached on first use.
const LAZY = ['/vendor/jspdf.umd.min.js', '/vendor/jspdf.plugin.autotable.min.js', '/vendor/xlsx.mini.min.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // fonts, future API etc. go to network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/ws/')) return;

  // Navigations: network first so new deployments show up, cached shell offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Static assets: stale-while-revalidate.
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: true });
      const network = fetch(req)
        .then((res) => {
          if (res.ok && (SHELL.includes(url.pathname) || LAZY.includes(url.pathname))) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

/* ── Push notifications (ready for the backend; no push server yet) ── */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Crusher Monitor', body: event.data?.text() }; }
  const title = data.title || 'Crusher Monitor';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag || 'crusher-monitor',
      data: { url: data.url || '/#/alerts' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || '/#/alerts';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (win) { win.focus(); win.navigate(target); return; }
      return self.clients.openWindow(target);
    }),
  );
});
