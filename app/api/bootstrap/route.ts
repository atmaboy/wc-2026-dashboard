import { NextResponse } from 'next/server';
import { refreshDashboardData } from '@/lib/dashboard';

export async function GET() {
  try {
    const data = await refreshDashboardData();
    return NextResponse.json({ ok: true, mode: 'bootstrap', generatedAt: data.generatedAt, matches: data.totals.matches });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
