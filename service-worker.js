// Scrabble Arbitre IA - Service Worker (100% Offline Support)
const CACHE_NAME = 'scrabble-arbitre-cache-v2';

const STATIC_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './lib/tailwind.min.js',
  './lib/chart.min.js',
  './lib/opencv.js',
  './lib/tesseract.min.js',
  './data/scrabble_ods.json',
  './data/ods8.txt',
  './js/constants.js',
  './js/dictionary.js',
  './js/score-calculator.js',
  './js/rules-engine.js',
  './js/cv-pipeline.js',
  './js/ocr-engine.js',
  './js/test-generator.js',
  './js/storage-stats.js',
  './js/demo.js',
  './js/app-ui.js'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[ServiceWorker] Mise en cache des ressources locales pour le mode hors-ligne...');
      for (const asset of STATIC_ASSETS) {
        try {
          await cache.add(asset);
        } catch (err) {
          console.warn(`[ServiceWorker] Impossible de pré-cacher: ${asset}`, err);
        }
      }
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[ServiceWorker] Suppression de l\'ancien cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Cache-First strategy for reliable offline execution
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback to index.html if navigating
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
