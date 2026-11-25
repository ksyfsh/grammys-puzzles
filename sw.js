/* =====================================================================
   sw.js — the "service worker": what makes the app work with no internet.

   The first time the app is opened (with internet), this saves a copy of
   every file listed below on the iPad. After that, the app loads from
   that saved copy, internet or not.

   IMPORTANT WHEN YOU CHANGE ANYTHING:
   Change the version number below (v1 → v2 → v3 ...). That tells the
   iPad to fetch the new files. The iPad picks up the update the next
   time the app is opened with internet (sometimes it takes opening it
   twice).
   ===================================================================== */

const VERSION = 'v4';
const CACHE_NAME = 'grammys-puzzles-' + VERSION;

const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/storage.js',
  'js/sound.js',
  'js/pieces.js',
  'js/puzzle.js',
  'js/app.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'pictures/tulips.jpg',
  'pictures/farm-garden.jpg',
  'pictures/white-rose.jpg',
  'pictures/waxwing.jpg',
  'pictures/bluebird.jpg',
  'pictures/calico-cat.jpg',
  'pictures/kitten.jpg',
  'pictures/yarn.jpg',
  'pictures/robin.jpg',
  'pictures/blue-tit.jpg',
  'pictures/geese.jpg',
  'pictures/giraffes.jpg',
  'pictures/elephants.jpg',
  'pictures/zebra.jpg',
  'pictures/red-panda.jpg',
  'pictures/giant-panda.jpg',
  'pictures/thumbs/robin.jpg',
  'pictures/thumbs/blue-tit.jpg',
  'pictures/thumbs/geese.jpg',
  'pictures/thumbs/giraffes.jpg',
  'pictures/thumbs/elephants.jpg',
  'pictures/thumbs/zebra.jpg',
  'pictures/thumbs/red-panda.jpg',
  'pictures/thumbs/giant-panda.jpg',
  'pictures/thumbs/tulips.jpg',
  'pictures/thumbs/farm-garden.jpg',
  'pictures/thumbs/white-rose.jpg',
  'pictures/thumbs/waxwing.jpg',
  'pictures/thumbs/bluebird.jpg',
  'pictures/thumbs/calico-cat.jpg',
  'pictures/thumbs/kitten.jpg',
  'pictures/thumbs/yarn.jpg',
];

// Save all the files when the app is first installed (or updated).
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

// Throw away copies from older versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((n) => n.startsWith('grammys-puzzles-') && n !== CACHE_NAME)
        .map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

// Every time the app asks for a file: use the saved copy first.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((saved) => {
      if (saved) return saved;
      return fetch(event.request).catch(() => {
        // Offline and not saved: for page loads, fall back to the main page.
        if (event.request.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
