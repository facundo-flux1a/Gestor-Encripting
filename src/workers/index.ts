/**
 * src/workers/index.ts
 *
 * Punto de entrada para inicializar todos los workers de BullMQ.
 * Ejecutar con: npx tsx --env-file=.env src/workers/index.ts
 */
import 'dotenv/config';

import { startIngestionWorker } from './ingestion.worker';
import { startGeminiWorker } from './gemini.worker';
import { startDbWriterWorker } from './db-writer.worker';
import { redis } from '@/lib/redis';
import { reconcileStaleActividad } from '@/services/actividad-reconcile';

const HEARTBEAT_KEY = 'workers:heartbeat';
const HEARTBEAT_TTL_SEC = 120;
const HEARTBEAT_EVERY_MS = 15_000;
const envPrefix = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
const WORKER_LOCK_KEY = `workers:${envPrefix}:singleton-lock`;
const WORKER_LOCK_TTL_SEC = 60;
const RECONCILE_EVERY_MS = 2 * 60 * 1000;

async function acquireSingletonLock(): Promise<boolean> {
  // SET NX: solo un proceso de workers por entorno Redis
  const ok = await redis.set(WORKER_LOCK_KEY, String(process.pid), 'EX', WORKER_LOCK_TTL_SEC, 'NX');
  return ok === 'OK';
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
        '❌ Ya hay otro proceso de workers activo (lock Redis). Abortando para no pelear locks BullMQ.'
      );
      process.exit(1);
    }
    console.log(`🔒 Lock de worker adquirido (pid=${process.pid})`);

    startIngestionWorker();
    startGeminiWorker();
    startDbWriterWorker();

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
