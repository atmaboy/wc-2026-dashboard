# FIFA World Cup 2026 – Live Dashboard

> Next.js 14 · Vercel Blob · GitHub Actions Cron · Hybrid Data Sources

Real-time tournament dashboard for FIFA World Cup 2026. Match data (fixtures, scores, standings, competition structure) comes from **football-data.org**. Scorer and goal timeline details for finished matches are enriched from **TheSportsDB** free tier — no trial, no credit card required.

---

## Data Architecture

### Hybrid Data Sources

| Source | Data | Tier |
|--------|------|------|
| [football-data.org](https://www.football-data.org) | Competition structure, standings, fixtures, match status, live scores | Free (10 req/min) |
| [TheSportsDB](https://www.thesportsdb.com) | Scorer names, goal minutes, goal type (regular/penalty/own goal) for `FINISHED` matches | Free (API key `3`) |

### How Enrichment Works

1. `football-data.org` provides all match data but **scorer details are often empty** on the free tier.
2. After each refresh, any `FINISHED` match with an empty `goals[]` array is looked up on TheSportsDB by date + team name + final score.
3. Scorer data is parsed from TheSportsDB's `strHomeGoalDetails` / `strAwayGoalDetails` fields and merged back into the Blob cache.
4. Once a match is enriched it is **preserved in cache** — TheSportsDB is never called again for that match.

### Request Flow

```
Browser
  Auto-poll /api/data every 5 min  →  reads Vercel Blob (fast, no external API)
  Manual Refresh button            →  POST /api/refresh  (light refresh)

GitHub Actions (primary cron — no Vercel Pro needed)
  refresh.yml      every  5 min  →  POST /api/refresh     (scores + status)
  enrich.yml       every 15 min  →  GET  /api/enrich ×N   (scorer enrichment loop)
  full-refresh.yml every  1 hour →  GET  /api/cron         (full reload)
                                    → GET /api/enrich ×N   (then enrich remaining)

Vercel Cron (daily fallback)
  vercel.json      01:00 WIB     →  GET  /api/cron
```

---

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/bootstrap` | GET | public | **Run once after deploy.** Full data load + scorer enrichment. |
| `/api/data` | GET | public | Read Blob cache → return JSON to browser. No external API call. |
| `/api/refresh` | POST / GET | `CRON_SECRET` | Light refresh: fetches latest scores from football-data.org, preserves cached scorer data, enriches any remaining empty goals. |
| `/api/cron` | GET | `CRON_SECRET` | Full refresh: re-fetches all match data from football-data.org. Called hourly by GitHub Actions. |
| `/api/enrich` | GET | public | **Incremental scorer enrichment.** Processes one batch of unscored `FINISHED` matches per call. Call repeatedly until `done: true`. |

### `/api/enrich` query params

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `page` | `0` | — | Always pass `0` — endpoint auto-advances through unenriched matches |
| `size` | `8` | `20` | Matches to enrich per call |

**Example loop (curl):**
```bash
# Repeat until you see "done":true
curl "https://your-app.vercel.app/api/enrich?page=0&size=8"
# {"ok":true,"enriched":5,"remaining":64,"done":false}
curl "https://your-app.vercel.app/api/enrich?page=0&size=8"
# {"ok":true,"enriched":0,"remaining":0,"done":true}
```

---

## Deploy to Vercel

### Step 1: Import to Vercel
1. Go to [vercel.com](https://vercel.com) → **New Project** → Import `atmaboy/wc-2026-dashboard`
2. Framework: **Next.js** (auto-detected)

### Step 2: Create Vercel Blob Store
1. Vercel project → **Storage** tab → **Create Blob Store**
2. Name: `wc2026-cache` → **Connect to project**
3. `BLOB_READ_WRITE_TOKEN` is auto-added to env vars

### Step 3: Add Environment Variables
Vercel project → **Settings → Environment Variables**:

| Key | Value | Notes |
|-----|-------|-------|
| `FOOTBALL_DATA_API_TOKEN` | `your-token` | From [football-data.org](https://www.football-data.org/client/register) |
| `FOOTBALL_DATA_COMPETITION_CODE` | `WC` | |
| `CRON_SECRET` | random string | Protects `/api/refresh` and `/api/cron` |
| `THESPORTSDB_API_KEY` | `3` | Free tier key. Upgrade at [thesportsdb.com](https://www.thesportsdb.com/api.php) for higher limits |

### Step 4: Deploy
Click **Deploy**. Wait for build to complete.

### Step 5: Bootstrap (ONE TIME)
Visit in browser:
```
https://your-project.vercel.app/api/bootstrap
```
This loads all match data **and** runs the full scorer enrichment loop. May take 60–90 seconds.

If bootstrap times out (Vercel Hobby 60s limit), run enrichment separately:
```bash
# Repeat until done:true
curl "https://your-project.vercel.app/api/enrich?page=0&size=8"
```

### Step 6: GitHub Actions Secrets
Repo → **Settings → Secrets and variables → Actions**:

| Secret | Value |
|--------|-------|
| `VERCEL_APP_URL` | `https://your-project.vercel.app` |
| `CRON_SECRET` | Same value as Vercel env var |

### Step 7: Enable GitHub Actions
Repo → **Actions** tab → enable workflows ✅

Three workflows will activate:
- `refresh.yml` — every 5 minutes (scores & status)
- `enrich.yml` — every 15 minutes (scorer details)
- `full-refresh.yml` — every hour (full reload + enrich)

---

## Local Development

```bash
npm install
cp .env.example .env.local
# Fill in .env.local
npm run dev
```

Then open:
- Dashboard: http://localhost:3000
- Bootstrap: http://localhost:3000/api/bootstrap
- Enrich: http://localhost:3000/api/enrich?page=0&size=8

### `.env.local` example
```env
FOOTBALL_DATA_API_TOKEN=your_token_here
FOOTBALL_DATA_COMPETITION_CODE=WC
CRON_SECRET=any_random_string
THESPORTSDB_API_KEY=3
BLOB_READ_WRITE_TOKEN=your_vercel_blob_token
```

---

## Troubleshooting

**Scorer names not showing in Past Results**
- Check that `enrich.yml` workflow has run at least once (Actions tab → Scorer Enrichment)
- Manually trigger `enrich.yml` via **workflow_dispatch** and watch the logs
- Or call `/api/enrich?page=0&size=8` from your browser until `done:true`

**`/api/refresh` returns 401**
- `CRON_SECRET` in GitHub Secrets does not match Vercel env var

**`/api/bootstrap` or `/api/cron` times out**
- Expected on large match counts — use `/api/enrich` loop as described above
- Vercel Hobby plan: max 60s per function. `/api/cron` has `maxDuration = 300` (requires Pro) or falls back to 60s on Hobby

**TheSportsDB returns no data for a match**
- Free tier (key `3`) occasionally has missing events for recent matches
- Data usually appears within 24–48 hours after the match ends
- Set `THESPORTSDB_API_KEY` to a premium key to improve reliability
