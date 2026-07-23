// Service worker P2H MAKKURAGA GRUP
// Tugasnya cuma satu: cache app shell (index.html + icon) supaya app-nya
// sendiri bisa kebuka tanpa internet. Data P2H tetap disimpan di IndexedDB
// (sudah ditangani di index.html, bukan di sini). Request ke Google Apps
// Script TIDAK di-cache — itu harus selalu request live ke jaringan.

const CACHE_NAME = 'p2h-shell-v5'; // naikkan versi ini tiap kali index.html di-update & ingin paksa refresh cache
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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
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
