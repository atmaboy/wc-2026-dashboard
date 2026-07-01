import { put, del, list } from '@vercel/blob';

const API_BASE    = 'https://api.football-data.org/v4';
const COMPETITION = process.env.FOOTBALL_DATA_COMPETITION_CODE || 'WC';
const TZ          = 'Asia/Jakarta';
const BLOB_PATH   = 'world-cup-dashboard/latest.json';

let cachedBlobUrl: string | null = process.env.BLOB_DASHBOARD_URL || null;

function setBlobUrl(url: string) {
  cachedBlobUrl = url;
}

export const STAGES = [
  { key: 'GROUP_STAGE',     label: 'Fase Group',        order: 1, aliases: ['GROUP_STAGE', 'GROUP'] },
  { key: 'ROUND_OF_32',    label: 'Babak 32 Besar',     order: 2, aliases: ['ROUND_OF_32', 'LAST_32', 'ROUND_32'] },
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
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ,
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    ...options,
  }).format(new Date(date));
}
function fmtDay(date: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short',
  }).format(new Date(date));
}
function fmtTime(date: string) {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(date));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Scorer types                                                         */
/* ------------------------------------------------------------------ */
export type Scorer = {
  name:   string;
  team:   string;
  minute: number | null;
  type:   string;
  goals:  number;
};

/* ------------------------------------------------------------------ */
/* Fetch top scorers via /competitions/{code}/scorers                  */
/* Single API call — no per-match individual fetching needed           */
/* ------------------------------------------------------------------ */
async function fetchTopScorers(token: string): Promise<Scorer[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${API_BASE}/competitions/${COMPETITION}/scorers?limit=100`, {
      headers: { 'X-Auth-Token': token },
      cache:   'no-store',
      signal:  controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn(`[scorers] API returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    const scorers: any[] = data.scorers || [];
    return scorers.map((s: any) => ({
      name:   s.player?.name || s.player?.shortName || 'Unknown',
      team:   s.team?.shortName || s.team?.name || '',
      minute: null,   // not available from /scorers endpoint
      type:   '',
      goals:  s.numberOfGoals ?? s.goals ?? 0,
    }));
  } catch (e) {
    console.warn('[scorers] fetch failed:', e);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Per-match detail fetch — used ONLY to get goals[] for a single match */
/* Called with a small batch to stay within rate limits                 */
/* ------------------------------------------------------------------ */
const MATCH_FETCH_TIMEOUT = 4000;
const MATCH_BATCH_SIZE    = 5;
const MATCH_BATCH_DELAY   = 7000; // 7s between batches → ~8 matches/min safely
const MAX_MATCHES_TO_FETCH = parseInt(process.env.SCORER_FETCH_MAX || '30', 10);

type GoalEvent = {
  name:   string;
  team:   string;
  minute: number | null;
  type:   string;
};

function extractGoals(goals: any[]): GoalEvent[] {
  if (!Array.isArray(goals) || goals.length === 0) return [];
  return goals
    .filter((g: any) => g.scorer?.name)
    .map((g: any) => ({
      name:   g.scorer.name,
      team:   g.team?.shortName || g.team?.name || '',
      minute: g.minute ?? null,
      type:   g.type === 'OWN_GOAL' ? 'OG' : g.type === 'PENALTY' ? 'PEN' : '',
    }));
}

async function fetchMatchGoals(matchId: number, token: string): Promise<GoalEvent[]> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), MATCH_FETCH_TIMEOUT);
    const res = await fetch(`${API_BASE}/matches/${matchId}`, {
      headers: { 'X-Auth-Token': token },
      cache:   'no-store',
      signal:  controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const data = await res.json();
    const goals: any[] = data.match?.goals ?? data.goals ?? [];
    return extractGoals(goals);
  } catch {
    return [];
  }
}

/**
 * Build a map of matchId → GoalEvent[] by fetching individual match endpoints.
 * Limited to the most recent MAX_MATCHES_TO_FETCH finished matches.
 * Falls back to empty array on rate-limit or timeout.
 */
async function buildGoalEventsMap(
  finishedMatches: any[],
  token: string,
): Promise<Map<number, GoalEvent[]>> {
  const goalMap = new Map<number, GoalEvent[]>();

  // Most recent first → prioritize newest matches for scorer data
  const toFetch = [...finishedMatches]
    .sort((a, b) => +new Date(b.utcDate) - +new Date(a.utcDate))
    .slice(0, MAX_MATCHES_TO_FETCH);

  for (let i = 0; i < toFetch.length; i += MATCH_BATCH_SIZE) {
    if (i > 0) await sleep(MATCH_BATCH_DELAY);
    const batch = toFetch.slice(i, i + MATCH_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((m: any) => fetchMatchGoals(m.id, token))
    );
    results.forEach((r, idx) => {
      goalMap.set(
        batch[idx].id,
        r.status === 'fulfilled' ? r.value : [],
      );
    });
  }
  return goalMap;
}

/* ------------------------------------------------------------------ */
/* Match enrichment                                                     */
/* ------------------------------------------------------------------ */
function enrichMatch(match: any, goalEvents: GoalEvent[] = []) {
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
    homeTeam:   match.homeTeam?.name     || 'TBD',
    awayTeam:   match.awayTeam?.name     || 'TBD',
    homeShort:  match.homeTeam?.tla      || match.homeTeam?.shortName || '',
    awayShort:  match.awayTeam?.tla      || match.awayTeam?.shortName || '',
    homeCrest:  match.homeTeam?.crest    || null,
    awayCrest:  match.awayTeam?.crest    || null,
    score: {
      home: match.score?.fullTime?.home ?? null,
      away: match.score?.fullTime?.away ?? null,
    },
    // goalEvents: array of { name, team, minute, type }
    scorers: goalEvents,
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

async function apiGet(path: string) {
  const token = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) throw new Error('Missing FOOTBALL_DATA_API_TOKEN');
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Auth-Token': token },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status}: ${await res.text()}`);
  return res.json();
}

/* ------------------------------------------------------------------ */
/* Main refresh                                                         */
/* ------------------------------------------------------------------ */
export async function refreshDashboardData() {
  const token = process.env.FOOTBALL_DATA_API_TOKEN;
  if (!token) throw new Error('Missing FOOTBALL_DATA_API_TOKEN');

  // 3 parallel calls: competition info, all matches, top scorers
  const [competition, matchPayload, topScorers] = await Promise.all([
    apiGet(`/competitions/${COMPETITION}`),
    apiGet(`/competitions/${COMPETITION}/matches`),
    fetchTopScorers(token),
  ]);

  const matches         = matchPayload.matches || [];
  const now             = new Date();
  const next3Days       = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const stages          = summarizeStages(matches);
  const current         = stages.find((s) => s.isCurrent) || stages[0];
  const finishedMatches = matches.filter((m: any) => m.status === 'FINISHED');

  // Fetch per-match goal events (batched, rate-limit safe)
  const goalEventsMap = await buildGoalEventsMap(finishedMatches, token);

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
    // Top scorers leaderboard (from /scorers endpoint — 1 API call)
    topScorers,
    upcoming: matches
      .filter((m: any) => new Date(m.utcDate) >= now && new Date(m.utcDate) <= next3Days)
      .sort((a: any, b: any) => +new Date(a.utcDate) - +new Date(b.utcDate))
      .map((m: any) => enrichMatch(m, [])),
    past: finishedMatches
      .sort((a: any, b: any) => +new Date(b.utcDate) - +new Date(a.utcDate))
      .map((m: any) => enrichMatch(m, goalEventsMap.get(m.id) || [])),
  };

  // Delete old blob then write new one
  try {
    const existing = await list({ prefix: BLOB_PATH });
    if (existing.blobs.length > 0) {
      await del(existing.blobs.map((b: any) => b.url));
    }
  } catch { /* ignore */ }

  const blob = await put(BLOB_PATH, JSON.stringify(payload), {
    access:          'public',
    addRandomSuffix: false,
    contentType:     'application/json',
  });

  setBlobUrl(blob.url);
  return payload;
}

/* ------------------------------------------------------------------ */
/* Read                                                                 */
/* ------------------------------------------------------------------ */
export async function readDashboardData() {
  try {
    if (cachedBlobUrl) {
      const res = await fetch(cachedBlobUrl, { next: { revalidate: 30 } });
      if (res.ok) return res.json();
      cachedBlobUrl = null;
    }
    const result = await list({ prefix: BLOB_PATH });
    if (!result.blobs.length) return null;
    const blob = result.blobs[0];
    setBlobUrl(blob.url);
    const res = await fetch(blob.url, { next: { revalidate: 30 } });
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
