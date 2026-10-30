// dichava.app — service worker do PAINEL profissional (escopo /clinica/)
// Cuida das notificações push do profissional (novo agendamento, mensagem, etc.)
const CACHE = 'dichava-clinica-v1';

self.addEventListener('install', () => self.skipWaiting());
const META = 'dichava-pro-meta';
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== META).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

// Config pública (mesma do painel) para re-registrar a assinatura sozinho.
const SBU = 'https://gnpwaywyexcevtzbwiyq.supabase.co';
const ANON = 'sb_publishable_JBxiSIYDYRBxgBunmedHfA_BJDCffZ4';
const VAPID = 'BN_L3cK5MByNbFTBYghnja6ryWbnN99_J2JfMiQDu-hKVkPqNJBAKLnnyBDHHSxvGNfaoIBCG1fQemYrExmUDzE';
function _u8(b){ const pad='='.repeat((4-b.length%4)%4); const s=(b+pad).replace(/-/g,'+').replace(/_/g,'/'); const raw=atob(s); const a=new Uint8Array(raw.length); for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i); return a; }
async function _putUid(uid){ try{ const c=await caches.open(META); await c.put('uid', new Response(String(uid||''))); }catch(_){} }
async function _getUid(){ try{ const c=await caches.open(META); const r=await c.match('uid'); return r?(await r.text()):''; }catch(_){ return ''; } }
async function _registrar(sub){
  const j=sub && sub.toJSON(); const uid=await _getUid();
  if(!uid || !j || !j.keys) return;
  await fetch(SBU+'/rest/v1/push_subs?on_conflict=endpoint', {
    method:'POST',
    headers:{ 'apikey':ANON, 'Authorization':'Bearer '+ANON, 'Content-Type':'application/json', 'Prefer':'resolution=merge-duplicates' },
    body: JSON.stringify({ endpoint:j.endpoint, user_id:uid, p256dh:j.keys.p256dh, auth:j.keys.auth, updated_at:new Date().toISOString() })
  });
}
// o painel manda o id do profissional pra cá, pra eu conseguir re-registrar sozinho
self.addEventListener('message', e => { if(e.data && e.data.type==='setUid') _putUid(e.data.uid); });
// quando o navegador rotaciona/expira a assinatura: reinscreve e re-registra na hora
self.addEventListener('pushsubscriptionchange', e => {
  e.waitUntil((async () => {
    try{
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:_u8(VAPID) });
      await _registrar(sub);
    }catch(_){}
  })());
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
