const CACHE = 'atendimentos-pwa-v7';
const ARQUIVOS = ['./','./index.html','./app.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => { if (e.request.method === 'GET' && new URL(e.request.url).origin === location.origin) e.respondWith(caches.match(e.request).then(r => r || fetch(e.request))); });
