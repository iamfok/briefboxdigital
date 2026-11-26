// Employee app service worker: keeps the app shell available offline. API calls always go to the network.
const CACHE = 'team-v1';
const SHELL = ['/team', '/panel/app-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== CACHE).map(x => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  if (!(u.pathname === '/team' || u.pathname.startsWith('/panel/') || u.pathname.startsWith('/assets/'))) return;
  // network first, so a new version shows at once; the cached copy is used only offline
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return r; })
    .catch(() => caches.match(e.request).then(r => r || new Response('<!doctype html><meta name=viewport content="width=device-width"><body style="font-family:system-ui;padding:40px;text-align:center"><h2>You are offline</h2><p>Connect to the internet to check in.</p>', { headers: { 'Content-Type': 'text/html' } }))));
});
