import { NextResponse } from 'next/server';
import { readDashboardData } from '@/lib/dashboard';

export async function GET() {
  try {
    const data = await readDashboardData();
    if (!data) {
      return NextResponse.json({ ok: false, error: 'Cache kosong. Jalankan /api/bootstrap lebih dulu.' }, { status: 404 });
    }
    return NextResponse.json({ ok: true, ...data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
