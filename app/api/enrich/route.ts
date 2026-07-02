/**
 * /api/enrich — incremental scorer enrichment via TheSportsDB.
 *
 * Because 72+ finished matches cannot be enriched in a single
 * serverless call (Vercel 60s limit), this endpoint processes
 * matches in small pages:
 *
 *   GET /api/enrich?page=0&size=8
 *
 * It reads the Blob cache, enriches the next `size` FINISHED
 * matches that still have empty goals[], writes back to Blob,
 * and returns how many remain. Repeat until remaining === 0.
 *
 * The dashboard Refresh button calls this automatically via
 * the client-side enrichUntilDone() helper below.
 */
import { NextRequest, NextResponse } from 'next/server'
import { loadFromBlob, saveToBlob, CachePayload, MatchData } from '@/lib/football'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const TSD_KEY = process.env.THESPORTSDB_API_KEY ?? '3'
const TSD_BASE = `https://www.thesportsdb.com/api/v1/json/${TSD_KEY}`

async function tsdFetch(path: string) {
  const res = await fetch(`${TSD_BASE}/${path}`, { cache: 'no-store' })
  if (!res.ok) throw new Error(`thesportsdb ${path} → ${res.status}`)
  return res.json()
}

function normName(raw: string): string {
  const ALIASES: Record<string, string> = {
    unitedstates: 'usa', unitedstatesofamerica: 'usa',
    korearepublic: 'southkorea', republicofkorea: 'southkorea',
    iriran: 'iran', islamicrepublicofiran: 'iran',
    czechrepublic: 'czechia',
    northmacedonia: 'macedonia',
    ivorycoast: 'cotedivoire', coteivoire: 'cotedivoire',
  }
  const key = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  return ALIASES[key] ?? key
}

async function findTsdEvent(match: MatchData): Promise<Record<string, unknown> | null> {
  const date = match.utcDate.slice(0, 10)
  const homeNorm = normName(match.homeTeam.name)
  const awayNorm = normName(match.awayTeam.name)

  let events: Record<string, unknown>[] = []
  try {
    const data = await tsdFetch(`eventsday.php?d=${date}&s=Soccer`)
    events = Array.isArray((data as any).events) ? (data as any).events : []
  } catch {
    return null
  }

  const wcEvents = events.filter((e) =>
    String((e as any).strLeague ?? '').toLowerCase().includes('world cup')
  )
  const pool = wcEvents.length > 0 ? wcEvents : events

  for (const e of pool) {
    const eh = normName(String((e as any).strHomeTeam ?? ''))
    const ea = normName(String((e as any).strAwayTeam ?? ''))
    if (eh !== homeNorm || ea !== awayNorm) continue

    if (match.score.fullTime.home != null && match.score.fullTime.away != null) {
      const sh = String((e as any).intHomeScore ?? '')
      const sa = String((e as any).intAwayScore ?? '')
      if (sh !== String(match.score.fullTime.home) || sa !== String(match.score.fullTime.away)) continue
    }
    return e as Record<string, unknown>
  }
  return null
}

function extractTsdGoals(event: Record<string, unknown>, match: MatchData): MatchData['goals'] {
  const goals: MatchData['goals'] = []
  const parseDetails = (details: string, teamLabel: string) => {
    if (!details?.trim()) return
    details.split(';').forEach((chunk) => {
      const trimmed = chunk.trim()
      if (!trimmed) return
      const m = trimmed.match(/^(.+?)\s*\((\d+)(?:\+\d+)?\s*(pen|og|owngoal)?\s*\)$/i)
      if (!m) return
      const scorer = m[1].trim()
      if (!scorer) return
      const minute = parseInt(m[2], 10)
      const qualifier = (m[3] ?? '').toLowerCase()
      const type = qualifier === 'og' || qualifier === 'owngoal' ? 'OWN_GOAL'
        : qualifier === 'pen' ? 'PENALTY' : 'REGULAR'
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

export async function GET(req: NextRequest) {
  const page = parseInt(req.nextUrl.searchParams.get('page') ?? '0', 10)
  const size = Math.min(parseInt(req.nextUrl.searchParams.get('size') ?? '8', 10), 20)

  const cached = await loadFromBlob()
  if (!cached) {
    return NextResponse.json({ ok: false, error: 'No cache found. Run /api/bootstrap first.' }, { status: 404 })
  }

  // Find all FINISHED matches still missing goals
  const needsEnrich = cached.matches.filter(
    (m) => m.status === 'FINISHED' && (!Array.isArray(m.goals) || m.goals.length === 0)
  )

  const remaining = needsEnrich.length
  if (remaining === 0) {
    return NextResponse.json({ ok: true, enriched: 0, remaining: 0, done: true })
  }

  // Take the current page slice
  const batch = needsEnrich.slice(page * size, page * size + size)
  let enriched = 0

  await Promise.all(
    batch.map(async (match) => {
      try {
        const event = await findTsdEvent(match)
        if (!event) return
        const goals = extractTsdGoals(event, match)
        if (goals.length > 0) {
          // Mutate in place — cached.matches is the same array reference
          const idx = cached.matches.findIndex((m) => m.id === match.id)
          if (idx !== -1) {
            cached.matches[idx].goals = goals
            enriched++
          }
        }
      } catch {
        // silent fail
      }
    })
  )

  // Always write back to Blob (even if 0 enriched, to mark progress)
  const updatedPayload: CachePayload = {
    ...cached,
    updatedAt: new Date().toISOString(),
  }
  await saveToBlob(updatedPayload)

  const remainingAfter = cached.matches.filter(
    (m) => m.status === 'FINISHED' && (!Array.isArray(m.goals) || m.goals.length === 0)
  ).length

  return NextResponse.json({
    ok: true,
    enriched,
    remaining: remainingAfter,
    done: remainingAfter === 0,
    page,
    size,
  })
}
