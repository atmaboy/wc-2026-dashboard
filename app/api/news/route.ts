import { NextResponse } from 'next/server';

const SOURCES = [
  {
    name: 'BBC Sport',
    lang: 'en',
    url:  'https://www.bbc.com/sport/football/world-cup',
  },
  {
    name: 'Goal.com',
    lang: 'en',
    url:  'https://www.goal.com/en/world-cup',
  },
  {
    name: 'Bola.net',
    lang: 'id',
    url:  'https://www.bola.net/piala-dunia/',
  },
  {
    name: 'Detik Sport',
    lang: 'id',
    url:  'https://sport.detik.com/sepakbola/piala-dunia',
  },
];

const BASE_URLS: Record<string, string> = {
  'BBC Sport':   'https://www.bbc.com',
  'Goal.com':    'https://www.goal.com',
  'Bola.net':    'https://www.bola.net',
  'Detik Sport': 'https://sport.detik.com',
};

function resolveUrl(href: string, sourceName: string): string {
  if (!href) return '#';
  if (href.startsWith('http')) return href;
  return (BASE_URLS[sourceName] || '') + (href.startsWith('/') ? href : '/' + href);
}

// In-memory cache: avoid re-scraping on every request
let newsCache: { articles: any[]; ts: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function scrapeSource(source: { name: string; lang: string; url: string }) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000); // 4s hard timeout
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WC2026Dashboard/1.0; +https://wc-2026-dashboard.vercel.app)',
        'Accept':          'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
        'Cache-Control':   'no-cache',
      },
      cache:  'no-store',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const html = await res.text();

    const articles: {
      title: string; summary: string; url: string;
      source: string; lang: string; publishedAt: string;
    }[] = [];

    const anchorRe = /<a[^>]+href=["']([^"'#][^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();

    while ((m = anchorRe.exec(html)) !== null && articles.length < 8) {
      const href     = m[1];
      const innerHtml = m[2];
      const text     = innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      if (text.length < 25 || text.length > 220) continue;

      const lower = text.toLowerCase();
      const relevant = [
        'world cup', 'piala dunia', 'fifa', 'wc 2026', '2026',
        'goal', 'match', 'group stage', 'knockout', 'quarter', 'semi', 'final',
        'pertandingan', 'gol', 'babak', 'timnas',
      ].some((kw) => lower.includes(kw));
      if (!relevant) continue;

      const fullUrl = resolveUrl(href, source.name);
      if (seen.has(fullUrl) || fullUrl === '#') continue;
      seen.add(fullUrl);

      const pMatch = html.slice(m.index, m.index + 600).match(/<p[^>]*>([\s\S]*?)<\/p>/i);
      const summary = pMatch
        ? pMatch[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
        : '';

      articles.push({
        title:       text,
        summary,
        url:         fullUrl,
        source:      source.name,
        lang:        source.lang,
        publishedAt: new Date().toISOString(),
      });
    }

    return articles.slice(0, 6);
  } catch {
    return [];
  }
}

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

export async function GET() {
  try {
    // Serve from in-memory cache if fresh
    if (newsCache && Date.now() - newsCache.ts < CACHE_TTL) {
      return NextResponse.json({
        ok: true, count: newsCache.articles.length,
        articles: newsCache.articles,
        cached: true,
        generatedAt: new Date(newsCache.ts).toISOString(),
      });
    }

    // Race all sources with individual 4s timeouts; never block each other
    const results = await Promise.allSettled(SOURCES.map(scrapeSource));
    const articles = results
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .slice(0, 30);

    newsCache = { articles, ts: Date.now() };

    return NextResponse.json({
      ok:          true,
      count:       articles.length,
      articles,
      cached:      false,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    // Return stale cache on error rather than failing
    if (newsCache) {
      return NextResponse.json({
        ok: true, count: newsCache.articles.length,
        articles: newsCache.articles, cached: true, stale: true,
        generatedAt: new Date(newsCache.ts).toISOString(),
      });
    }
    return NextResponse.json({ ok: false, error: err.message, articles: [] }, { status: 500 });
  }
}
