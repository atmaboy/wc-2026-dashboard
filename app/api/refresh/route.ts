import { NextRequest, NextResponse } from 'next/server'
import { lightRefresh } from '@/lib/football'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const CRON_SECRET = process.env.CRON_SECRET ?? ''

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get('authorization') ?? ''
  if (authHeader === `Bearer ${CRON_SECRET}` && CRON_SECRET) return true

  const cronHeader = req.headers.get('x-cron-secret') ?? ''
  if (cronHeader === CRON_SECRET && CRON_SECRET) return true

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

export async function POST(req: NextRequest) {
  return handleRefresh(req)
}

export async function GET(req: NextRequest) {
  return handleRefresh(req)
}
