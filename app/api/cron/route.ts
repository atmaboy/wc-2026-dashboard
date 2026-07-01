import { NextResponse } from 'next/server'
import { fullRefresh, buildDashboard } from '@/lib/football'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization')
    const isVercelCron = req.headers.get('x-vercel-cron') === '1'
    const isGithubActions = auth === `Bearer ${secret}`
    if (!isVercelCron && !isGithubActions) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  try {
    const payload = await fullRefresh()
    const dashboard = buildDashboard(payload)
    return NextResponse.json({ ok: true, updatedAt: payload.updatedAt, liveCount: dashboard.liveCount, total: dashboard.totalMatches })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
