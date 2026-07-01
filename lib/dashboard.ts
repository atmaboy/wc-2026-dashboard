import { put, del, list } from '@vercel/blob';

const API_BASE   = 'https://api.football-data.org/v4';
const COMPETITION = process.env.FOOTBALL_DATA_COMPETITION_CODE || 'WC';
const TZ          = 'Asia/Jakarta';
const BLOB_PATH   = 'world-cup-dashboard/latest.json';

// Max finished matches to individually fetch scorers for.
// Free tier: 10 req/min. We use AbortSignal timeout 5s each, no artificial delay.
// Keep this low enough to finish within Vercel's 60s function timeout.
const SCORER_FETCH_MAX = parseInt(process.env.SCORER_FETCH_MAX || '40', 10);

export const STAGES = [
  { key: 'GROUP_STAGE',     label: 'Fase 48 Group',     order: 1, aliases: ['GROUP_STAGE', 'GROUP'] },
  { key: 'ROUND_OF_32',    label: 'Babak 36 Besar',     order: 2, aliases: ['ROUND_OF_32', 'LAST_32', 'ROUND_32'] },
  { key: 'ROUND_OF_16',    label: 'Babak 16 Besar',     order: 3, aliases: ['ROUND_OF_16', 'LAST_16', 'ROUND_16'] },
  { key: 'QUARTER_FINALS', label: 'Perempat Final',      order: 4, aliases: ['QUARTER_FINALS', 'QUARTER_FINAL'] },
  { key: 'SEMI_FINALS',    label: 'Semi Final',          order: 5, aliases: ['SEMI_FINALS', 'SEMI_FINAL'] },
  { key: 'THIRD_PLACE',    label: 'Perebutan Juara 3',   order: 6, aliases: ['THIRD_PLACE'] },
  { key: 'FINAL',          label: 'Babak Final',         order: 7, aliases: ['FINAL'] },
];

function normalizeStage(stage: string = '') {
  const upper = String(stage).toUpperCase();
  return STAGES.find((s) => s.aliases.includes(upper))?.key || upper || 'UNKNOWN';
}

function fmtDate(date: string, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    ...options,
  }).format(new Date(date));
}

function fmtDay(date: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(date));
}

function fmtTime(date: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(date));
}

/* ------------------------------------------------------------------ */
/* Scorer extraction helpers                                            */
/* ------------------------------------------------------------------ */

type Scorer = { name: string; team: string; minute: number | null; type: string };

/**
 * Extract scorers from a goals[] array already present in match data.
 * football-data.org returns goals[] on individual match endpoint and
 * sometimes in bulk depending on subscription tier.
 */
function extractScorersFromGoals(goals: any[]): Scorer[] {
  if (!Array.isArray(goals) || goals.length === 0) return [];
  return goals
    .filter((g: any) => g.scorer?.name)
    .map((g: any) => ({
      name:   g.scorer.name,
      team:   g.team?.shortName || g.team?.name || '',
      minute: g.minute ?? null,
      type:   g.type === 'OWN_GOAL' ? 'OG' : (g.type === 'PENALTY' ? 'PEN' : ''),
    }));
}

/**
 * Fetch a single match by ID and extract scorers.
 * Uses 5s AbortSignal timeout so one slow request can't block the batch.
 */
async function fetchMatchScorers(matchId: number, token: string): Promise<Scorer[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${API_BASE}/matches/${matchId}`, {
      headers: { 'X-Auth-Token': token },
      cache:   'no-store',
      signal:  controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    // API returns either data.match.goals or data.goals depending on version
    const goals: any[] = data.match?.goals ?? data.goals ?? [];
    return extractScorersFromGoals(goals);
  } catch {
    return [];
  }
}

/**
 * Build a scorers map for all finished matches.
 *
 * Strategy:
 * 1. First try bulk match data — if goals[] is present (paid tiers), use it directly.
 * 2. For matches still missing scorers after bulk pass, individually fetch up to
 *    SCORER_FETCH_MAX matches using concurrent requests (no artificial delay).
 *    AbortSignal timeout = 5s per request. This keeps total time predictable.
 */
async function buildScorersMap(
  finishedMatches: any[],
  token: string
): Promise<Map<number, Scorer[]>> {
  const scorersMap = new Map<number, Scorer[]>();

  // Pass 1: extract from bulk data (free if API already returns goals[])
  const needsIndividualFetch: any[] = [];
  for (const m of finishedMatches) {
    if (Array.isArray(m.goals) && m.goals.length > 0) {
      scorersMap.set(m.id, extractScorersFromGoals(m.goals));
    } else {
      needsIndividualFetch.push(m);
    }
  }

  // Pass 2: individual fetch for matches without goals in bulk response
  const toFetch = needsIndividualFetch.slice(0, SCORER_FETCH_MAX);
  if (toFetch.length > 0) {
    // Concurrent fetch — each has its own 5s timeout
    const results = await Promise.allSettled(
      toFetch.map((m: any) => fetchMatchScorers(m.id, token))
    );
    results.forEach((r, idx) => {
      scorersMap.set(
        toFetch[idx].id,
        r.status === 'fulfilled' ? r.value : []
      );
    });
  }

  return scorersMap;
}

/* ------------------------------------------------------------------ */
/* Match enrichment & stage summary                                     */
/* ------------------------------------------------------------------ */

function enrichMatch(match: any, scorers: Scorer[] = []) {
  const stage = normalizeStage(match.stage);
  return {
    id:         match.id,
    utcDate:    match.utcDate,
    dateLabel:  fmtDate(match.utcDate),
    dayLabel:   fmtDay(match.utcDate),
    localTime:  fmtTime(match.utcDate),
    status:     match.status,
    stage,
    stageLabel: STAGES.find((s) => s.key === stage)?.label || match.stage || 'Unknown Stage',
    venue:      match.venue || 'Venue TBD',
    group:      match.group || null,
    homeTeam:   match.homeTeam?.name      || 'TBD',
    awayTeam:   match.awayTeam?.name      || 'TBD',
    homeShort:  match.homeTeam?.tla       || match.homeTeam?.shortName || '',
    awayShort:  match.awayTeam?.tla       || match.awayTeam?.shortName || '',
    homeCrest:  match.homeTeam?.crest     || null,
    awayCrest:  match.awayTeam?.crest     || null,
    score: {
      home: match.score?.fullTime?.home ?? null,
      away: match.score?.fullTime?.away ?? null,
    },
    scorers,
  };
}

function summarizeStages(matches: any[]) {
  const mapped = STAGES.map((stage) => {
    const items     = matches.filter((m) => normalizeStage(m.stage) === stage.key);
    const completed = items.filter((m) => m.status === 'FINISHED').length;
    const isCurrent =
      items.some((m) => ['TIMED', 'SCHEDULED', 'IN_PLAY', 'PAUSED'].includes(m.status))
      || (!items.length && stage.order === 1);
    return { ...stage, total: items.length, completed, isCurrent };
  });
  let found = false;
  return mapped.map((s) => {
    if (s.isCurrent && !found) { found = true; return s; }
    return { ...s, isCurrent: false };
  });
}

/* ------------------------------------------------------------------ */
/* API helper                                                           */
/* ------------------------------------------------------------------ */

async function apiGet(path: string) {
  const token = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) throw new Error('Missing FOOTBALL_DATA_API_TOKEN');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Auth-Token': token },
    cache:   'no-store',
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status}: ${await res.text()}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Main refresh function                                                */
/* ------------------------------------------------------------------ */

export async function refreshDashboardData() {
  const token = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) throw new Error('Missing FOOTBALL_DATA_API_TOKEN');

  // Fetch competition metadata and all matches in parallel
  const [competition, matchPayload] = await Promise.all([
    apiGet(`/competitions/${COMPETITION}`),
    apiGet(`/competitions/${COMPETITION}/matches`),
  ]);

  const matches    = matchPayload.matches || [];
  const now        = new Date();
  const next3Days  = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const stages     = summarizeStages(matches);
  const current    = stages.find((s) => s.isCurrent) || stages[0];

  // Build scorers map for finished matches
  const finishedMatches = matches.filter((m: any) => m.status === 'FINISHED');
  const scorersMap = await buildScorersMap(finishedMatches, token);

  const payload = {
    competition: {
      code:   competition.code,
      name:   competition.name,
      emblem: competition.emblem || null,
      area:   competition.area?.name || 'World',
    },
    source:      'football-data.org',
    timezone:    'GMT+7',
    generatedAt: new Date().toISOString(),
    totals: {
      matches:           matches.length,
      completed:         finishedMatches.length,
      upcomingNext3Days: matches.filter(
        (m: any) => new Date(m.utcDate) >= now && new Date(m.utcDate) <= next3Days
      ).length,
    },
    currentStatus: {
      stage:   current?.label || 'Belum tersedia',
      message: current
        ? `${current.completed}/${current.total || 0} pertandingan selesai`
        : 'Status turnamen belum tersedia',
    },
    stages,
    upcoming: matches
      .filter((m: any) => new Date(m.utcDate) >= now && new Date(m.utcDate) <= next3Days)
      .sort((a: any, b: any) => +new Date(a.utcDate) - +new Date(b.utcDate))
      .map((m: any) => enrichMatch(m, [])),
    past: finishedMatches
      .sort((a: any, b: any) => +new Date(b.utcDate) - +new Date(a.utcDate))
      .map((m: any) => enrichMatch(m, scorersMap.get(m.id) || [])),
  };

  // Save to Vercel Blob — overwrite existing
  try {
    const existing = await list({ prefix: BLOB_PATH });
    if (existing.blobs.length > 0) {
      await del(existing.blobs.map((b: any) => b.url));
    }
  } catch { /* ignore delete errors */ }

  await put(BLOB_PATH, JSON.stringify(payload, null, 2), {
    access:          'public',
    addRandomSuffix: false,
    contentType:     'application/json',
  });

  return payload;
}

/* ------------------------------------------------------------------ */
/* Read cached data from Blob                                           */
/* ------------------------------------------------------------------ */

export async function readDashboardData() {
  try {
    const result = await list({ prefix: BLOB_PATH });
    if (!result.blobs.length) return null;
    const blob  = result.blobs[0];
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const headers: Record<string, string> = token
      ? { Authorization: `Bearer ${token}` }
      : {};
    const res = await fetch(blob.url, { headers, cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export function checkCronSecret(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${secret}` || req.headers.get('x-vercel-cron') === '1';
}
