import { put, list } from '@vercel/blob'

// ─── football-data.org (primary + scorer enrichment) ────────────────────────
// NOTE (2026-07): Scorer enrichment used to go through TheSportsDB, but that
// provider does not return strHomeGoalDetails/strAwayGoalDetails for FIFA
// World Cup 2026 events on the free tier key (verified manually — events
// match correctly by team+score, but the goal-detail fields are simply
// absent). football-data.org's own /v4/matches/{id} endpoint already
// returns a fully populated goals[] array, so scorer enrichment is now
// handled entirely in app/api/enrich/route.ts using that same endpoint.
// See app/api/enrich/route.ts for the enrichment implementation.
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
    team: ((g.team as Record<string, unknown>)?.shortName as string) ?? ((g.team as Record<string, unknown>)?.name as string) ?? '',
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
// NOTE: these no longer attempt scorer enrichment inline. The match-list
// endpoint (/competitions/{code}/matches) does not reliably include goals[]
// for every match, so enrichment is handled incrementally and separately by
// /api/enrich (which calls /matches/{id} per-match, rate-limit aware).
export async function fullRefresh(): Promise<CachePayload> {
  const [comp, matchesData] = await Promise.all([
    apiFetch(`/competitions/${COMP}`),
    apiFetch(`/competitions/${COMP}/matches`),
  ])

  const rawMatches: MatchData[] = (matchesData.matches ?? []).map(
    (m: Record<string, unknown>) => normalizeMatch(m)
  )

  const payload: CachePayload = {
    updatedAt: new Date().toISOString(),
    competition: (comp.name as string) ?? 'FIFA World Cup 2026',
    season: String(
      ((comp.currentSeason as Record<string, unknown>)?.startDate as string)?.slice(0, 4) ?? '2026'
    ),
    matches: rawMatches,
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

  // Preserve already-enriched goals from cache; /api/enrich will pick up
  // any match that still has an empty goals[] on its next scheduled run.
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

  const payload: CachePayload = {
    updatedAt: new Date().toISOString(),
    competition: cached?.competition ?? 'FIFA World Cup 2026',
    season: cached?.season ?? '2026',
    matches: fresh,
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