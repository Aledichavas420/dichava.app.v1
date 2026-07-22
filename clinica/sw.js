// dichava.app — service worker do PAINEL profissional (escopo /clinica/)
// Cuida das notificações push do profissional (novo agendamento, mensagem, etc.)
const CACHE = 'dichava-clinica-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

// ── PUSH ──
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data.json(); } catch (_) { d = { title: 'dichava · painel', body: e.data ? e.data.text() : '' }; }
  const title = d.title || 'dichava · painel';
  const opts = {
    body: d.body || '',
    icon: './icon-pro-192.png',
    badge: './icon-pro-192.png',
    data: { url: d.url || '/clinica/' },
    vibrate: [60, 40, 60],
    tag: d.tag || undefined,
    renotify: !!d.tag,
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/clinica/';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cl => {
      for (const c of cl) { if (c.url.includes('/clinica') && 'focus' in c) { c.navigate && c.navigate(url); return c.focus(); } }
      return clients.openWindow(url);
    })
  );
});
