import { NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

const HEARTBEAT_KEY = 'workers:heartbeat';
/** Si el heartbeat tiene más de esto, consideramos workers caídos */
const STALE_MS = 90_000;

/**
 * Salud de workers: los procesos escriben workers:heartbeat cada ~15s.
 * Sin heartbeat reciente → UI puede mostrar banner.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session?.userId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const raw = await redis.get(HEARTBEAT_KEY).catch(() => null);
    const lastMs = raw ? parseInt(String(raw), 10) : 0;
    const ageMs = lastMs > 0 ? Date.now() - lastMs : null;
    const ok = ageMs != null && ageMs < STALE_MS;

    return NextResponse.json({
      ok,
      lastHeartbeatMs: lastMs || null,
      ageSec: ageMs != null ? Math.round(ageMs / 1000) : null,
      staleAfterSec: STALE_MS / 1000,
    });
  } catch (error) {
    console.error('[workers/health]', error);
    return NextResponse.json(
      { ok: false, error: 'No se pudo consultar salud de workers' },
      { status: 500 }
    );
  }
}
