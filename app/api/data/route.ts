import { NextResponse } from 'next/server'
import { loadFromBlob, fullRefresh, buildDashboard } from '@/lib/football'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET() {
  try {
    // Try cache first
    let payload = await loadFromBlob()

    // If cache is empty, do a live fetch so the dashboard shows data immediately
    // without requiring manual /api/bootstrap call
    if (!payload) {
      payload = await fullRefresh()
    }

    if (!payload) {
      return NextResponse.json(
        { error: 'Unable to load match data. Check FOOTBALL_DATA_API_TOKEN env var.' },
        { status: 503 }
      )
    }

    return NextResponse.json(buildDashboard(payload))
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 503 })
  }
}
