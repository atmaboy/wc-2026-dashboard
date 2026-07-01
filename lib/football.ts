import { put, head } from '@vercel/blob'

const API_BASE = 'https://api.football-data.org/v4'
const TOKEN = process.env.FOOTBALL_DATA_API_TOKEN ?? ''
const COMP = process.env.FOOTBALL_DATA_COMPETITION_CODE ?? 'WC'
const BLOB_KEY = 'wc2026-dashboard-cache.json'

async function apiFetch(path: string) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Auth-Token': TOKEN },
    next: { revalidate: 0 },
  })
  if (!res.ok) throw new Error(`football-data ${path} → ${res.status}`)
  return res.json()
}

export interface MatchData {
  id: number; utcDate: string; status: string; stage: string; group: string | null
  homeTeam: { name: string; shortName: string; tla: string; crest: string }
  awayTeam: { name: string; shortName: string; tla: string; crest: string }
  score: { fullTime: { home: number | null; away: number | null }; halfTime: { home: number | null; away: number | null } }
  goals: { minute: number; team: string; scorer: string; type: string }[]
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

export async function fullRefresh(): Promise<CachePayload> {
  const comp = await apiFetch(`/competitions/${COMP}`)
  const matchesData = await apiFetch(`/competitions/${COMP}/matches`)
  const rawMatches: MatchData[] = []

  for (const m of matchesData.matches ?? []) {
    const goals: MatchData['goals'] = []
    if (m.status === 'FINISHED') {
      try {
        const detail = await apiFetch(`/matches/${m.id}`)
        for (const g of detail.match?.goals ?? []) {
          goals.push({
            minute: g.minute ?? 0,
            team: g.team?.shortName ?? g.team?.name ?? '',
            scorer: g.scorer?.name ?? 'Unknown',
            type: g.type ?? 'REGULAR',
          })
        }
      } catch { /* skip */ }
    }
    rawMatches.push({
      id: m.id, utcDate: m.utcDate, status: m.status,
      stage: m.stage, group: m.group ?? null,
      homeTeam: { name: m.homeTeam.name, shortName: m.homeTeam.shortName, tla: m.homeTeam.tla, crest: m.homeTeam.crest },
      awayTeam: { name: m.awayTeam.name, shortName: m.awayTeam.shortName, tla: m.awayTeam.tla, crest: m.awayTeam.crest },
      score: { fullTime: m.score.fullTime, halfTime: m.score.halfTime },
      goals,
      venue: m.venue ?? '',
    })
  }

  const payload: CachePayload = {
    updatedAt: new Date().toISOString(),
    competition: comp.name ?? 'FIFA World Cup 2026',
    season: String(comp.currentSeason?.startDate?.slice(0, 4) ?? '2026'),
    matches: rawMatches,
  }
  await saveToBlob(payload)
  return payload
}

export async function lightRefresh(): Promise<CachePayload> {
  const cached = await loadFromBlob()
  const matchesData = await apiFetch(`/competitions/${COMP}/matches`)
  const fresh = matchesData.matches ?? []

  const goalMap = new Map<number, MatchData['goals']>(
    (cached?.matches ?? []).map(m => [m.id, m.goals])
  )

  const updated: MatchData[] = fresh.map((m: Record<string, unknown>) => ({
    id: m.id as number, utcDate: m.utcDate as string, status: m.status as string,
    stage: m.stage as string, group: (m.group as string | null) ?? null,
    homeTeam: m.homeTeam as MatchData['homeTeam'],
    awayTeam: m.awayTeam as MatchData['awayTeam'],
    score: m.score as MatchData['score'],
    goals: goalMap.get(m.id as number) ?? [],
    venue: (m.venue as string) ?? '',
  }))

  const payload: CachePayload = {
    updatedAt: new Date().toISOString(),
    competition: cached?.competition ?? 'FIFA World Cup 2026',
    season: cached?.season ?? '2026',
    matches: updated,
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

  // Build stages
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
      const hasLive = stageMatches.some(m => ['IN_PLAY','PAUSED','SCHEDULED','TIMED'].includes(m.status))
      const allDone = stageMatches.length > 0 && stageMatches.every(m => m.status === 'FINISHED')
      const active = hasLive && !allDone
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

export async function saveToBlob(payload: CachePayload) {
  await put(BLOB_KEY, JSON.stringify(payload), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  })
}

export async function loadFromBlob(): Promise<CachePayload | null> {
  try {
    const meta = await head(BLOB_KEY)
    if (!meta) return null
    const res = await fetch(meta.url, { cache: 'no-store' })
    return await res.json()
  } catch {
    return null
  }
}
