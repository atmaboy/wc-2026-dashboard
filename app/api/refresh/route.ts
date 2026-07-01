import { NextResponse } from 'next/server';
import { refreshDashboardData } from '@/lib/dashboard';

export const runtime     = 'nodejs';
export const maxDuration = 60;

// Public endpoint — called by the browser Refresh button.
// No auth check; rate-limiting is handled by Vercel's edge network.
export async function GET() {
  try {
    const data = await refreshDashboardData();
    return NextResponse.json({
      ok:          true,
      generatedAt: data.generatedAt,
      matches:     data.totals.matches,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
