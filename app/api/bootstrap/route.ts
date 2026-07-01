import { NextResponse } from 'next/server';
import { refreshDashboardData } from '@/lib/dashboard';

// Node runtime required: bootstrap runs scorer batching (~35s total)
export const runtime     = 'nodejs';
export const maxDuration = 60; // max allowed on Vercel Hobby/Pro

export async function GET() {
  try {
    const data = await refreshDashboardData();
    return NextResponse.json({
      ok:          true,
      message:     'Bootstrap selesai. Blob URL tersimpan di cache.',
      matches:     data.totals.matches,
      completed:   data.totals.completed,
      generatedAt: data.generatedAt,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
