# Vercel World Cup 2026 Dashboard

Dashboard Next.js siap deploy ke Vercel dengan Vercel Blob sebagai penyimpanan cache snapshot data pertandingan.

## Fitur
- Tournament progress dari fase group sampai final.
- Current tournament status.
- Past results urut tanggal ascending.
- Upcoming matches 3 hari ke depan dalam GMT+7.
- Auto refresh tiap 5 menit via Vercel Cron.
- Manual refresh via button.
- Cache data ke Vercel Blob agar halaman tidak selalu hit API utama.

## Environment Variables
- `FOOTBALL_DATA_API_TOKEN=628b1f83e4654473af685ab32900d01b`
- `FOOTBALL_DATA_COMPETITION_CODE=WC`
- `CRON_SECRET=isi-random-secret-anda`
- `BLOB_READ_WRITE_TOKEN=` token dari Vercel Blob store (otomatis saat connect store ke project)

## Endpoint
- `/api/bootstrap` untuk isi cache awal
- `/api/data` untuk baca cache terbaru
- `/api/refresh` untuk refresh manual atau via cron

## Deploy
1. Import repo ini ke Vercel.
2. Buat Blob store di Vercel Storage, lalu connect ke project.
3. Tambahkan environment variables di Vercel Project Settings.
4. Deploy ke production.
5. Buka `https://your-project.vercel.app/api/bootstrap` sekali untuk isi cache awal.
6. Buka homepage dashboard.
