// The service worker behind "הצג באתר" as an installed app (wall.html, USER 2026-09-20).
//
// It exists for one reason: a display on a synagogue wall must come up after a power cut whether or not the
// line is back. So the page's own files — wall.html, the kiosk page it hosts, the fonts, the ornaments — are
// kept in a cache and served from it first, with the network refreshing them in the background. The SETTINGS
// are not cached here; the page keeps its last payload in localStorage itself, and says how old it is.
//
// Nothing else is cached: the Supabase calls, the weather and the Nedarim schedule always go to the network,
// because a stale answer there would be worse than none.
const CACHE = 'kiosk-wall-v1';
const FILES = ['./wall.html', './kiosk.html', './ssd-fonts.js', './ssd-ornaments.js', './wall-manifest.webmanifest'];

self.addEventListener('install', e => {
  // addAll fails as a whole if any one file 404s, and a display must install even when (say) the ornaments
  // file has not been deployed — so each is added on its own and a miss is simply skipped.
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(FILES.map(f => c.add(f).catch(() => { })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;                       // Supabase / weather / Nedarim: network only
  if (!/\.(html|js|webmanifest|css|png|ico|woff2?)$/i.test(url.pathname)) return;
  // Cache first, and refresh in the background: the wall comes up instantly and with no line at all, and a
  // deployed change is picked up by the next reload.
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504 });
  }));
});
