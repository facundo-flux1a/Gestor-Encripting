/**
 * src/workers/index.ts
 *
 * Punto de entrada para inicializar todos los workers de BullMQ.
 * Ejecutar con: npx tsx --env-file=.env src/workers/index.ts
 */
import 'dotenv/config';

import { startIngestionWorker } from './ingestion.worker';
import { startExtractionWorker } from './extraction.worker';
import { startDbWriterWorker } from './db-writer.worker';
import { startNotificationWorker } from './notification.worker';
import { redis } from '@/lib/redis';
import { reconcileStaleActividad } from '@/services/actividad-reconcile';
import { Queue } from 'bullmq';
import { EXTRACTION_QUEUE_NAME, extractionQueue } from '@/lib/queue';

const HEARTBEAT_KEY = 'workers:heartbeat';
const HEARTBEAT_TTL_SEC = 120;
const HEARTBEAT_EVERY_MS = 15_000;
const envPrefix = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const WORKER_LOCK_KEY = `workers:${envPrefix}:singleton-lock`;
const WORKER_LOCK_TTL_SEC = 60;
const RECONCILE_EVERY_MS = 2 * 60 * 1000;

async function acquireSingletonLock(): Promise<boolean> {
  // Reintenta hasta LOCK_TTL+30s para sobrevivir redeploys (el lock anterior expira en 60s)
  const maxWaitMs = (WORKER_LOCK_TTL_SEC + 30) * 1000;
  const retryEveryMs = 5000;
  const start = Date.now();

  while (Date.now() - start < maxWaitMs) {
    const ok = await redis.set(WORKER_LOCK_KEY, String(process.pid), 'EX', WORKER_LOCK_TTL_SEC, 'NX');
    if (ok === 'OK') return true;

    const ttl = await redis.ttl(WORKER_LOCK_KEY);
    console.log(`⏳ [Workers] Lock ocupado (TTL: ${ttl}s). Reintentando en ${retryEveryMs / 1000}s...`);
    await new Promise(r => setTimeout(r, retryEveryMs));
  }

  return false;
}

async function renewSingletonLock(): Promise<boolean> {
  const current = await redis.get(WORKER_LOCK_KEY);
  if (current && current !== String(process.pid)) return false;
  await redis.set(WORKER_LOCK_KEY, String(process.pid), 'EX', WORKER_LOCK_TTL_SEC);
  return true;
}

async function bootstrap() {
  console.log('🚀 Iniciando sistema de Workers (BullMQ)...');

  try {
    const gotLock = await acquireSingletonLock();
    if (!gotLock) {
      console.error(
        '❌ No se pudo adquirir el lock de worker tras 90s de espera. Abortando.'
      );
      process.exit(1);
    }
    console.log(`🔒 Lock de worker adquirido (pid=${process.pid})`);

    // Migrar jobs huérfanos de la cola legacy `-gemini-extraction` → `-extraction`
    try {
      const prefix = process.env.NODE_ENV === 'production' ? '{prod}' : '{dev}';
      const legacyName = `${prefix}-gemini-extraction`;
      if (legacyName !== EXTRACTION_QUEUE_NAME) {
        const legacy = new Queue(legacyName, { connection: redis });
        const waiting = await legacy.getJobs(['waiting', 'delayed', 'prioritized'], 0, 200);
        for (const job of waiting) {
          await extractionQueue.add(job.name, job.data, {
            jobId: job.id ? `migrated-${job.id}` : undefined,
            delay: typeof job.opts?.delay === 'number' ? job.opts.delay : undefined,
          });
          await job.remove();
        }
        if (waiting.length > 0) {
          console.log(`♻️ Migrados ${waiting.length} job(s) desde ${legacyName}`);
        }
        await legacy.close();
      }
    } catch (e) {
      console.warn('[Workers] No se pudo migrar cola legacy gemini:', e);
    }

    startIngestionWorker();
    startExtractionWorker();
    startDbWriterWorker();
    startNotificationWorker();

    const beat = async () => {
      try {
        const stillMine = await renewSingletonLock();
        if (!stillMine) {
          console.error('❌ Perdimos el lock de worker. Saliendo.');
          process.exit(1);
        }
        await redis.setex(HEARTBEAT_KEY, HEARTBEAT_TTL_SEC, String(Date.now()));
      } catch (e) {
        console.warn('[Workers] heartbeat/lock falló:', e);
      }
    };
    await beat();
    setInterval(beat, HEARTBEAT_EVERY_MS);

    const runReconcile = async () => {
      try {
        const r = await reconcileStaleActividad();
        if (r.queuedNoFile || r.orphanProcessing) {
          console.log(
            `🧹 [Reconcile] queuedSinArchivo=${r.queuedNoFile} huerfanos=${r.orphanProcessing}`
          );
        }
      } catch (e) {
        console.warn('[Workers] reconcile falló:', e);
      }
    };
    await runReconcile();
    setInterval(runReconcile, RECONCILE_EVERY_MS);

    console.log('✅ Todos los workers han sido iniciados correctamente y están escuchando en Redis.');
  } catch (error) {
    console.error('❌ Error al iniciar los workers:', error);
    process.exit(1);
  }
}

bootstrap();
