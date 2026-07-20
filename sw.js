// dichava.app — service worker v194
const CACHE = 'dichavard-v277';
const ASSETS = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(()=>{})));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

// network-first com fallback pro cache (app continua abrindo offline)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const req = e.request;
  // Para navegação/HTML, ignoramos o cache HTTP do navegador (cache:'no-store'),
  // senão o GitHub Pages pode devolver uma versão antiga do index.html mesmo online.
  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');
  const fetchReq = isHTML ? new Request(req.url, { cache: 'no-store' }) : req;
  e.respondWith(
    fetch(fetchReq).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./')))
  );
});

// ── NOTIFICAÇÕES PUSH ──
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: 'dichava.rd', body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'dichava.rd';
  const opts = {
    body: d.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    image: d.image || undefined,
    data: { url: d.url || './' },
    vibrate: [60, 40, 60],
    tag: d.tag || undefined,
    renotify: !!d.tag
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cl => {
      for (const c of cl) { if ('focus' in c) { c.navigate && c.navigate(url); return c.focus(); } }
      return clients.openWindow(url);
    })
  );
});
