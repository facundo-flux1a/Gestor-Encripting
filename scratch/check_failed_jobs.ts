import { Queue } from 'bullmq';
import { redis } from '../src/lib/redis';
import { INGESTION_QUEUE_NAME, GEMINI_QUEUE_NAME, DB_WRITER_QUEUE_NAME } from '../src/lib/queue';

async function checkFailed() {
  const queues = [
    new Queue(INGESTION_QUEUE_NAME, { connection: redis }),
    new Queue(GEMINI_QUEUE_NAME, { connection: redis }),
    new Queue(DB_WRITER_QUEUE_NAME, { connection: redis })
  ];

  for (const q of queues) {
    const failed = await q.getFailed(0, 10);
    console.log(`\n=== Failed jobs in ${q.name} ===`);
    if (failed.length === 0) {
      console.log('No failed jobs.');
    }
    for (const job of failed) {
      console.log(`Job ${job.id}: ${job.failedReason}`);
      console.log(`Data:`, JSON.stringify(job.data, null, 2));
      console.log(`Stacktrace: ${job.stacktrace}`);
    }
  }
  process.exit(0);
}

checkFailed();
