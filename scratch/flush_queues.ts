import 'dotenv/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const redis = new IORedis(process.env.REDIS_URL!, { maxRetriesPerRequest: null });

const QUEUE_NAMES = ['ingestion-queue', 'gemini-queue', 'db-writer-queue'];

async function flush() {
  console.log('🧹 Limpiando colas de BullMQ...\n');

  for (const name of QUEUE_NAMES) {
    const q = new Queue(name, { connection: redis });
    const [failed, waiting, delayed, active] = await Promise.all([
      q.getFailed(),
      q.getWaiting(),
      q.getDelayed(),
      q.getActive(),
    ]);
    console.log(`[${name}] → failed:${failed.length} | waiting:${waiting.length} | delayed:${delayed.length} | active:${active.length}`);
    await q.obliterate({ force: true });
    console.log(`[${name}] ✅ Obliterada\n`);
    await q.close();
  }

  await redis.quit();
  console.log('✅ Redis cerrado. Colas limpias. Podés levantar los workers de nuevo.');
}

flush().catch((e) => { console.error('❌', e); process.exit(1); });
