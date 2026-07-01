import { NextResponse } from 'next/server'
import { loadFromBlob, buildDashboard } from '@/lib/football'

export const dynamic = 'force-dynamic'

export async function GET() {
  const payload = await loadFromBlob()
  if (!payload) {
    return NextResponse.json({ error: 'Cache empty. Visit /api/bootstrap first.' }, { status: 503 })
  }
  return NextResponse.json(buildDashboard(payload))
}
