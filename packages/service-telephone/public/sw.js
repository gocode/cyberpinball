// Garde la page du raccourci sur le téléphone (page.js) : sans Internet, ou le service en panne, le
// raccourci s'ouvre quand même et renvoie à la dernière adresse connue de la borne. Ni la clé ni
// l'adresse ne passent par ici : seulement les fichiers de la page. L'API (/api/) n'est jamais gardée.
'use strict';

const CACHE = 'cyberpinball-raccourci-1';
const SHELL = ['/', '/page.js', '/page.css', '/telephone-core.js', '/icone-192.png', '/icone-180.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  // La page d'une borne : le réseau d'abord (une version neuve), la page gardée sinon.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }
  // Les fichiers de la page : le réseau d'abord, la copie gardée sans réseau.
  event.respondWith(
    fetch(event.request)
      .then((r) => {
        if (r.ok && SHELL.includes(url.pathname)) {
          const copy = r.clone();
          void caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(event.request)),
  );
});
