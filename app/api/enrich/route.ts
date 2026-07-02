/**
 * /api/enrich — scorer enrichment via openfootball/worldcup.json.
 *
 * HISTORY (2026-07) — three prior providers were tried and ruled out,
 * each verified with real requests before moving on:
 *
 * 1. TheSportsDB (free key "3"): event found correctly (team+score match)
 *    but strHomeGoalDetails/strAwayGoalDetails come back absent for
 *    World Cup 2026 events on that key.
 * 2. football-data.org /v4/matches/{id}: match found correctly, but
 *    goals[] comes back as an empty array — player-level data (goals,
 *    lineups, bookings) is gated behind paid tiers, confirmed by their
 *    own docs and third-party pricing comparisons.
 * 3. API-Football (api-sports.io): season=2026 outright rejected on the
 *    free plan ("Free plans do not have access to this season, try from
 *    2022 to 2024").
 *
 * Landed on openfootball/worldcup.json — a public-domain, no-API-key
 * dataset generated from a manually-maintained source file. Verified via
 * direct fetch that it has full scorer data (name + minute, with penalty/
 * owngoal flags) for matches played so far in the 2026 tournament,
 * including matches that all three prior providers failed to enrich.
 * https://github.com/openfootball/worldcup.json
 *
 * Trade-off (accepted deliberately): the maintainer updates the source
 * text roughly once a day, not live. That's fine for this endpoint's
 * purpose (backfilling the "Past Results" section) — it is not used for
 * live/in-play data, which the dashboard already gets from
 * football-data.org via /api/refresh.
 *
 * No API key, no rate limit (static file served from GitHub raw). The
 * whole backlog is processed in a single request to this endpoint.
 *
 *   GET /api/enrich
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadFromBlob, saveToBlob, CachePayload, MatchData } from '@/lib/football'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const SOURCE_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json'

type OfGoal = { name: string; minute: string; penalty?: boolean; owngoal?: boolean }
type OfMatch = {
  date: string
  team1: string
  team2: string
  score?: { ft?: [number, number]; ht?: [number, number]; et?: [number, number]; p?: [number, number] }
  goals1?: OfGoal[]
  goals2?: OfGoal[]
}
type OfPayload = { name: string; matches: OfMatch[] }

function normName(raw: string): string {
  const ALIASES: Record<string, string> = {
    unitedstates: 'usa', unitedstatesofamerica: 'usa', usmnt: 'usa',
    korearepublic: 'southkorea', republicofkorea: 'southkorea', southkorea: 'southkorea',
    iriran: 'iran', islamicrepublicofiran: 'iran',
    czechrepublic: 'czechia', czechia: 'czechia',
    northmacedonia: 'macedonia',
    ivorycoast: 'cotedivoire', coteivoire: 'cotedivoire', cotedivoire: 'cotedivoire',
    drcongo: 'congodr', congodr: 'congodr', democraticrepublicofcongo: 'congodr', congo: 'congodr',
    capeverde: 'capeverde', cabo: 'capeverde', caboverde: 'capeverde',
    trinidadandtobago: 'trinidadtobago',
    bosniaherzegovina: 'bosnia', bosniaandherzegovina: 'bosnia',
    curacao: 'curacao', // strip diacritic below handles ç already
    turkiye: 'turkey',
  }
  // Normalize accented characters (Curaçao, Côte d'Ivoire, etc.) before
  // stripping non-alphanumerics, so diacritics don't just vanish into
  // mismatched keys.
  const deaccented = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
  const key = deaccented.toLowerCase().replace(/[^a-z0-9]/g, '')
  return ALIASES[key] ?? key
}

function parseMinute(raw: string): number {
  // "45+5" → 45, "90+12" → 90, "67" → 67
  const base = raw.split('+')[0]
  const n = parseInt(base, 10)
  return Number.isFinite(n) ? n : 0
}

/**
 * openfootball records own goals under the BENEFITING team's goals list
 * (standard football convention), with the scoring player's own name.
 * So goals1 own-goals still count toward team1's score and should be
 * labeled with team1's label — no swap needed, just pass through.
 */
function mapOfGoals(
  goals: OfGoal[] | undefined,
  teamLabel: string
): MatchData['goals'] {
  if (!Array.isArray(goals)) return []
  return goals.map((g) => ({
    minute: parseMinute(g.minute),
    team: teamLabel,
    scorer: g.name,
    type: g.owngoal ? 'OWN_GOAL' : g.penalty ? 'PENALTY' : 'REGULAR',
  }))
}

/**
 * Match by team names first, using date only as a tie-breaker.
 *
 * Why not match on date directly: openfootball records "date" as the
 * LOCAL kickoff date (alongside a "time" like "20:00 UTC-6"), while our
 * MatchData.utcDate is true UTC. For evening kickoffs in negative UTC
 * offsets (most US matches), the UTC date is one day ahead of the local
 * date openfootball stores — e.g. a 20:00 UTC-6 kickoff on the 11th is
 * 02:00 UTC on the 12th. Comparing UTC dates directly caused ~36/82
 * matches to silently fail to match despite the source having the data.
 *
 * Two teams essentially never play each other twice within a couple of
 * days in this tournament structure, so team-name matching alone is
 * reliable; date is used only to disambiguate the rare case of multiple
 * candidates (e.g. same team appearing in unrelated rows).
 */
function findOfMatch(match: MatchData, ofMatches: OfMatch[]): OfMatch | null {
  const homeNorm = normName(match.homeTeam.name)
  const awayNorm = normName(match.awayTeam.name)

  const candidates = ofMatches.filter(
    (of) => normName(of.team1) === homeNorm && normName(of.team2) === awayNorm
  )

  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  // Multiple candidates (rare) — narrow by nearest date (±1 day of UTC date,
  // since local date can be one day off from UTC date in either direction).
  const matchDate = new Date(match.utcDate.slice(0, 10))
  let best: OfMatch | null = null
  let bestDiff = Infinity
  for (const c of candidates) {
    const cDate = new Date(c.date)
    const diff = Math.abs(cDate.getTime() - matchDate.getTime())
    if (diff < bestDiff) {
      bestDiff = diff
      best = c
    }
  }
  return best
}

export async function GET(_req: NextRequest) {
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

  let source: OfPayload
  try {
    const res = await fetch(SOURCE_URL, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    source = await res.json()
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `Failed to fetch openfootball source: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    )
  }

  const ofMatches = source.matches ?? []
  const details: { id: number; result: string }[] = []
  let enriched = 0

  for (const match of needsEnrich) {
    const ofMatch = findOfMatch(match, ofMatches)
    if (!ofMatch) {
      details.push({ id: match.id, result: 'no_source_match_found' })
      continue
    }

    const homeLabel = match.homeTeam.shortName || match.homeTeam.tla || match.homeTeam.name
    const awayLabel = match.awayTeam.shortName || match.awayTeam.tla || match.awayTeam.name

    const goals = [
      ...mapOfGoals(ofMatch.goals1, homeLabel),
      ...mapOfGoals(ofMatch.goals2, awayLabel),
    ].sort((a, b) => a.minute - b.minute)

    const idx = cached.matches.findIndex((m) => m.id === match.id)
    if (goals.length > 0 && idx !== -1) {
      cached.matches[idx].goals = goals
      enriched++
      details.push({ id: match.id, result: `enriched_${goals.length}_goals` })
    } else if (idx !== -1) {
      // Match found in source but genuinely 0-0 or source hasn't logged
      // scorer detail yet (e.g. very recent match, maintainer hasn't
      // updated). Leave empty so it's retried on the next cron run.
      details.push({ id: match.id, result: 'source_has_no_goals_yet' })
    }
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