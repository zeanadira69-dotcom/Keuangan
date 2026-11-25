const CACHE_NAME = "catatan-keuangan-v3.6";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./aset.js",
  "./manifest.json"
];

self.addEventListener("install", event => {

  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(FILES_TO_CACHE))
  );

});

self.addEventListener("activate", event => {

  event.waitUntil(

    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )

    .then(() => self.clients.claim())

  );

});

// Network-first: selalu ambil versi terbaru kalau online,
// pakai cache kalau offline. Jadi update aplikasi langsung muncul.
self.addEventListener("fetch", event => {

  if (event.request.method !== "GET") return;

  // Harga dari API jangan di-cache oleh service worker:
  // aplikasi sudah punya cache sendiri dengan keterangan waktu.
  const host = new URL(event.request.url).hostname;
  if (["xaus.com", "api.coingecko.com", "open.er-api.com"].includes(host)) return;

  event.respondWith(

    fetch(event.request)
      .then(response => {

        if (response && response.status === 200) {
          const salinan = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, salinan));
        }

        return response;

      })
      .catch(() => caches.match(event.request))

  );

});
