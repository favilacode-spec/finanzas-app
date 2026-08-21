const CACHE = 'mbcr-v5';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // no tocar Supabase ni APIs externas

  // Navegaciones (abrir la app): red primero, con respaldo al shell cacheado
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const net = await fetch(req);
        const c = await caches.open(CACHE);
        c.put('/index.html', net.clone());
        return net;
      } catch {
        const c = await caches.open(CACHE);
        return (await c.match('/index.html')) || (await c.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Estáticos (JS/CSS/íconos): cache primero, y actualiza en segundo plano
  e.respondWith((async () => {
    const c = await caches.open(CACHE);
    const cached = await c.match(req);
    const network = fetch(req).then((net) => {
      if (net && net.status === 200) c.put(req, net.clone());
      return net;
    }).catch(() => cached);
    return cached || network;
  })());
});

/* ---------- Notificaciones push ---------- */
self.addEventListener('push', (e) => {
  let d = { title: 'Mi Billetera', body: '', url: '/' };
  try { d = { ...d, ...e.data.json() }; } catch { if (e.data) d.body = e.data.text(); }
  e.waitUntil(self.registration.showNotification(d.title, {
    body: d.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url },
    vibrate: [60, 40, 60],
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) { if ('focus' in c) { c.navigate(url); return c.focus(); } }
    if (clients.openWindow) return clients.openWindow(url);
  })());
});
