// Service Worker: macht die App offline-fähig.
// Neue Dateien in SHELL eintragen und dann VERSION hochzählen (sonst fehlen sie offline).
const VERSION = 'kleiderschrank-v2';
const CDN_CACHE = 'kleiderschrank-cdn'; // KI-Bibliothek von jsDelivr (bleibt über Updates erhalten)

const SHELL = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './js/app.js',
  './js/backup.js',
  './js/bgremove.js',
  './js/colors.js',
  './js/config.js',
  './js/db.js',
  './js/outfit.js',
  './js/rating.js',
  './js/store.js',
  './js/suggest.js',
  './js/ui.js',
  './js/wardrobe.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('kleiderschrank-') && k !== VERSION && k !== CDN_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Eigene Dateien: online immer die neueste Version holen (Updates sind sofort da),
  // offline oder bei sehr langsamer Verbindung (> 3 s) aus dem Cache
  if (url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const res = await Promise.race([
          fetch(req, { cache: 'no-cache' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
        ]);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        return (await cache.match(req, { ignoreSearch: true }))
          || (req.mode === 'navigate' && (await cache.match('./index.html')))
          || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // KI-Bibliothek (nur auf Knopfdruck geladen): einmal laden, dann aus dem Cache
  if (url.hostname === 'cdn.jsdelivr.net') {
    e.respondWith(
      caches.open(CDN_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
  // Alles andere (z. B. Modelldateien von huggingface.co) geht direkt ans Netz;
  // transformers.js speichert das Modell selbst im Browser-Cache.
});
