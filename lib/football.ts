import { put, list } from '@vercel/blob'

// ─── football-data.org (primary) ────────────────────────────────────────────
const API_BASE = 'https://api.football-data.org/v4'
const TOKEN = process.env.FOOTBALL_DATA_API_TOKEN ?? ''
const COMP = process.env.FOOTBALL_DATA_COMPETITION_CODE ?? 'WC'
const BLOB_KEY = 'wc2026-dashboard-cache.json'

async function apiFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Auth-Token': TOKEN },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`football-data ${path} → ${res.status}`)
  return res.json()
}

// ─── TheSportsDB (scorer enrichment) ────────────────────────────────────────
// Free tier uses key "3". Set THESPORTSDB_API_KEY in env for premium key.
const TSD_KEY = process.env.THESPORTSDB_API_KEY ?? '3'
const TSD_BASE = `https://www.thesportsdb.com/api/v1/json/${TSD_KEY}`

async function tsdFetch(path: string) {
  const res = await fetch(`${TSD_BASE}/${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`thesportsdb ${path} → ${res.status}`)
  return res.json()
}

/**
 * Normalize a team name to a comparable lowercase alphanumeric string.
 * Also resolves common alias differences between providers.
 */
function normName(raw: string): string {
  const ALIASES: Record<string, string> = {
    'unitedstates': 'usa',
    'unitedstatesofamerica': 'usa',
    'korearepublic': 'southkorea',
    'republicofkorea': 'southkorea',
    'iriran': 'iran',
    'islamicrepublicofiran': 'iran',
    'czechrepublic': 'czechia',
    'northmacedonia': 'macedonia',
    'trinidadandtobago': 'trinidadtobago',
    'ivorycoast': 'cotedivoire',
    'coteivoire': 'cotedivoire',
  }
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  return ALIASES[key] ?? key
}

/**
 * Find the TheSportsDB event that corresponds to a given match.
 * Strategy: fetch all soccer events for the match day, then fuzzy-match
 * by normalized team names + final score.
 */
async function findTsdEvent(match: MatchData): Promise<Record<string, unknown> | null> {
  const date = match.utcDate.slice(0, 10) // YYYY-MM-DD
  const homeNorm = normName(match.homeTeam.name)
  const awayNorm = normName(match.awayTeam.name)

  let events: Record<string, unknown>[] = []

  try {
    // Primary: events by day filtered to Soccer
    const data = await tsdFetch(`eventsday.php?d=${date}&s=Soccer`)
    events = Array.isArray((data as any).events) ? (data as any).events : []
  } catch {
    return null
  }

  // Filter to World Cup events only (strLeague contains 'World Cup')
  const wcEvents = events.filter((e) =>
    String((e as any).strLeague ?? '').toLowerCase().includes('world cup')
  )

  const pool = wcEvents.length > 0 ? wcEvents : events

  for (const e of pool) {
    const eh = normName(String((e as any).strHomeTeam ?? ''))
    const ea = normName(String((e as any).strAwayTeam ?? ''))

    if (eh !== homeNorm || ea !== awayNorm) continue

    // Extra confidence: verify score matches if we already have it
    if (
      match.score.fullTime.home != null &&
      match.score.fullTime.away != null
    ) {
      const sh = String((e as any).intHomeScore ?? '')
      const sa = String((e as any).intAwayScore ?? '')
      if (
        sh !== String(match.score.fullTime.home) ||
        sa !== String(match.score.fullTime.away)
      ) {
        continue
      }
    }

    return e as Record<string, unknown>
  }

  return null
}

/**
 * Parse TheSportsDB strHomeGoalDetails / strAwayGoalDetails into our goals[].
 * Format from TSD: "PlayerName (minute); PlayerName2 (minute2)"
 * Penalty shootout entries like "(90)" without a name are skipped.
 */
function extractTsdGoals(event: Record<string, unknown>, match: MatchData): MatchData['goals'] {
  const goals: MatchData['goals'] = []

  const parseDetails = (details: string, teamLabel: string) => {
    if (!details || details.trim() === '') return
    details.split(';').forEach((chunk) => {
      const trimmed = chunk.trim()
      if (!trimmed) return

      // Match "PlayerName (minute)" or "PlayerName (minute pen)" or "PlayerName (minute OG)"
      const m = trimmed.match(/^(.+?)\s*\((\d+)(?:\+\d+)?\s*(pen|og|owngoal)?\s*\)$/i)
      if (!m) return

      const scorer = m[1].trim()
      if (!scorer) return // skip bare "(90)"

      const minute = parseInt(m[2], 10)
      const qualifier = (m[3] ?? '').toLowerCase()
      const type =
        qualifier === 'og' || qualifier === 'owngoal'
          ? 'OWN_GOAL'
          : qualifier === 'pen'
          ? 'PENALTY'
          : 'REGULAR'

      goals.push({ minute, team: teamLabel, scorer, type })
    })
  }

  parseDetails(
    String(event.strHomeGoalDetails ?? ''),
    match.homeTeam.shortName || match.homeTeam.tla || match.homeTeam.name
  )
  parseDetails(
    String(event.strAwayGoalDetails ?? ''),
    match.awayTeam.shortName || match.awayTeam.tla || match.awayTeam.name
  )

  return goals
}

/**
 * Enrich FINISHED matches that have no goals data by looking up
 * scorer details from TheSportsDB. Results are injected in-place.
 * Any individual failure is silently swallowed so the dashboard
 * always loads even if TheSportsDB is unavailable.
 */
async function enrichWithScorers(matches: MatchData[]): Promise<MatchData[]> {
  const needsEnrich = matches.filter(
    (m) => m.status === 'FINISHED' && (!Array.isArray(m.goals) || m.goals.length === 0)
  )

  // Process concurrently in small batches to avoid hammering the free API
  const BATCH = 5
  for (let i = 0; i < needsEnrich.length; i += BATCH) {
    const batch = needsEnrich.slice(i, i + BATCH)
    await Promise.all(
      batch.map(async (match) => {
        try {
          const event = await findTsdEvent(match)
          if (!event) return
          const goals = extractTsdGoals(event, match)
          if (goals.length > 0) {
            match.goals = goals
          }
        } catch {
          // silent fail — dashboard still works without scorer data
        }
      })
    )
  }

  return matches
}

// ─── Interfaces ──────────────────────────────────────────────────────────────
export interface MatchData {
  id: number
  utcDate: string
  status: string
  stage: string
  group: string | null
  homeTeam: { name: string; shortName: string; tla: string; crest: string }
  awayTeam: { name: string; shortName: string; tla: string; crest: string }
  score: { fullTime: { home: number | null; away: number | null }; halfTime: { home: number | null; away: number | null } }
  goals: { minute: number; team: string; scorer: string; type: string }[]
  venue: string
}

export interface CachePayload {
  updatedAt: string
  competition: string
  season: string
  matches: MatchData[]
}

// ─── Stage configuration ─────────────────────────────────────────────────────
const STAGE_MAP: Record<string, string> = {
  GROUP_STAGE:        'Group Stage',
  ROUND_OF_36:        'Round of 36',
  LAST_36:            'Round of 36',
  ROUND_OF_32:        'Round of 32',
  LAST_32:            'Round of 32',
  ROUND_OF_16:        'Round of 16',
  LAST_16:            'Round of 16',
  QUARTER_FINALS:     'Quarter Finals',
  SEMI_FINALS:        'Semi Finals',
  THIRD_PLACE:        '3rd Place',
  THIRD_PLACE_MATCH:  '3rd Place',
  FINAL:              'Final',
}

const STAGE_ORDER = [
  'GROUP_STAGE',
  'ROUND_OF_36', 'LAST_36',
  'ROUND_OF_32', 'LAST_32',
  'ROUND_OF_16', 'LAST_16',
  'QUARTER_FINALS',
  'SEMI_FINALS',
  'THIRD_PLACE', 'THIRD_PLACE_MATCH',
  'FINAL',
]

const STAGE_TOTAL: Record<string, number> = {
  GROUP_STAGE:       72,
  ROUND_OF_36:       36, LAST_36:           36,
  ROUND_OF_32:       32, LAST_32:           32,
  ROUND_OF_16:       16, LAST_16:           16,
  QUARTER_FINALS:     8,
  SEMI_FINALS:        4,
  THIRD_PLACE:        1, THIRD_PLACE_MATCH:  1,
  FINAL:              1,
}

// ─── Normalization helpers ────────────────────────────────────────────────────
function safeTeam(t: Record<string, unknown> | null | undefined) {
  return {
    name: (t?.name as string) ?? '',
    shortName: (t?.shortName as string) ?? '',
    tla: (t?.tla as string) ?? '',
    crest: (t?.crest as string) ?? '',
  }
}

function normalizeMatch(m: Record<string, unknown>): MatchData {
  const score = (m.score as Record<string, unknown>) ?? {}
  const fullTime = (score.fullTime as Record<string, unknown>) ?? {}
  const halfTime = (score.halfTime as Record<string, unknown>) ?? {}

  const rawGoals = Array.isArray(m.goals) ? m.goals : []
  const goals = rawGoals.map((g: Record<string, unknown>) => ({
    minute: (g.minute as number) ?? 0,
    team: ((g.team as Record<string, unknown>)?.shortName as string) ?? '',
    scorer: ((g.scorer as Record<string, unknown>)?.name as string) ?? 'Unknown',
    type: (g.type as string) ?? 'REGULAR',
  }))

  return {
    id: m.id as number,
    utcDate: (m.utcDate as string) ?? '',
    status: (m.status as string) ?? 'UNKNOWN',
    stage: (m.stage as string) ?? '',
    group: (m.group as string | null) ?? null,
    homeTeam: safeTeam(m.homeTeam as Record<string, unknown>),
    awayTeam: safeTeam(m.awayTeam as Record<string, unknown>),
    score: {
      fullTime: { home: (fullTime.home as number | null) ?? null, away: (fullTime.away as number | null) ?? null },
      halfTime: { home: (halfTime.home as number | null) ?? null, away: (halfTime.away as number | null) ?? null },
    },
    goals,
    venue: (m.venue as string) ?? '',
  }
}

// ─── Public refresh functions ─────────────────────────────────────────────────
export async function fullRefresh(): Promise<CachePayload> {
  const [comp, matchesData] = await Promise.all([
    apiFetch(`/competitions/${COMP}`),
    apiFetch(`/competitions/${COMP}/matches`),
  ])

  const rawMatches: MatchData[] = (matchesData.matches ?? []).map(
    (m: Record<string, unknown>) => normalizeMatch(m)
  )

  // Enrich FINISHED matches with scorer data from TheSportsDB
  const enrichedMatches = await enrichWithScorers(rawMatches)

  const payload: CachePayload = {
    updatedAt: new Date().toISOString(),
    competition: (comp.name as string) ?? 'FIFA World Cup 2026',
    season: String(
      ((comp.currentSeason as Record<string, unknown>)?.startDate as string)?.slice(0, 4) ?? '2026'
    ),
    matches: enrichedMatches,
  }
  await saveToBlob(payload)
  return payload
}

export async function lightRefresh(): Promise<CachePayload> {
  const [cached, matchesData] = await Promise.all([
    loadFromBlob(),
    apiFetch(`/competitions/${COMP}/matches`),
  ])

  const fresh: MatchData[] = (matchesData.matches ?? []).map(
    (m: Record<string, unknown>) => normalizeMatch(m)
  )

  // Preserve already-enriched goals from cache; only re-enrich if still empty
  const cachedGoals: Record<number, MatchData['goals']> = {}
  for (const cm of cached?.matches ?? []) {
    if (Array.isArray(cm.goals) && cm.goals.length > 0) {
      cachedGoals[cm.id] = cm.goals
    }
  }
  for (const m of fresh) {
    if (cachedGoals[m.id]) {
      m.goals = cachedGoals[m.id]
    }
  }

  // Enrich any remaining FINISHED matches that still have no goals
  const enrichedMatches = await enrichWithScorers(fresh)

  const payload: CachePayload = {
    updatedAt: new Date().toISOString(),
    competition: cached?.competition ?? 'FIFA World Cup 2026',
    season: cached?.season ?? '2026',
    matches: enrichedMatches,
  }
  await saveToBlob(payload)
  return payload
}

// ─── Dashboard builder ────────────────────────────────────────────────────────
export function buildDashboard(payload: CachePayload) {
  const now = new Date()
  const plus3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
  const matches = payload.matches ?? []

  const finished = matches
    .filter(m => m.status === 'FINISHED')
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())

  const upcoming = matches
    .filter(m =>
      ['SCHEDULED', 'TIMED'].includes(m.status) &&
      new Date(m.utcDate) >= now &&
      new Date(m.utcDate) <= plus3
    )
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())

  const liveCount = matches.filter(m => ['IN_PLAY', 'PAUSED'].includes(m.status)).length

  const stagesInData = new Set(matches.map(m => m.stage).filter(Boolean))
  const orderedKnown = STAGE_ORDER.filter(s => stagesInData.has(s))
  const unknownStages = [...stagesInData].filter(s => !STAGE_ORDER.includes(s))
  const orderedStages = [...orderedKnown, ...unknownStages]

  const seenLabels = new Set<string>()
  const stages = orderedStages
    .map(id => {
      const label = STAGE_MAP[id] ?? id.replace(/_/g, ' ')
      if (seenLabels.has(label)) return null
      seenLabels.add(label)

      const aliasKeys = Object.entries(STAGE_MAP)
        .filter(([, v]) => v === label)
        .map(([k]) => k)
      const stageMatches = matches.filter(m => aliasKeys.includes(m.stage))

      const completed = stageMatches.filter(m => m.status === 'FINISHED').length
      const total = STAGE_TOTAL[id] ?? stageMatches.length
      const hasActive = stageMatches.some(m => ['IN_PLAY', 'PAUSED', 'SCHEDULED', 'TIMED'].includes(m.status))
      const allDone = stageMatches.length > 0 && stageMatches.every(m => m.status === 'FINISHED')
      const active = hasActive && !allDone
      return { id, label, total, completed, active }
    })
    .filter(Boolean)

  return {
    updatedAt: payload.updatedAt,
    competition: payload.competition ?? 'FIFA World Cup 2026',
    season: payload.season ?? '2026',
    stages,
    finished,
    upcoming,
    liveCount,
    totalMatches: matches.length,
  }
}

// ─── Blob storage ─────────────────────────────────────────────────────────────
export async function saveToBlob(payload: CachePayload): Promise<void> {
  await put(BLOB_KEY, JSON.stringify(payload), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  })
}

export async function loadFromBlob(): Promise<CachePayload | null> {
  try {
    const { blobs } = await list({ prefix: BLOB_KEY })
    const blob = blobs.find(b => b.pathname === BLOB_KEY)
    if (!blob) return null
    const res = await fetch(blob.url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json() as CachePayload
    if (Array.isArray(data.matches)) {
      data.matches = data.matches.map(m => ({ ...m, goals: Array.isArray(m.goals) ? m.goals : [] }))
    }
    return data
  } catch {
    return null
  }
}
