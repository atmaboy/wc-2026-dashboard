import { NextRequest, NextResponse } from 'next/server';
import { readDashboardData } from '@/lib/dashboard';

// Edge runtime: lowest cold-start latency, runs on Vercel CDN edge nodes
export const runtime = 'edge';

export async function GET(_req: NextRequest) {
  try {
    const data = await readDashboardData();
    if (!data) {
      return NextResponse.json(
        { ok: false, error: 'Cache kosong. Jalankan /api/bootstrap lebih dulu.' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { ok: true, ...data },
      {
        headers: {
          // Fresh from CDN edge for 60s, stale-while-revalidate for 5 min
          'Cache-Control': 's-maxage=60, stale-while-revalidate=300',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
