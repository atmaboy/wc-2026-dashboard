import { NextRequest, NextResponse } from 'next/server';
import { refreshDashboardData, checkCronSecret } from '@/lib/dashboard';

export const runtime     = 'nodejs';
export const maxDuration = 60;

// Protected endpoint — called only by Vercel Cron.
// Requires Authorization: Bearer <CRON_SECRET> or x-vercel-cron: 1 header.
export async function GET(req: NextRequest) {
  if (!checkCronSecret(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
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
