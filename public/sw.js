// Trabajador de la app instalada: muestra los avisos que manda el servidor y, al tocarlos, abre el Tablero.
// No guarda nada sin conexión: el Tablero siempre trae los datos al momento.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Tablero CACCO', {
    body: d.cuerpo || '', tag: d.tag || undefined, renotify: !!d.tag, icon: '/icono-192.png', badge: '/icono-insignia.png',
    lang: 'es-PA', data: { url: d.url || '/' } }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    const w = ws.find(c => new URL(c.url).origin === self.location.origin);
    if (w) { w.postMessage({ abrir: url }); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
