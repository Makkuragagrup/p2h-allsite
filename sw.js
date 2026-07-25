// Service worker P2H MAKKURAGA GRUP
// Tugasnya cuma satu: cache app shell (index.html + icon) supaya app-nya
// sendiri bisa kebuka tanpa internet. Data P2H tetap disimpan di IndexedDB
// (sudah ditangani di index.html, bukan di sini). Request ke Google Apps
// Script TIDAK di-cache — itu harus selalu request live ke jaringan.

const CACHE_NAME = 'p2h-shell-v7'; // naikkan versi ini tiap kali index.html di-update & ingin paksa refresh cache
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png',
  './favicon-32.png'
];

self.addEventListener('install', (event) => {
  // FIX: cache.addAll() itu all-or-nothing — kalau 1 dari 8 file APP_SHELL
  // gagal di-fetch (404/typo/belum ke-deploy), SELURUH install event reject
  // dan cache jadi kosong total, tanpa error yang kelihatan operator.
  // Akibatnya: app tidak bisa dibuka sama sekali saat cold-start full offline.
  // Sekarang tiap file dicache satu-satu lewat Promise.allSettled — satu file
  // gagal cuma bikin file itu tidak ke-cache, bukan menjatuhkan semuanya.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(
        APP_SHELL.map((url) =>
          fetch(url).then((res) => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return cache.put(url, res);
          }).catch((err) => {
            console.log('[SW] Gagal cache app-shell:', url, err.message);
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Jangan pernah cache request ke GAS — itu harus selalu live ke server.
  if (url.hostname.includes('script.google.com') || url.hostname.includes('script.googleusercontent.com')) {
    return; // biarkan lewat ke network apa adanya
  }
  if (event.request.method !== 'GET') return;

  // FIX: request navigasi (buka/reload halaman) ditangani terpisah.
  // caches.match(event.request) butuh URL PERSIS SAMA — kalau WebView/Android
  // menambahkan query string apa pun ke request navigasi, key cache tidak akan
  // pernah cocok walau app-shell sudah ter-cache dengan benar. Untuk navigasi,
  // kalau network gagal, langsung fallback ke './index.html' dari cache,
  // apa pun URL persisnya — supaya app tetap kebuka waktu full offline.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  // Stale-while-revalidate: langsung balas dari cache kalau ada (cepat + jalan offline),
  // sambil diam-diam ambil versi terbaru dari network buat cache berikutnya.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request).then((res) => {
        if (res && res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return res;
      }).catch(() => cached); // offline & tidak ada di cache -> biarkan gagal
      return cached || networkFetch;
    })
  );
});
