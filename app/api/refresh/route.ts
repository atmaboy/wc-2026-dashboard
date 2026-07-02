import { NextRequest, NextResponse } from 'next/server'
import { lightRefresh } from '@/lib/football'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function isAuthorized(req: NextRequest): boolean {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader === `Bearer ${CRON_SECRET}` && CRON_SECRET) return true

  // Check x-cron-secret header (Vercel cron)
  const cronHeader = req.headers.get('x-cron-secret') ?? ''
  if (cronHeader === CRON_SECRET && CRON_SECRET) return true

  // Check query param fallback
  const querySecret = req.nextUrl.searchParams.get('secret') ?? ''
  if (querySecret === CRON_SECRET && CRON_SECRET) return true

  return false
}

async function handleRefresh(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await lightRefresh()
    return NextResponse.json({
      ok: true,
      updatedAt: result.updatedAt,
      totalMatches: result.matches?.length ?? 0,
    })
  } catch (err: unknown) {
    console.error('[refresh] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Refresh failed' },
      { status: 500 }
    )
  }
}

// Accept both POST (GitHub Actions cron) and GET (Vercel cron / manual browser hit)
export async function POST(req: NextRequest) {
  return handleRefresh(req)
}

export async function GET(req: NextRequest) {
  return handleRefresh(req)
}
