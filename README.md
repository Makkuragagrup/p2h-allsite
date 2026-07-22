# P2H MAKKURAGA GRUP - Site Torete, Buleleng & Laronai

Aplikasi P2H (Pemeriksaan sebelum Pengoperasian) offline-first untuk operator/driver alat berat.
Single-page app: input tersimpan lokal di IndexedDB, sync ke Google Sheets via Google Apps Script
begitu ada jaringan.

## Isi folder ini
- `index.html` — seluruh aplikasi (HTML+CSS+JS jadi satu file)
- `manifest.json` — supaya bisa "Add to Home Screen" / diinstall seperti app
- `sw.js` — service worker, cache app shell supaya bisa dibuka tanpa internet
- `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` — icon app

## Cara deploy ke GitHub Pages
1. Buat repo baru di GitHub (bisa private).
2. Upload semua isi folder ini ke **root** repo (bukan di dalam subfolder) —
   nama file WAJIB `index.html`, jangan diganti nama lain.
3. Buka **Settings → Pages** di repo.
4. Source: **Deploy from a branch** → Branch: `main` → Folder: `/ (root)` → Save.
5. Tunggu 1-2 menit, GitHub kasih URL: `https://<username>.github.io/<nama-repo>/`
6. Buka URL itu (bukan file lokal) — dari sinilah PIN/GAS/IndexedDB akan jalan normal,
   karena originnya sudah `https://` bukan `file://`.

## Setelah online sekali, bisa dipakai offline
- Kunjungi URL GitHub Pages minimal 1x saat online (untuk men-download & cache app shell).
- Setelah itu app bisa dibuka tanpa internet — form, checklist, simpan ke IndexedDB semua
  tetap jalan offline.
- Yang butuh internet HANYA proses **sync ke Google Sheets** (dan sync Master Unit) —
  ini otomatis jalan lagi begitu sinyal balik (lihat mekanisme auto-sync di `index.html`).

## Kalau update index.html di kemudian hari
Naikkan angka versi `CACHE_NAME` di `sw.js` (mis. `p2h-shell-v1` → `p2h-shell-v2`),
supaya browser operator narik ulang file yang baru, bukan kepakai cache lama selamanya.

## Catatan keamanan
`GAS_URL` di dalam `index.html` ini hardcoded dan akan ikut terbaca siapa saja yang buka
"View Source" di URL publik. Kalau repo/Pages-nya publik, siapapun yang tahu URL GAS ini
bisa mencoba POST data ke situ juga (Apps Script Web App yang dideploy "Anyone" tidak
mengecek siapa pengirimnya). Kalau ini jadi concern, pertimbangkan:
- Repo di-private + GitHub Pages untuk repo private (butuh GitHub Pro/Team), atau
- Tambah validasi token/secret sederhana di sisi `Code.gs` sebelum menyimpan data.

## PIN Supervisor
PIN untuk buka kunci profil/tipe unit ada di `index.html`, cari `SUPERVISOR_PIN`.
