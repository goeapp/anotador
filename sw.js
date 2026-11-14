// Anotador — sw_v1_2_1.js  (subir como sw.js al repo goeapp/anotador)
// v1.2.1: el chequeo de versión nueva (index.html?ver=…) va siempre a la red y no se guarda.
// Guarda la app en el equipo para que abra sin señal. Los datos van por Supabase (nunca se guardan acá).
const CACHE = 'anotador-v1.2.1';
const APP = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];
const CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.31.0/dist/tabler-icons.min.css'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(APP.concat(CDN).map(u => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('anotador-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('supabase.co')) return;                  // datos: siempre a la red
  if (url.searchParams.has('ver')) return;                           // chequeo de versión: siempre a la red
  // La página: primero la red (para tener la última versión), si no hay señal, lo guardado
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(CACHE).then(k => k.put('./index.html', c)); return r; })
      .catch(() => caches.match('./index.html').then(r => r || caches.match('./'))));
    return;
  }
  // Lo demás (íconos, fuentes, librerías): lo guardado, y si no está, la red (y se guarda)
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r && (r.ok || r.type === 'opaque')) { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
    return r;
  })));
});
