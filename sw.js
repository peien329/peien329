// 離線快取：App 本體與地圖資料都存起來，沒網路也能打開
const CACHE = 'footprints-v1';
const ASSETS = [
  './',
  'index.html',
  'css/style.css',
  'js/app.js',
  'js/db.js',
  'js/map.js',
  'js/image.js',
  'js/continents.js',
  'vendor/d3.min.js',
  'vendor/topojson-client.min.js',
  'vendor/exifr-lite.esm.js',
  'data/world-50m.json',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 先用網路（拿到最新版），失敗再用快取
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }).then((r) => r || caches.match('index.html'))),
  );
});
