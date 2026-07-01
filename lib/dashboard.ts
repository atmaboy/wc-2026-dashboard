import { put, del, list, getDownloadUrl } from '@vercel/blob';

const API_BASE = 'https://api.football-data.org/v4';
const COMPETITION = process.env.FOOTBALL_DATA_COMPETITION_CODE || 'WC';
const TZ = 'Asia/Jakarta';
const BLOB_PATH = 'world-cup-dashboard/latest.json';

const STAGES = [
  { key: 'GROUP_STAGE',    label: 'Fase 48 Group',       order: 1, aliases: ['GROUP_STAGE', 'GROUP'] },
  { key: 'ROUND_OF_32',   label: 'Babak 36 Besar',       order: 2, aliases: ['ROUND_OF_32', 'LAST_32', 'ROUND_32'] },
  { key: 'ROUND_OF_16',   label: 'Babak 16 Besar',       order: 3, aliases: ['ROUND_OF_16', 'LAST_16', 'ROUND_16'] },
  { key: 'QUARTER_FINALS',label: '3/4 Final',             order: 4, aliases: ['QUARTER_FINALS', 'QUARTER_FINAL'] },
  { key: 'SEMI_FINALS',   label: 'Semi Final',            order: 5, aliases: ['SEMI_FINALS', 'SEMI_FINAL'] },
  { key: 'THIRD_PLACE',   label: 'Perebutan Juara 3',     order: 6, aliases: ['THIRD_PLACE'] },
  { key: 'FINAL',         label: 'Babak Final',           order: 7, aliases: ['FINAL'] },
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

function enrichMatch(match: any) {
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
    homeTeam:   match.homeTeam?.name || 'TBD',
    awayTeam:   match.awayTeam?.name || 'TBD',
    homeShort:  match.homeTeam?.tla  || match.homeTeam?.shortName || '',
    awayShort:  match.awayTeam?.tla  || match.awayTeam?.shortName || '',
    score: {
      home: match.score?.fullTime?.home ?? null,
      away: match.score?.fullTime?.away ?? null,
    },
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
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`football-data.org ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function refreshDashboardData() {
  const [competition, matchPayload] = await Promise.all([
    apiGet(`/competitions/${COMPETITION}`),
    apiGet(`/competitions/${COMPETITION}/matches`),
  ]);

  const matches   = matchPayload.matches || [];
  const now       = new Date();
  const next3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const stages    = summarizeStages(matches);
  const current   = stages.find((s) => s.isCurrent) || stages[0];

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
      completed:         matches.filter((m: any) => m.status === 'FINISHED').length,
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
      .map(enrichMatch),
    past: matches
      .filter((m: any) => m.status === 'FINISHED')
      .sort((a: any, b: any) => +new Date(a.utcDate) - +new Date(b.utcDate))
      .map(enrichMatch),
  };

  // Delete old blob first (if exists), then re-upload
  try {
    const existing = await list({ prefix: BLOB_PATH });
    if (existing.blobs.length > 0) {
      await del(existing.blobs.map((b) => b.url));
    }
  } catch { /* ignore */ }

  await put(BLOB_PATH, JSON.stringify(payload, null, 2), {
    access:          'private',
    addRandomSuffix: false,
    contentType:     'application/json',
  });

  return payload;
}

export async function readDashboardData() {
  try {
    // list blobs with the prefix to find the private blob URL
    const result = await list({ prefix: BLOB_PATH });
    if (!result.blobs.length) return null;

    const blob = result.blobs[0];
    // getDownloadUrl generates a signed URL for private blobs
    const downloadUrl = await getDownloadUrl(blob.url);
    const res = await fetch(downloadUrl, { cache: 'no-store' });
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
