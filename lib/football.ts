import { put, list } from '@vercel/blob'

const API_BASE = 'https://api.football-data.org/v4'
const TOKEN = process.env.FOOTBALL_DATA_API_TOKEN ?? ''
const COMP = process.env.FOOTBALL_DATA_COMPETITION_CODE ?? 'WC'
const BLOB_KEY = 'wc2026-dashboard-cache.json'

async function apiFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Auth-Token': TOKEN },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`football-data ${path} → ${res.status} ${await res.text().then(t => t.slice(0,200))}`)
  return res.json()
}

export interface MatchData {
  id: number; utcDate: string; status: string; stage: string; group: string | null
  homeTeam: { name: string; shortName: string; tla: string; crest: string }
  awayTeam: { name: string; shortName: string; tla: string; crest: string }
  score: { fullTime: { home: number | null; away: number | null }; halfTime: { home: number | null; away: number | null } }
  venue: string
}

export interface CachePayload {
  updatedAt: string; competition: string; season: string
  matches: MatchData[]
}

const STAGE_MAP: Record<string, string> = {
  GROUP_STAGE: 'Group Stage',
  ROUND_OF_36: 'Round of 36',
  LAST_36: 'Round of 36',
  ROUND_OF_16: 'Round of 16',
  LAST_16: 'Round of 16',
  QUARTER_FINALS: 'Quarter Finals',
  SEMI_FINALS: 'Semi Finals',
  THIRD_PLACE: '3rd Place',
  THIRD_PLACE_MATCH: '3rd Place',
  FINAL: 'Final',
}

const STAGE_ORDER = ['GROUP_STAGE','ROUND_OF_36','LAST_36','ROUND_OF_16','LAST_16','QUARTER_FINALS','SEMI_FINALS','THIRD_PLACE','THIRD_PLACE_MATCH','FINAL']
const STAGE_TOTAL: Record<string, number> = {
  GROUP_STAGE: 72, ROUND_OF_36: 36, LAST_36: 36, ROUND_OF_16: 16, LAST_16: 16,
  QUARTER_FINALS: 8, SEMI_FINALS: 4, THIRD_PLACE: 1, THIRD_PLACE_MATCH: 1, FINAL: 1,
}

function normalizeMatch(m: Record<string, unknown>): MatchData {
  const homeTeam = m.homeTeam as Record<string, unknown>
  const awayTeam = m.awayTeam as Record<string, unknown>
  const score = m.score as Record<string, unknown>
  const fullTime = score?.fullTime as Record<string, unknown> ?? {}
  const halfTime = score?.halfTime as Record<string, unknown> ?? {}
  return {
    id: m.id as number,
    utcDate: m.utcDate as string,
    status: m.status as string,
    stage: m.stage as string,
    group: (m.group as string | null) ?? null,
    homeTeam: {
      name: (homeTeam?.name as string) ?? '',
      shortName: (homeTeam?.shortName as string) ?? '',
      tla: (homeTeam?.tla as string) ?? '',
      crest: (homeTeam?.crest as string) ?? '',
    },
    awayTeam: {
      name: (awayTeam?.name as string) ?? '',
      shortName: (awayTeam?.shortName as string) ?? '',
      tla: (awayTeam?.tla as string) ?? '',
      crest: (awayTeam?.crest as string) ?? '',
    },
    score: {
      fullTime: { home: fullTime?.home as number | null ?? null, away: fullTime?.away as number | null ?? null },
      halfTime: { home: halfTime?.home as number | null ?? null, away: halfTime?.away as number | null ?? null },
    },
    venue: (m.venue as string) ?? '',
  }
}

export async function fullRefresh(): Promise<CachePayload> {
  const [comp, matchesData] = await Promise.all([
    apiFetch(`/competitions/${COMP}`),
    apiFetch(`/competitions/${COMP}/matches`),
  ])

  const rawMatches: MatchData[] = (matchesData.matches ?? []).map((m: Record<string, unknown>) => normalizeMatch(m))

  const payload: CachePayload = {
    updatedAt: new Date().toISOString(),
    competition: (comp.name as string) ?? 'FIFA World Cup 2026',
    season: String((comp.currentSeason as Record<string,unknown>)?.startDate?.toString().slice(0, 4) ?? '2026'),
    matches: rawMatches,
  }
  await saveToBlob(payload)
  return payload
}

export async function lightRefresh(): Promise<CachePayload> {
  const matchesData = await apiFetch(`/competitions/${COMP}/matches`)
  const fresh: MatchData[] = (matchesData.matches ?? []).map((m: Record<string, unknown>) => normalizeMatch(m))

  const cached = await loadFromBlob()
  const payload: CachePayload = {
    updatedAt: new Date().toISOString(),
    competition: cached?.competition ?? 'FIFA World Cup 2026',
    season: cached?.season ?? '2026',
    matches: fresh,
  }
  await saveToBlob(payload)
  return payload
}

export function buildDashboard(payload: CachePayload) {
  const now = new Date()
  const plus3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)

  const finished = payload.matches
    .filter(m => m.status === 'FINISHED')
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())

  const upcoming = payload.matches
    .filter(m => ['SCHEDULED','TIMED'].includes(m.status) && new Date(m.utcDate) >= now && new Date(m.utcDate) <= plus3)
    .sort((a, b) => new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime())

  const liveCount = payload.matches.filter(m => ['IN_PLAY','PAUSED'].includes(m.status)).length

  const stagesInData = [...new Set(payload.matches.map(m => m.stage))]
  const orderedStages = STAGE_ORDER.filter(s => stagesInData.includes(s))
  if (orderedStages.length === 0) orderedStages.push(...stagesInData)

  const seenLabels = new Set<string>()
  const stages = orderedStages
    .map(id => {
      const label = STAGE_MAP[id] ?? id.replace(/_/g, ' ')
      if (seenLabels.has(label)) return null
      seenLabels.add(label)
      const stageMatches = payload.matches.filter(m => m.stage === id)
      const completed = stageMatches.filter(m => m.status === 'FINISHED').length
      const total = STAGE_TOTAL[id] ?? stageMatches.length
      const hasActive = stageMatches.some(m => ['IN_PLAY','PAUSED','SCHEDULED','TIMED'].includes(m.status))
      const allDone = stageMatches.length > 0 && stageMatches.every(m => m.status === 'FINISHED')
      const active = hasActive && !allDone
      return { id, label, total, completed, active }
    })
    .filter(Boolean)

  return {
    updatedAt: payload.updatedAt,
    competition: payload.competition,
    season: payload.season,
    stages,
    finished,
    upcoming,
    liveCount,
    totalMatches: payload.matches.length,
  }
}

export async function saveToBlob(payload: CachePayload): Promise<void> {
  await put(BLOB_KEY, JSON.stringify(payload), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  })
}

export async function loadFromBlob(): Promise<CachePayload | null> {
  try {
    // Use list() to find the blob by pathname instead of head() which requires full URL
    const { blobs } = await list({ prefix: BLOB_KEY })
    const blob = blobs.find(b => b.pathname === BLOB_KEY)
    if (!blob) return null
    const res = await fetch(blob.url, { cache: 'no-store' })
    if (!res.ok) return null
    return await res.json() as CachePayload
  } catch {
    return null
  }
}
