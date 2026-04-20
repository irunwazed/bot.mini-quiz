# Playwright Testing Bot

CLI testing & automation tool berbasis Playwright dengan integrasi Claude AI. Mendukung otomatisasi browser Chrome dengan akun login yang sudah ada, scraping, menjawab quiz Quizizz otomatis, chat dengan Claude, dan konsumer CDC PostgreSQL.

## Fitur Utama

- Buka Chrome dengan profil asli (akun Gmail sudah login)
- Multi-profile: pilih antara beberapa akun Chrome
- Otomatisasi Quizizz (baca soal + jawab via Claude AI + highlight jawaban)
- Chat dengan Claude API
- CDC consumer untuk event Debezium PostgreSQL (insert/update/delete)
- Screenshot, scrape, click, type, fill, scroll, eval JavaScript

## Prasyarat

- Node.js 18 atau lebih baru
- Google Chrome terinstall di path default (macOS: `/Applications/Google Chrome.app`)
- API key Claude dari https://console.anthropic.com
- PostgreSQL (opsional — hanya untuk trigger `cdc`)

## Instalasi

1. Clone / masuk ke folder project:

   ```bash
   cd craw
   ```

2. Install dependensi:

   ```bash
   npm install
   ```

3. Buat file `.env` dari contoh:

   ```bash
   cp .env.example .env
   ```

4. Edit `.env` dan isi `ANTHROPIC_API_KEY` dengan API key Claude Anda:

   ```
   ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```

   > Jika tidak diisi, aplikasi akan meminta input saat pertama kali menggunakan fitur Claude dan bisa disimpan otomatis ke `.env`.

## Menjalankan

```bash
node index.js
```

Setelah jalan, akan muncul prompt:

```
> Trigger:
```

Ketik nama trigger (misalnya `profile`, `help`, dll) lalu tekan Enter.

## Daftar Trigger

### Browser

| Trigger     | Deskripsi                                             |
| ----------- | ----------------------------------------------------- |
| `open`      | Buka browser Chromium baru (tanpa akun login)         |
| `profile`   | Buka Chrome dengan profil yang sudah login Gmail      |
| `connect`   | Connect ke Chrome yang sudah jalan via CDP port 9222  |
| `close`     | Tutup browser                                         |
| `exit`      | Keluar dari aplikasi                                  |

### Navigasi

| Trigger    | Deskripsi                    |
| ---------- | ---------------------------- |
| `goto`     | Navigasi ke URL              |
| `reload`   | Reload halaman               |
| `back`     | Kembali ke halaman sebelum   |
| `forward`  | Maju ke halaman berikutnya   |

### Informasi & Tab

| Trigger   | Deskripsi                                |
| --------- | ---------------------------------------- |
| `tabs`    | Lihat semua tab & pilih tab aktif        |
| `title`   | Tampilkan judul & URL tab aktif          |
| `links`   | Daftar semua link di halaman             |
| `cookies` | Tampilkan cookies halaman                |

### Interaksi

| Trigger      | Deskripsi                                        |
| ------------ | ------------------------------------------------ |
| `screenshot` | Ambil screenshot full-page (disimpan di `screenshots/`) |
| `scrape`     | Scrape teks dari CSS selector                    |
| `click`      | Klik elemen berdasarkan selector                 |
| `type`       | Ketik teks ke input (per karakter)               |
| `fill`       | Isi input langsung                               |
| `scroll`     | Scroll ke `top`, `bottom`, atau jumlah pixel     |
| `wait`       | Tunggu N detik                                   |
| `eval`       | Jalankan JavaScript di halaman                   |

### Claude AI & Quiz

| Trigger        | Deskripsi                                                          |
| -------------- | ------------------------------------------------------------------ |
| `chat`         | Chat dengan Claude (riwayat disimpan selama sesi)                  |
| `readquiz`     | Baca soal & pilihan jawaban di Quizizz                             |
| `answerquiz`   | Baca soal → kirim ke Claude → tampilkan jawaban                    |
| `otomatisquiz` | Loop otomatis: deteksi soal baru → jawab otomatis + highlight box  |

### Database

| Trigger | Deskripsi                                                                   |
| ------- | --------------------------------------------------------------------------- |
| `cdc`   | Konsumsi event Debezium (paste JSON, tekan Enter 2x). Mendukung op `c/u/d`. |

## Alur Penggunaan (Contoh Quizizz)

1. Jalankan aplikasi: `node index.js`
2. Ketik `profile` → pilih profil Chrome yang login Gmail
3. Isi URL Quizizz saat diminta (atau kosongkan dan pakai `goto` setelahnya)
4. Setelah masuk soal, ketik `otomatisquiz`
5. Bot akan otomatis:
   - Baca soal + pilihan
   - Kirim ke Claude
   - Highlight box jawaban (hijau + glow), yang lain di-fade

## Struktur File

```
craw/
├── index.js            # Main CLI & semua trigger
├── package.json
├── .env                # API key (tidak di-commit)
├── .env.example        # Template env
├── screenshots/        # Hasil screenshot
└── README.md
```

## Troubleshooting

- **"Chrome sedang berjalan"** — tutup Chrome manual atau jawab `y` saat ditanya untuk auto-kill.
- **"DevTools remote debugging requires a non-default data directory"** — aplikasi sudah handle dengan copy sesi ke folder temp, tunggu sampai selesai.
- **Claude error "Could not resolve authentication method"** — isi `ANTHROPIC_API_KEY` di `.env`.
- **Timeout saat launch Chrome** — pastikan Chrome tidak sedang di-lock proses lain.
