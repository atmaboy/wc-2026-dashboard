import { NextResponse } from 'next/server'
import { fullRefresh, buildDashboard } from '@/lib/football'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const payload = await fullRefresh()
    const dashboard = buildDashboard(payload)
    return NextResponse.json({ ok: true, updatedAt: payload.updatedAt, summary: { total: dashboard.totalMatches, finished: dashboard.finished.length, upcoming: dashboard.upcoming.length } })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
