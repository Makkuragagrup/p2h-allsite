// Service worker P2H MAKKURAGA GRUP
// Tugasnya: (1) cache app shell (index.html + icon) supaya app-nya sendiri
// bisa kebuka tanpa internet, dan (2) FIX 9: Background Sync — kirim data
// P2H yang masih pending ke GAS walau app sudah ditutup total, begitu
// browser mendeteksi koneksi nyata kembali (event 'sync').
// Data P2H disimpan di IndexedDB yang SAMA dengan yang dipakai index.html
// (DB 'P2HDB', store 'records') — di sini kita cuma baca/update, TIDAK
// pernah membuat ulang skema (itu tetap tanggung jawab index.html).

// ── Harus SAMA PERSIS dengan GAS_URL di index.html ──
const GAS_URL = 'https://script.google.com/macros/s/AKfycbxqXI73VkH5KJ5gbZJ-BU_9Oi0nSuX_VHfOuMpYH1IJi1VvLUPt4ZYQ64R9oVofnl8/exec';

// Cuma butuh namaField & hmLabel per unitType untuk susun payload yang sama
// persis dengan buildPayload() di index.html — HARUS disamakan manual kalau
// index.html menambah unitType baru.
const FORMS_META = {
  dt:  { namaField: 'Nama Lengkap Driver',   hmLabel: 'HM / KM' },
  exa: { namaField: 'Nama Lengkap Operator', hmLabel: 'HM' },
  gdv: { namaField: 'Nama Lengkap Operator', hmLabel: 'HM' },
  lv:  { namaField: 'Nama Lengkap Driver',   hmLabel: 'HM / KM' }
};

const RETRY_DELAYS_MS = [60000, 300000, 900000, 3600000]; // samakan dengan index.html

function openRecordsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('P2HDB', 3);
    // Tidak definisikan onupgradeneeded — skema sudah dibuat index.html.
    // Kalau DB belum pernah dibuat sama sekali, getAll di bawah akan gagal
    // secara aman (ditangkap try/catch di syncPendingRecords).
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}
function swGetAllRecords(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readonly');
    const req = tx.objectStore('records').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function swUpdateRecord(db, localId, updates) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('records', 'readwrite');
    const store = tx.objectStore('records');
    const getReq = store.get(localId);
    getReq.onsuccess = () => {
      const record = { ...getReq.result, ...updates };
      const putReq = store.put(record);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}
function buildPayloadSW(rec) {
  const cfg = FORMS_META[rec.unitType] || {};
  const row = {
    sheetName: rec.sheetName,
    'P2H ID': rec['P2H ID'] || '',
    'Tanggal P2H': rec.tanggalInput || rec.tanggal,
    'Jam Pengisian P2H': rec.jam,
    [cfg.namaField]: rec[cfg.namaField],
    'Lokasi Site': rec['Lokasi Site'] || '',
    'Pihak Penyewa': rec['Pihak Penyewa'] || '',
    'ID Unit': rec['ID Unit'],
    [cfg.hmLabel]: rec[cfg.hmLabel] || '',
    'Keterangan Pengecekan': rec['Keterangan Pengecekan'],
    'Tindakan': rec['Tindakan'],
    'Jam Selesai P2H': rec['Jam Selesai P2H'],
    'Durasi P2H': rec['Durasi P2H'] || ''
  };
  Object.assign(row, rec.checklist);
  return row;
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-p2h') {
    event.waitUntil(syncPendingRecords());
  }
});

async function syncPendingRecords() {
  let db;
  try {
    db = await openRecordsDB();
  } catch (e) {
    console.log('[BGSync] Gagal buka IndexedDB:', e.message);
    return; // jangan throw -> tidak perlu browser jadwalkan ulang untuk error ini
  }

  const records = await swGetAllRecords(db).catch(() => []);
  const toSync = records.filter((r) => r.status === 'pending' || r.status === 'error');
  if (toSync.length === 0) return;

  let anyNetworkFailure = false;

  for (const rec of toSync) {
    try {
      const payload = buildPayloadSW(rec);
      const res = await fetch(GAS_URL, {
        method: 'POST',
        body: JSON.stringify({ action: 'submitP2H', data: payload }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow'
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch (e) { json = { status: 'error', message: 'Response bukan JSON valid' }; }

      if (json.status === 'ok') {
        await swUpdateRecord(db, rec.localId, {
          status: 'synced', syncedAt: new Date().toISOString(),
          errorMsg: '', retryCount: 0, nextRetryAt: null
        });
      } else {
        const retryCount = (rec.retryCount || 0) + 1;
        const delayMs = RETRY_DELAYS_MS[Math.min(retryCount - 1, RETRY_DELAYS_MS.length - 1)];
        await swUpdateRecord(db, rec.localId, {
          status: 'error', errorMsg: json.message || 'Response tidak OK',
          retryCount, nextRetryAt: Date.now() + delayMs
        });
      }
    } catch (e) {
      // Gagal karena network (bukan gagal dari server) -> tandai supaya
      // Background Sync API browser tahu untuk reschedule otomatis dengan
      // backoff bawaannya sendiri, terpisah dari jadwal nextRetryAt kita.
      anyNetworkFailure = true;
    }
  }

  if (anyNetworkFailure) {
    throw new Error('[BGSync] Sebagian gagal karena jaringan — minta browser jadwalkan ulang');
  }
}

const CACHE_NAME = 'p2h-shell-v11'; // naikkan versi ini tiap kali index.html di-update & ingin paksa refresh cache
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
  // FIX 7: file KRITIS (./ dan ./index.html) wajib berhasil di-cache dulu.
  // Sebelumnya semua file (termasuk index.html) pakai Promise.allSettled yang
  // TIDAK PERNAH reject — jadi skipWaiting() tetap jalan walau index.html gagal
  // ke-cache (misal sinyal putus di tengah update). Akibatnya SW baru ambil
  // alih dan activate() menghapus cache lama yang lengkap, padahal cache baru
  // bisa jadi tidak punya index.html sama sekali -> full offline gagal total.
  // Sekarang: kalau file kritis gagal, seluruh install DIBATALKAN (reject),
  // SW lama & cache lama yang masih lengkap tetap aktif, tidak ada yang dihapus.
  const CRITICAL = ['./', './index.html'];
  const OPTIONAL = APP_SHELL.filter((u) => !CRITICAL.includes(u));

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of CRITICAL) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Gagal cache file KRITIS: ' + url + ' (HTTP ' + res.status + ')');
        await cache.put(url, res);
      }
      await Promise.allSettled(
        OPTIONAL.map((url) =>
          fetch(url).then((res) => {
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return cache.put(url, res);
          }).catch((err) => {
            console.log('[SW] Gagal cache app-shell (opsional):', url, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
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
  // FIX 10: Cache-first untuk navigasi (bukan network-first).
  // Sebelumnya fetch() dicoba dulu ke network sebelum fallback ke cache —
  // di sinyal lemah/menggantung (bukan airplane mode bersih), fetch() bisa
  // butuh beberapa detik sebelum reject. Selama itu, Chrome/WebAPK punya
  // timeout navigasi sendiri dan bisa keburu menampilkan halaman default
  // "Anda offline" SEBELUM .catch() kita sempat jalan. Sekarang: kalau
  // index.html sudah ada di cache, balas LANGSUNG dari cache (instan, tidak
  // ada window waktu buat Chrome ambil alih), baru diam-diam update cache
  // dari network di background (stale-while-revalidate) untuk sesi berikutnya.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => {
        const networkFetch = fetch(event.request).then((res) => {
          if (res && res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', clone));
          }
          return res;
        }).catch(() => cached);
        return cached || networkFetch;
      })
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
