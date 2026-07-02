/**
 * /api/enrich — incremental scorer enrichment via football-data.org.
 *
 * NOTE (2026-07): Previously this endpoint enriched scorer data from
 * TheSportsDB. That source turned out to not return strHomeGoalDetails /
 * strAwayGoalDetails for FIFA World Cup 2026 events on the free tier key,
 * even though the events themselves match up correctly by team + score.
 * Verified manually via curl against thesportsdb.com — event found,
 * goal-details fields simply absent from the response.
 *
 * football-data.org's own single-match endpoint (GET /v4/matches/{id})
 * DOES include a fully populated goals[] array (minute, type, team,
 * scorer, assist) — see https://docs.football-data.org/general/v4/match.html
 * So we now enrich using the SAME provider that already supplies the
 * rest of the match data, instead of cross-matching against a second API.
 *
 * football-data.org free tier is rate-limited to ~10 requests/minute.
 * This endpoint is called by a cron job every 15 minutes (see
 * .github/workflows/enrich.yml), so we keep each invocation to a small
 * batch (default 6, hard cap 8) to stay safely under that limit even
 * accounting for the other calls /api/refresh makes in the same window.
 *
 *   GET /api/enrich?page=0&size=6
 *
 * It reads the Blob cache, enriches the next `size` FINISHED matches
 * that still have empty goals[], writes back to Blob, and returns how
 * many remain. Repeat until remaining === 0.
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadFromBlob, saveToBlob, CachePayload, MatchData } from '@/lib/football'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const API_BASE = 'https://api.football-data.org/v4'
const TOKEN = process.env.FOOTBALL_DATA_API_TOKEN ?? ''

// Free tier: 10 req/min. Space calls out to stay well under that even
// if /api/refresh or another enrich run overlaps.
const REQUEST_DELAY_MS = 6500 // ~9 req/min ceiling for this loop alone

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type FdGoal = {
  minute: number | null
  injuryTime?: number | null
  type?: string | null
  team?: { id?: number; name?: string } | null
  scorer?: { id?: number; name?: string } | null
  assist?: { id?: number; name?: string } | null
}

async function fetchMatchDetail(matchId: number): Promise<{ goals: FdGoal[] } | null> {
  const res = await fetch(`${API_BASE}/matches/${matchId}`, {
    headers: { 'X-Auth-Token': TOKEN },
    cache: 'no-store',
  })

  if (res.status === 429) {
    console.warn(`[enrich] rate limited on match ${matchId} (429)`)
    return null
  }
  if (!res.ok) {
    console.warn(`[enrich] match ${matchId} → HTTP ${res.status}`)
    return null
  }

  const data = await res.json()
  const goals: FdGoal[] = Array.isArray(data.goals) ? data.goals : []
  return { goals }
}

/**
 * Convert football-data.org's goals[] shape into our MatchData['goals'] shape.
 * Team label resolution: prefer matching the goal's team.id against the
 * match's homeTeam/awayTeam id (most reliable), falling back to name
 * comparison if id is missing for some reason.
 */
function mapGoals(fdGoals: FdGoal[], match: MatchData): MatchData['goals'] {
  return fdGoals
    .filter((g) => g.scorer?.name)
    .map((g) => {
      const teamId = g.team?.id
      const teamName = g.team?.name ?? ''
      let label = teamName

      if (teamId != null) {
        // homeTeam/awayTeam on our MatchData don't carry the numeric id,
        // so fall back to name-based matching against the two known names.
        label = teamName
      }

      const homeLabel = match.homeTeam.shortName || match.homeTeam.tla || match.homeTeam.name
      const awayLabel = match.awayTeam.shortName || match.awayTeam.tla || match.awayTeam.name

      if (teamName === match.homeTeam.name) label = homeLabel
      else if (teamName === match.awayTeam.name) label = awayLabel

      const rawType = (g.type ?? '').toUpperCase()
      const type = rawType === 'PENALTY' || rawType === 'OWN_GOAL' || rawType === 'REGULAR'
        ? rawType
        : 'REGULAR'

      return {
        minute: g.minute ?? 0,
        team: label,
        scorer: g.scorer?.name ?? 'Unknown',
        type,
      }
    })
}

export async function GET(req: NextRequest) {
  if (!TOKEN) {
    return NextResponse.json(
      { ok: false, error: 'Missing FOOTBALL_DATA_API_TOKEN' },
      { status: 500 }
    )
  }

  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '0', 10)
  const size = Math.min(parseInt(req.nextUrl.searchParams.get('size') ?? '6', 10), 8)

  const cached = await loadFromBlob()
  if (!cached) {
    return NextResponse.json({ ok: false, error: 'No cache found. Run /api/bootstrap first.' }, { status: 404 })
  }

  const needsEnrich = cached.matches.filter(
    (m) => m.status === 'FINISHED' && (!Array.isArray(m.goals) || m.goals.length === 0)
  )

  const remaining = needsEnrich.length
  if (remaining === 0) {
    return NextResponse.json({ ok: true, enriched: 0, remaining: 0, done: true })
  }

  const batch = needsEnrich.slice(page * size, page * size + size)
  let enriched = 0
  let failed = 0
  const details: { id: number; result: string }[] = []

  // Sequential, not parallel — football-data.org free tier is 10 req/min,
  // so we must space requests out rather than fire them concurrently.
  for (const match of batch) {
    try {
      const detail = await fetchMatchDetail(match.id)
      if (!detail) {
        failed++
        details.push({ id: match.id, result: 'fetch_failed_or_rate_limited' })
        await sleep(REQUEST_DELAY_MS)
        continue
      }

      const goals = mapGoals(detail.goals, match)
      const idx = cached.matches.findIndex((m) => m.id === match.id)

      if (goals.length > 0 && idx !== -1) {
        cached.matches[idx].goals = goals
        enriched++
        details.push({ id: match.id, result: `enriched_${goals.length}_goals` })
      } else if (idx !== -1) {
        // Match confirmed finished with 0-0 or genuinely no goal events
        // recorded yet by the provider. Leave as empty array so it's
        // retried on the next enrich cycle rather than treated as done.
        details.push({ id: match.id, result: 'no_goals_in_response' })
      }
    } catch (err) {
      failed++
      details.push({ id: match.id, result: `error: ${err instanceof Error ? err.message : String(err)}` })
    }
    await sleep(REQUEST_DELAY_MS)
  }

  const updatedPayload: CachePayload = {
    ...cached,
    updatedAt: new Date().toISOString(),
  }
  await saveToBlob(updatedPayload)

  const remainingAfter = cached.matches.filter(
    (m) => m.status === 'FINISHED' && (!Array.isArray(m.goals) || m.goals.length === 0)
  ).length

  console.log(`[enrich] page=${page} size=${size} enriched=${enriched} failed=${failed} remaining=${remainingAfter}`)
  console.log('[enrich] details:', JSON.stringify(details))

  return NextResponse.json({
    ok: true,
    enriched,
    failed,
    remaining: remainingAfter,
    done: remainingAfter === 0,
    page,
    size,
    details,
  })
}