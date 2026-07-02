import { NextResponse } from 'next/server'
import { lightRefresh, buildDashboard } from '@/lib/football'

export const maxDuration = 30
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // Allow cron (Bearer token) or manual (no auth header)
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    if (auth && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  try {
    const payload = await lightRefresh()
    const dashboard = buildDashboard(payload)
    return NextResponse.json({
      ok: true,
      updatedAt: payload.updatedAt,
      liveCount: dashboard.liveCount,
      total: dashboard.totalMatches,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
