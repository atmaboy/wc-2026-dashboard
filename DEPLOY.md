# Deploy Notes

Last deploy: 2026-07-02

## Cron Schedule
- **`0 23 * * *`** = setiap hari jam **06:00 WIB** (23:00 UTC)
- Compatible dengan Vercel Hobby plan (max 1x per day)

## Endpoints
- `GET /api/bootstrap` — isi cache awal setelah deploy pertama
- `GET /api/data` — baca cache dari Vercel Blob
- `GET /api/refresh` — manual refresh (public, no auth)
- `GET /api/cron` — auto refresh harian (protected via CRON_SECRET)
