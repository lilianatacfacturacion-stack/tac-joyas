const CACHE = 'tac-joyas-v1';
const ASSETS = [
  './',
  './index.html',
  './css/base.css',
  './css/components.css',
  './css/screens.css',
  './js/app.js',
  './js/models/Project.js',
  './js/models/Material.js',
  './js/models/Hardware.js',
  './js/engines/DesignEngine.js',
  './js/engines/MaterialEngine.js',
  './js/engines/PreviewEngine.js',
  './js/engines/LaserEngine.js',
  './js/detection/DetectionProvider.js',
  './js/detection/ManualDetection.js',
  './js/storage/Storage.js',
  './js/screens/HomeScreen.js',
  './js/screens/PhotoScreen.js',
  './js/screens/DetectScreen.js',
  './js/screens/MaterialScreen.js',
  './js/screens/DesignScreen.js',
  './js/screens/HardwareScreen.js',
  './js/screens/ResultScreen.js',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request))
  );
});
