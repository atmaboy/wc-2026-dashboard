/**
 * /api/enrich — incremental scorer enrichment via API-Football (api-sports.io).
 *
 * HISTORY (2026-07):
 * 1. Originally enriched from TheSportsDB (free key "3"). Verified via curl
 *    that TheSportsDB finds the correct event (team + score match) but does
 *    NOT return strHomeGoalDetails/strAwayGoalDetails for World Cup 2026
 *    events on that key — the fields are simply absent.
 * 2. Switched to football-data.org's own /v4/matches/{id} endpoint. Verified
 *    via curl that the match is found correctly, but goals[] comes back as
 *    an empty array — player-level data (goals, lineups, bookings) is gated
 *    behind football-data.org's paid tiers, confirmed by their own docs and
 *    third-party comparisons.
 * 3. Now using API-Football (api-sports.io), whose free tier (100 req/day)
 *    DOES include full goal-event detail for World Cup 2026 — confirmed via
 *    their official World Cup 2026 integration guide (league=1, season=2026,
 *    coverage.fixtures.events=true). See:
 *    https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports
 *
 * Strategy (kept deliberately quota-light — 100 req/day free tier):
 *   1. Fetch the full World Cup 2026 fixture list ONCE per call
 *      (GET /fixtures?league=1&season=2026) — 1 request, gives us every
 *      fixture.id + date + team names so we can map our football-data.org
 *      match ids to API-Football fixture ids by date+team.
 *   2. Batch up to 20 fixture ids per call into GET /fixtures?ids=A-B-C...
 *      which returns embedded events (goals, cards, subs) with NO extra
 *      request needed. This is far cheaper than one request per match.
 *
 * With ~82 matches needing enrichment, this works out to roughly
 * 1 (fixture list) + ceil(82/20) = 6 requests total — comfortably within
 * the 100/day free quota, and fast enough to do in a single invocation
 * rather than trickling in over many cron cycles.
 *
 *   GET /api/enrich
 *
 * (page/size query params are accepted for backwards compatibility with
 * existing cron workflows but are no longer required — the whole backlog
 * is processed in one pass given the low request cost.)
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadFromBlob, saveToBlob, CachePayload, MatchData } from '@/lib/football'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const AF_BASE = 'https://v3.football.api-sports.io'
const AF_KEY = process.env.API_FOOTBALL_KEY ?? ''
const WC_LEAGUE_ID = 1
const WC_SEASON = 2026

async function afFetch(path: string) {
  const res = await fetch(`${AF_BASE}${path}`, {
    headers: { 'x-apisports-key': AF_KEY },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`api-football ${path} → HTTP ${res.status}`)
  const data = await res.json()
  if (Array.isArray(data.errors) && data.errors.length > 0) {
    throw new Error(`api-football ${path} → ${JSON.stringify(data.errors)}`)
  }
  if (data.errors && typeof data.errors === 'object' && Object.keys(data.errors).length > 0) {
    throw new Error(`api-football ${path} → ${JSON.stringify(data.errors)}`)
  }
  return data
}

type AfFixtureListItem = {
  fixture: { id: number; date: string }
  teams: { home: { name: string }; away: { name: string } }
}

type AfEvent = {
  time: { elapsed: number | null; extra: number | null }
  team: { name: string }
  player: { name: string | null }
  assist: { name: string | null }
  type: string // 'Goal' | 'Card' | 'subst' | 'Var'
  detail: string // 'Normal Goal' | 'Penalty' | 'Own Goal' | 'Missed Penalty' | ...
}

type AfFixtureDetail = {
  fixture: { id: number }
  events: AfEvent[]
}

function normName(raw: string): string {
  const ALIASES: Record<string, string> = {
    unitedstates: 'usa', unitedstatesofamerica: 'usa', usmnt: 'usa',
    korearepublic: 'southkorea', republicofkorea: 'southkorea', southkorea: 'southkorea',
    iriran: 'iran', islamicrepublicofiran: 'iran',
    czechrepublic: 'czechia', czechia: 'czechia',
    northmacedonia: 'macedonia',
    ivorycoast: 'cotedivoire', coteivoire: 'cotedivoire',
    drcongo: 'congodr', congodr: 'congodr', democraticrepublicofcongo: 'congodr', congo: 'congodr',
    capeverde: 'capeverde', cabo: 'capeverde', caboverde: 'capeverde',
    trinidadandtobago: 'trinidadtobago',
    unitedkingdom: 'england', // safety net, shouldn't occur for national teams
  }
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  return ALIASES[key] ?? key
}

/**
 * Build a lookup of our match.id → API-Football fixture.id by matching
 * on date (same UTC day) + normalized home/away team names.
 */
function mapMatchesToFixtures(
  matches: MatchData[],
  fixtures: AfFixtureListItem[]
): Map<number, number> {
  const result = new Map<number, number>()

  for (const match of matches) {
    const matchDate = match.utcDate.slice(0, 10)
    const homeNorm = normName(match.homeTeam.name)
    const awayNorm = normName(match.awayTeam.name)

    const found = fixtures.find((f) => {
      const fDate = f.fixture.date.slice(0, 10)
      if (fDate !== matchDate) return false
      const fHome = normName(f.teams.home.name)
      const fAway = normName(f.teams.away.name)
      return fHome === homeNorm && fAway === awayNorm
    })

    if (found) {
      result.set(match.id, found.fixture.id)
    }
  }

  return result
}

function mapAfGoals(events: AfEvent[], match: MatchData): MatchData['goals'] {
  const homeLabel = match.homeTeam.shortName || match.homeTeam.tla || match.homeTeam.name
  const awayLabel = match.awayTeam.shortName || match.awayTeam.tla || match.awayTeam.name

  return events
    .filter((e) => e.type === 'Goal' && e.detail !== 'Missed Penalty' && e.player?.name)
    .map((e) => {
      const teamName = e.team?.name ?? ''
      let label = teamName
      if (normName(teamName) === normName(match.homeTeam.name)) label = homeLabel
      else if (normName(teamName) === normName(match.awayTeam.name)) label = awayLabel

      const detail = (e.detail ?? '').toLowerCase()
      const type = detail.includes('own goal') ? 'OWN_GOAL'
        : detail.includes('penalty') ? 'PENALTY'
        : 'REGULAR'

      return {
        minute: e.time?.elapsed ?? 0,
        team: label,
        scorer: e.player.name as string,
        type,
      }
    })
    .sort((a, b) => a.minute - b.minute)
}

export async function GET(_req: NextRequest) {
  if (!AF_KEY) {
    return NextResponse.json(
      { ok: false, error: 'Missing API_FOOTBALL_KEY' },
      { status: 500 }
    )
  }

  const cached = await loadFromBlob()
  if (!cached) {
    return NextResponse.json({ ok: false, error: 'No cache found. Run /api/bootstrap first.' }, { status: 404 })
  }

  const needsEnrich = cached.matches.filter(
    (m) => m.status === 'FINISHED' && (!Array.isArray(m.goals) || m.goals.length === 0)
  )

  if (needsEnrich.length === 0) {
    return NextResponse.json({ ok: true, enriched: 0, remaining: 0, done: true })
  }

  const details: { id: number; result: string }[] = []
  let enriched = 0

  try {
    // 1 request: full tournament fixture list, used only to map ids.
    const fixtureListData = await afFetch(`/fixtures?league=${WC_LEAGUE_ID}&season=${WC_SEASON}`)
    const fixtureList: AfFixtureListItem[] = fixtureListData.response ?? []

    const idMap = mapMatchesToFixtures(needsEnrich, fixtureList)
    const unmatched = needsEnrich.filter((m) => !idMap.has(m.id))
    unmatched.forEach((m) => details.push({ id: m.id, result: 'no_fixture_match_found' }))

    const fixtureIds = [...idMap.values()]

    // Batch up to 20 ids per call, per API-Football's documented limit.
    for (let i = 0; i < fixtureIds.length; i += 20) {
      const batchIds = fixtureIds.slice(i, i + 20)
      const batchData = await afFetch(`/fixtures?ids=${batchIds.join('-')}`)
      const batchFixtures: AfFixtureDetail[] = batchData.response ?? []

      for (const [matchId, fixtureId] of idMap.entries()) {
        if (!batchIds.includes(fixtureId)) continue
        const match = needsEnrich.find((m) => m.id === matchId)
        const fx = batchFixtures.find((f) => f.fixture.id === fixtureId)
        if (!match || !fx) {
          details.push({ id: matchId, result: 'fixture_detail_missing_in_batch' })
          continue
        }

        const goals = mapAfGoals(fx.events ?? [], match)
        const idx = cached.matches.findIndex((m) => m.id === matchId)
        if (goals.length > 0 && idx !== -1) {
          cached.matches[idx].goals = goals
          enriched++
          details.push({ id: matchId, result: `enriched_${goals.length}_goals` })
        } else {
          details.push({ id: matchId, result: 'no_goal_events_in_response' })
        }
      }
    }
  } catch (err) {
    console.error('[enrich] fatal error:', err)
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err), details },
      { status: 502 }
    )
  }

  const updatedPayload: CachePayload = {
    ...cached,
    updatedAt: new Date().toISOString(),
  }
  await saveToBlob(updatedPayload)

  const remainingAfter = cached.matches.filter(
    (m) => m.status === 'FINISHED' && (!Array.isArray(m.goals) || m.goals.length === 0)
  ).length

  console.log(`[enrich] enriched=${enriched} remaining=${remainingAfter}`)
  console.log('[enrich] details:', JSON.stringify(details))

  return NextResponse.json({
    ok: true,
    enriched,
    remaining: remainingAfter,
    done: remainingAfter === 0,
    details,
  })
}