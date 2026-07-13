import { NextRequest, NextResponse } from 'next/server';
import { getWorkerLogs, clearWorkerLogs } from '@/lib/worker-logger';

export const dynamic = 'force-dynamic';

// GET: Obtener últimos N logs
export async function GET(request: NextRequest) {
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '150', 10);

  try {
    const logs = await getWorkerLogs(Math.min(limit, 300));
    return NextResponse.json({ logs }, {
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
  } catch (error: any) {
    return NextResponse.json({ logs: [], error: error.message }, { status: 200 });
  }
}

// DELETE: Limpiar logs
export async function DELETE() {
  try {
    await clearWorkerLogs();
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
