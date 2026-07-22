/**
 * Contadores Redis de llamadas Vertex por upload (Fase 0 del plan de eficiencia).
 * Clave: vertex:calls:{uploadId}  → hash { extract, paginate, repair, nf, multi-img, classify, other, bytes, t429 }
 * TTL 24h. Agregable con scripts/vertex-calls-summary.ts
 */

import { redis } from '@/lib/redis';
import { wLog } from '@/lib/worker-logger';

export type VertexCallType =
  | 'extract'
  | 'paginate'
  | 'repair'
  | 'nf'
  | 'multi-img'
  | 'classify'
  | 'other';

const TTL_SEC = 24 * 60 * 60;

function keyFor(uploadId: string): string {
  return `vertex:calls:${uploadId}`;
}

export async function recordVertexCall(opts: {
  uploadId: string;
  callType: VertexCallType;
  bytes?: number;
  is429?: boolean;
  durationMs?: number;
}): Promise<void> {
  const { uploadId, callType, bytes = 0, is429 = false, durationMs } = opts;
  if (!uploadId) return;
  try {
    const key = keyFor(uploadId);
    const pipe = redis.pipeline();
    pipe.hincrby(key, callType, 1);
    pipe.hincrby(key, 'total', 1);
    if (bytes > 0) pipe.hincrby(key, 'bytes', bytes);
    if (is429) pipe.hincrby(key, 't429', 1);
    if (durationMs != null) pipe.hincrby(key, 'duration_ms', Math.round(durationMs));
    pipe.expire(key, TTL_SEC);
    await pipe.exec();
    wLog(
      'VertexMetrics',
      `call type=${callType} upload=${uploadId} bytes=${bytes}${is429 ? ' 429' : ''}${durationMs != null ? ` ${durationMs}ms` : ''}`
    );
  } catch (e) {
    console.warn('[VertexMetrics] no se pudo registrar:', e);
  }
}

export async function getVertexCallStats(uploadId: string): Promise<Record<string, number>> {
  try {
    const raw = await redis.hgetall(keyFor(uploadId));
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw || {})) {
      out[k] = parseInt(String(v), 10) || 0;
    }
    return out;
  } catch {
    return {};
  }
}

/** Mapea job Gemini → tipo de métrica */
export function callTypeFromJobType(jobType: string): VertexCallType {
  switch (jobType) {
    case 'extract-facturable':
      return 'extract';
    case 'paginate':
      return 'paginate';
    case 'extract-repair':
      return 'repair';
    case 'extract-non-facturable':
      return 'nf';
    case 'extract-multiple-image':
      return 'multi-img';
    case 'classify':
      return 'classify';
    default:
      return 'other';
  }
}
