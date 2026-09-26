# Absen Dulu — API + Mobile Web App

Aplikasi absensi karyawan siap-jalan: REST API (Node.js + Express + SQLite) dan frontend PWA
(Progressive Web App) yang bisa **diinstal ke layar utama HP** seperti aplikasi native, tanpa
perlu Play Store / App Store.

## Fitur
- GPS geofencing: absen hanya tercatat valid jika dalam radius kantor yang ditentukan admin
- Verifikasi selfie saat absen masuk/pulang (foto tersimpan di server)
- Absen masuk/pulang real-time
- Pengajuan cuti/sakit/izin + persetujuan admin
- Timesheet aktivitas harian
- Laporan rekap bulanan (pribadi & semua karyawan) + ekspor CSV
- Multi-role: karyawan & admin/HR (pendaftar pertama otomatis jadi admin)
- Bisa diinstal sebagai aplikasi di HP (Add to Home Screen) — ikon & splash sendiri, bisa dibuka offline (shell)

## Struktur Proyek
```
absen-dulu-server/
  server.js              # entry point Express
  src/
    db.js                 # skema SQLite (better-sqlite3)
    middleware/auth.js     # verifikasi JWT
    routes/                # auth, attendance, leave, timesheet, reports, settings
    utils/geo.js            # perhitungan jarak GPS (haversine)
  public/                 # frontend PWA (HTML/CSS/JS murni, tanpa build step)
    index.html, app.js, styles.css, manifest.json, service-worker.js, icons/
  Dockerfile, docker-compose.yml
  .env.example
```

## Menjalankan di server (VPS / cloud) — cara cepat

### Opsi A: Docker (paling praktis)
Butuh Docker & Docker Compose terpasang di server.
```bash
cd absen-dulu-server
cp .env.example .env        # lalu edit JWT_SECRET di file .env
docker compose up -d --build
```
Aplikasi langsung berjalan di `http://ALAMAT_SERVER:3000`.

### Opsi B: Node.js langsung + PM2
Server perlu Node.js 18+ (cek: `node -v`).
```bash
cd absen-dulu-server
npm install
cp .env.example .env
nano .env                    # isi JWT_SECRET dengan string acak yang panjang

npm install -g pm2
pm2 start server.js --name absen-dulu
pm2 save
pm2 startup                  # ikuti instruksi agar auto-start saat server reboot
```

> Catatan: `better-sqlite3` adalah modul native. Jika `npm install` gagal saat kompilasi,
> pasang dulu: `sudo apt-get install -y python3 make g++` (Ubuntu/Debian) lalu ulangi `npm install`.

### Mengakses lewat domain + HTTPS (disarankan, wajib untuk GPS & kamera di HP)
Browser hanya mengizinkan akses GPS/kamera di halaman **HTTPS** (atau `localhost`). Pasang Nginx
sebagai reverse proxy + sertifikat gratis dari Let's Encrypt:

```nginx
# /etc/nginx/sites-available/absen-dulu
server {
    listen 80;
    server_name absen.domainanda.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        client_max_body_size 10M;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/absen-dulu /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d absen.domainanda.com
```

## Mengakses sebagai "aplikasi mobile" di HP
1. Buka `https://absen.domainanda.com` di Chrome (Android) atau Safari (iOS).
2. Android/Chrome: ketuk menu (⋮) → **Add to Home screen / Instal aplikasi**.
   iOS/Safari: ketuk tombol Share → **Add to Home Screen**.
3. Ikon "Absen Dulu" muncul di layar utama, terbuka tanpa address bar seperti aplikasi biasa.
4. Saat absen pertama kali, HP akan meminta izin **lokasi** dan **kamera** — izinkan keduanya.

Ini adalah pendekatan PWA: satu basis kode untuk web dan "aplikasi" di HP, tanpa proses build
native atau publikasi ke app store. Jika ke depannya perusahaan butuh aplikasi native murni
(APK terpisah / listing di Play Store), API ini sudah bisa langsung dipakai sebagai backend
untuk proyek React Native / Flutter — endpoint-endpoint di bawah tinggal dipanggil dari sana.

## Ringkasan API (base path `/api`)
| Method | Endpoint | Keterangan |
|---|---|---|
| POST | `/auth/register` | Daftar (pertama = admin) |
| POST | `/auth/login` | Login, dapat JWT |
| GET  | `/auth/me` | Profil saya |
| GET/PUT | `/settings/office` | Lokasi & radius kantor (PUT khusus admin) |
| POST | `/attendance/clock` | Absen masuk/pulang (multipart: `type`, `lat`, `lng`, `photo`) |
| GET  | `/attendance/today` | Absensi saya hari ini |
| GET  | `/attendance/me` | Riwayat absensi saya |
| GET  | `/attendance/all` | Semua absensi (admin) |
| POST | `/leave` | Ajukan cuti/izin |
| GET  | `/leave/me` / `/leave/all` | Riwayat cuti saya / semua (admin) |
| PATCH| `/leave/:id` | Setujui/tolak cuti (admin) |
| POST | `/timesheet` | Catat aktivitas harian |
| GET  | `/timesheet/me` / `/timesheet/all` | Riwayat timesheet |
| GET  | `/reports/me` / `/reports/all` | Rekap bulanan |
| GET  | `/reports/export?scope=me\|all&month=YYYY-MM` | Ekspor CSV |

Semua endpoint (kecuali register/login) butuh header `Authorization: Bearer <token>`.

## Keamanan sebelum dipakai produksi
- Ganti `JWT_SECRET` di `.env` dengan string acak panjang, jangan pakai contoh bawaan
- Aktifkan HTTPS (lihat langkah Nginx + Certbot di atas)
- Cadangkan (backup) folder `data/` (database) dan `uploads/` (foto selfie) secara berkala
- Foto selfie di sini adalah **bukti kehadiran**, bukan pencocokan wajah biometrik otomatis —
  untuk pencocokan wajah otomatis (face matching), perlu penambahan model ML terpisah.

## Menjalankan secara lokal untuk uji coba
```bash
npm install
cp .env.example .env
npm run dev
# buka http://localhost:3000
```
