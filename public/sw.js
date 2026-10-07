// sw.js — Notebook PWA: red primero (siempre la versión nueva) y caché como respaldo sin conexión
const CACHE = 'notebook-v4';
const CORE = [
  '/', '/index.html', '/style.css', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png',
  '/js/main.js', '/js/core.js', '/js/i18n.js', '/js/shell.js', '/js/editor.js', '/js/ask.js', '/js/study.js',
  '/js/search.js', '/js/account.js', '/js/importer.js', '/js/auth.js', '/js/markdown.js', '/js/theme.js', '/js/landing.js', '/js/theme-boot.js',
  '/vendor/marked.esm.js', '/vendor/purify.es.mjs',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== location.origin || e.request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return; // la API nunca se cachea (datos privados)
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('/index.html')))
  );
});
