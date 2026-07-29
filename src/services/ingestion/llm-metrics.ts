/**
 * Contadores Redis de llamadas LLM por upload.
 * Clave: llm:calls:{uploadId}
 */

import { redis } from '@/lib/redis';
import { wLog } from '@/lib/worker-logger';

export type LlmCallType =
  | 'extract'
  | 'paginate'
  | 'repair'
  | 'nf'
  | 'multi-img'
  | 'classify'
  | 'other';

const TTL_SEC = 24 * 60 * 60;

function keyFor(uploadId: string): string {
  return `llm:calls:${uploadId}`;
}

export async function recordLlmCall(opts: {
  uploadId: string;
  callType: LlmCallType;
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
      'LlmMetrics',
      `call type=${callType} upload=${uploadId} bytes=${bytes}${is429 ? ' 429' : ''}${durationMs != null ? ` ${durationMs}ms` : ''}`
    );
  } catch (e) {
    console.warn('[LlmMetrics] no se pudo registrar:', e);
  }
}

export function callTypeFromJobType(jobType: string): LlmCallType {
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
