// Retired service worker.
//
// The dashboard no longer uses a service worker. Browsers that registered the
// old one keep checking this URL for updates; this version clears the caches
// it may have created and unregisters itself. It has no fetch handler, so it
// never intercepts a request, and it does not reload open tabs — they simply
// stop being controlled on their next navigation. New-version detection now
// happens in the page (hooks/usePWA.ts).
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const names = await self.caches.keys();
        await Promise.all(names.map((name) => self.caches.delete(name)));
      } finally {
        await self.registration.unregister();
      }
    })()
  );
});
