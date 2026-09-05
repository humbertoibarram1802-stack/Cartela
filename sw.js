/* Cartela · service worker
   - Shell (html/css/js/manifest): se guarda en instalación y se sirve desde caché, actualizando en segundo plano.
   - Datos e imágenes (data/): caché primero; si no está, red y se guarda.
   - Google Fonts: caché primero (respuestas opacas están bien). */
const VERSION = 'v3';
const SHELL = `cartela-shell-${VERSION}`;
const RUNTIME = 'cartela-runtime';
const FONTS = 'cartela-fonts';
const SHELL_FILES = ['./', 'index.html', 'app.css?v=3', 'app.js?v=3', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('cartela-shell-') && k !== SHELL).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith('catalogo.json')) { e.respondWith(networkFirst(req, RUNTIME)); return; }
    if (url.pathname.includes('/data/')) { e.respondWith(cacheFirst(req, RUNTIME)); return; }
    e.respondWith(staleWhileRevalidate(req, SHELL)); return;
  }
  if (url.hostname.endsWith('googleapis.com') || url.hostname.endsWith('gstatic.com')) { e.respondWith(cacheFirst(req, FONTS)); }
});
async function cacheFirst(req, name) {
  const hit = await caches.match(req, { ignoreSearch: true }); if (hit) return hit;
  try { const res = await fetch(req); if (res.ok || res.type === 'opaque') (await caches.open(name)).put(req, res.clone()); return res; }
  catch { return new Response('', { status: 504, statusText: 'Sin conexión' }); }
}
async function networkFirst(req, name) {
  const cache = await caches.open(name);
  try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
  catch { return (await cache.match(req, { ignoreSearch: true })) || (await caches.match(req)) || new Response('', { status: 504, statusText: 'Sin conexión' }); }
}
async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return hit || (await net) || caches.match('index.html');
}
