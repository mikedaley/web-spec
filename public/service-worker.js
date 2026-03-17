/**
 * Self-destruct service worker — purges all caches and unregisters itself.
 * Deployed to clean up stale caches from the previous PWA implementation.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.registration.unregister())
  );
  self.clients.claim();
});
