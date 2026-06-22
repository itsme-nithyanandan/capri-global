// sw.js — minimal service worker, mainly to satisfy "Add to Home Screen"
// installability criteria on Android Chrome. Deliberately does NOT cache
// pages aggressively: this app's HTML/JS changes often, and a stale cached
// copy would be worse than just hitting the network. Network-first, with a
// cache fallback only when genuinely offline.
const CACHE_NAME = 'capri-global-shell-v1';
const SHELL_ASSETS = ['./capri_login.html'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
