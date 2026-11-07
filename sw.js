// Service worker: makes CardScan installable and lets it start without network.
//  * app files and models: cache first (models are large and rarely change; a new VERSION refreshes them)
//  * price data (data/): network first, cached copy when offline
//  * libraries from jsdelivr: cache first
const VERSION = 'v3';
// Replaced by the deploy workflow with the commit id, so every deploy is a new service worker
// (the app then shows "New version – tap to update"). Caches stay as long as VERSION stays.
const BUILD = 'dev';
const APP = `cardscan-app-${VERSION}`;
const DATA = 'cardscan-data';
const SHELL = [
  './', 'index.html', 'style.css', 'manifest.webmanifest', 'icon.svg', 'icons/icon-192.png',
  'js/app.js', 'js/api.js', 'js/camera.js', 'js/cardpage.js', 'js/codematch.js', 'js/detect.js',
  'js/ocr.js', 'js/parse.js', 'js/prices.js', 'js/recognize.js', 'js/scan.js', 'js/store.js', 'js/util.js', 'js/depot.js', 'js/share.js', 'js/masters.js', 'js/mastercalc.js', 'js/deck.js', 'js/decks.js', 'js/lists.js', 'js/holo.js', 'js/sortpile.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(APP).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('cardscan-app-') && k !== APP) await caches.delete(k);
    await self.clients.claim();
  })());
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.includes('/data/')) e.respondWith(networkFirst(req, DATA));
    else if (url.pathname.includes('/models/')) e.respondWith(cacheFirst(req, APP));
    else e.respondWith(networkFirst(req, APP)); // app files: always fresh when online
  } else if (url.hostname === 'cdn.jsdelivr.net' || url.hostname.endsWith('tessdata.projectnaptha.com')) {
    e.respondWith(cacheFirst(req, 'cardscan-lib'));
  }
});
