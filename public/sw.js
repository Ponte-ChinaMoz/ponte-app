// Service worker: guarda a app para abrir rapidamente e funcionar com pouca ou nenhuma rede.
const VERSION = 'ponte-v1.4.0';
const SHELL = [
  '/', '/index.html', '/css/app.css', '/manifest.webmanifest',
  '/js/app.js', '/js/ui.js', '/js/api.js', '/js/i18n.js', '/js/translations.js', '/js/voice.js', '/js/voice-commands.js', '/js/countries.js', '/js/pay.js',
  '/js/screens/main.js', '/js/screens/trade.js', '/js/screens/travel.js', '/js/screens/chat.js', '/js/screens/shop.js', '/js/screens/go.js', '/js/screens/plus.js', '/js/screens/vision.js', '/js/screens/track.js', '/js/screens/service.js',
  '/icons/icon-192.png', '/icons/apple-touch-icon.png',
  '/fonts/manrope-latin-400-normal.woff2', '/fonts/manrope-latin-500-normal.woff2', '/fonts/manrope-latin-600-normal.woff2',
  '/fonts/manrope-latin-700-normal.woff2', '/fonts/manrope-latin-800-normal.woff2',
  '/fonts/bricolage-grotesque-latin-600-normal.woff2', '/fonts/bricolage-grotesque-latin-800-normal.woff2',
  '/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css',
];
// Conteúdos que ficam disponíveis offline (última versão vista).
const OFFLINE_API = ['/api/config', '/api/home', '/api/places', '/api/fairs', '/api/holidays', '/api/sales', '/api/rates', '/api/faq', '/api/plans', '/api/partners', '/api/promotions', '/api/categories', '/api/suppliers', '/api/products', '/api/catalog', '/api/groups'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && !k.startsWith('ponte-tiles')).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Mosaicos do mapa: cache primeiro (até ~400 mosaicos).
  if (/tile\.|tiles?\//.test(url.href) && url.origin !== location.origin) {
    e.respondWith(caches.open('ponte-tiles').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok || res.type === 'opaque') {
          c.put(req, res.clone());
          c.keys().then((k) => { if (k.length > 400) c.delete(k[0]); });
        }
        return res;
      } catch { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (!OFFLINE_API.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'))) return;
    // Rede primeiro; sem rede, a última resposta guardada.
    e.respondWith(fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(async () => (await caches.match(req)) || new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  if (url.pathname.startsWith('/admin') || url.pathname.startsWith('/uploads/')) return;

  // Ficheiros da app: cache primeiro e actualização em segundo plano.
  e.respondWith(caches.match(req, { ignoreSearch: url.pathname === '/' }).then((hit) => {
    const net = fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => hit || caches.match('/index.html'));
    return hit || net;
  }));
});
