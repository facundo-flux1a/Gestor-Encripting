/**
 * Agrega métricas vertex:calls:* desde Redis (Fase 0).
 * Uso: npx tsx --env-file=.env scripts/vertex-calls-summary.ts [uploadId...]
 * Sin args: escanea keys vertex:calls:* (hasta 500).
 */
import 'dotenv/config';
import { redis } from '../src/lib/redis';

async function statsFor(uploadId: string) {
  const raw = await redis.hgetall(`vertex:calls:${uploadId}`);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw || {})) {
    out[k] = parseInt(String(v), 10) || 0;
  }
  return out;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main() {
  const args = process.argv.slice(2);
  let uploadIds = args;

  if (uploadIds.length === 0) {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await redis.scan(cursor, 'MATCH', 'vertex:calls:*', 'COUNT', 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0' && keys.length < 500);
    uploadIds = keys.map((k) => k.replace(/^vertex:calls:/, ''));
  }

  if (uploadIds.length === 0) {
    console.log('Sin métricas vertex:calls:* en Redis.');
    process.exit(0);
  }

  const totals: number[] = [];
  let sum429 = 0;
  let withRepair = 0;
  let withPaginate = 0;

  console.log('uploadId\ttotal\textract\tpaginate\trepair\tnf\tmulti\t429\tbytes');
  for (const id of uploadIds) {
    const s = await statsFor(id);
    const total = s.total || 0;
    totals.push(total);
    sum429 += s.t429 || 0;
    if ((s.repair || 0) > 0) withRepair++;
    if ((s.paginate || 0) > 0) withPaginate++;
    console.log(
      [
        id,
        total,
        s.extract || 0,
        s.paginate || 0,
        s.repair || 0,
        s.nf || 0,
        s['multi-img'] || 0,
        s.t429 || 0,
        s.bytes || 0,
      ].join('\t')
    );
  }

  totals.sort((a, b) => a - b);
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  console.log('---');
  console.log(`n=${totals.length} calls_avg=${avg.toFixed(2)} calls_p50=${percentile(totals, 50)} calls_p95=${percentile(totals, 95)}`);
  console.log(`uploads_with_repair=${withRepair} uploads_with_paginate=${withPaginate} sum_429=${sum429}`);

  await redis.quit().catch(() => {});
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
