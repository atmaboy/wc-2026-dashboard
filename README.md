# FIFA World Cup 2026 – Live Dashboard

> Next.js 14 · Vercel Blob · GitHub Actions Cron

## Architecture

```
Browser
  Auto-poll /api/data every 5 min  →  reads Vercel Blob (fast)
  Manual Refresh button            →  POST /api/refresh (~2s)

GitHub Actions (free tier)
  refresh.yml      → every 5 min → POST /api/refresh  (scores)
  full-refresh.yml → every hour  → GET  /api/cron     (scores+goals)

Vercel Cron (1x/day fallback)
  vercel.json      → 01:00 WIB   → GET  /api/cron
```

## Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/bootstrap` | GET | First-time full refresh (run once after deploy) |
| `/api/data` | GET | Read blob cache → return JSON to browser |
| `/api/refresh` | POST | Light refresh: scores only (~2s, Hobby safe) |
| `/api/cron` | GET | Full refresh: scores + goals (via GitHub Actions) |

## Deploy to Vercel

### Step 1: Import to Vercel
1. Go to https://vercel.com → New Project → Import `atmaboy/wc-2026-dashboard`
2. Framework: **Next.js** (auto-detected)

### Step 2: Create Vercel Blob Store
1. Vercel project → **Storage** tab → **Create Blob Store**
2. Name: `wc2026-cache` → **Connect to project**
3. `BLOB_READ_WRITE_TOKEN` auto-added to env vars

### Step 3: Add Environment Variables
Vercel project → **Settings → Environment Variables**:

| Key | Value |
|-----|-------|
| `FOOTBALL_DATA_API_TOKEN` | `628b1f83e4654473af685ab32900d01b` |
| `FOOTBALL_DATA_COMPETITION_CODE` | `WC` |
| `CRON_SECRET` | your random string |

### Step 4: Deploy
Click **Deploy**. Wait for build.

### Step 5: Bootstrap (ONE TIME)
Visit: `https://your-project.vercel.app/api/bootstrap`

### Step 6: GitHub Actions Secrets
Repo → **Settings → Secrets → Actions**:

| Secret | Value |
|--------|-------|
| `VERCEL_APP_URL` | `https://your-project.vercel.app` |
| `CRON_SECRET` | same as Vercel env var |

### Step 7: Enable GitHub Actions
Repo → **Actions** tab → enable workflows ✅

## Local Development

```bash
npm install
cp .env.example .env.local
# Fill in .env.local with your tokens
npm run dev
# http://localhost:3000
# Bootstrap: http://localhost:3000/api/bootstrap
```
