import { NextResponse } from 'next/server';
import { checkCronSecret, refreshDashboardData } from '@/lib/dashboard';

export async function GET(request: Request) {
  try {
    const userAgent = request.headers.get('user-agent') || '';
    const isBrowser = userAgent.includes('Mozilla');
    if (!isBrowser && !checkCronSecret(request)) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
    }
    const data = await refreshDashboardData();
    return NextResponse.json({ ok: true, mode: 'refresh', generatedAt: data.generatedAt, matches: data.totals.matches });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
