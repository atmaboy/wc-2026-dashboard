import { NextResponse } from 'next/server';

const SOURCES = [
  {
    name: 'BBC Sport',
    lang: 'en',
    url:  'https://www.bbc.com/sport/football/world-cup',
    selectors: {
      item:    '[data-testid="anchor-inner-wrapper"], .gs-c-promo, article',
      title:   '[data-testid="card-headline"], .gs-c-promo-heading__title, h3',
      summary: '[data-testid="card-description"], .gs-c-promo-summary, p',
      link:    'a',
    },
  },
  {
    name: 'Goal.com',
    lang: 'en',
    url:  'https://www.goal.com/en/world-cup',
    selectors: {
      item:    'article, .article-card',
      title:   'h3, h2, .article-title',
      summary: 'p, .article-excerpt',
      link:    'a',
    },
  },
  {
    name: 'Bola.net',
    lang: 'id',
    url:  'https://www.bola.net/piala-dunia/',
    selectors: {
      item:    'article, .article-item, .item',
      title:   'h2, h3, .title',
      summary: 'p, .excerpt, .summary',
      link:    'a',
    },
  },
  {
    name: 'Detik Sport',
    lang: 'id',
    url:  'https://sport.detik.com/sepakbola/piala-dunia',
    selectors: {
      item:    'article, .list-content__item',
      title:   'h3, h2, .media__title',
      summary: 'p, .media__desc',
      link:    'a',
    },
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

async function scrapeSource(source: typeof SOURCES[0]) {
  try {
    const res = await fetch(source.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; WC2026Dashboard/1.0)',
        'Accept':     'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9,id;q=0.8',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Lightweight manual parser — no cheerio needed at runtime
    const articles: { title: string; summary: string; url: string; source: string; lang: string; publishedAt: string }[] = [];

    // Extract <a> tags with meaningful text (>20 chars) — covers most news sites
    const anchorRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match: RegExpExecArray | null;
    const seen = new Set<string>();

    while ((match = anchorRe.exec(html)) !== null && articles.length < 8) {
      const href = match[1];
      const innerHtml = match[2];

      // Strip inner HTML tags to get text
      const text = innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (text.length < 25 || text.length > 200) continue;

      // Keyword filter for World Cup relevance
      const lower = text.toLowerCase();
      const relevant = [
        'world cup', 'piala dunia', 'fifa', 'wc2026', '2026',
        'goal', 'match', 'group', 'knockout', 'quarter', 'semi', 'final',
        'pertandingan', 'gol', 'babak', 'tim nasional',
      ].some((kw) => lower.includes(kw));
      if (!relevant) continue;

      const fullUrl = resolveUrl(href, source.name);
      if (seen.has(fullUrl) || fullUrl === '#') continue;
      seen.add(fullUrl);

      // Try to find a following <p> as summary (crude but effective)
      const pMatch = html.slice(match.index, match.index + 600).match(/<p[^>]*>([\s\S]*?)<\/p>/i);
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

export const runtime = 'nodejs';
export const revalidate = 300; // 5 min cache

export async function GET() {
  try {
    const results = await Promise.allSettled(SOURCES.map(scrapeSource));
    const articles = results
      .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
      .slice(0, 30);

    return NextResponse.json({
      ok:          true,
      count:       articles.length,
      articles,
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
