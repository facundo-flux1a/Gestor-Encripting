import 'dotenv/config';
import { ingestionQueue, geminiQueue, dbWriterQueue } from '../lib/queue';

async function nukeAll() {
  console.log('💣 Limpieza total de todas las colas BullMQ...\n');

  for (const q of [ingestionQueue, geminiQueue, dbWriterQueue]) {
    const waiting = await q.getJobs(['waiting', 'delayed', 'active', 'paused']);
    for (const job of waiting) {
      await job.remove().catch(() => {});
    }
    await q.clean(0, 10000, 'failed');
    await q.clean(0, 10000, 'completed');
    console.log(`✅ ${q.name}: ${waiting.length} jobs eliminados`);
  }

  console.log('\n🎉 Todas las colas vacías. Sistema listo para prueba limpia.');
  process.exit(0);
}

nukeAll().catch(console.error);
