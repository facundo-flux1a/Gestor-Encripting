import 'dotenv/config';
import { ingestionQueue, geminiQueue, dbWriterQueue } from '../lib/queue';

async function clearFailed() {
  console.log('🧹 Limpiando trabajos fallidos de BullMQ...');
  
  for (const queue of [ingestionQueue, geminiQueue, dbWriterQueue]) {
    await queue.clean(0, 1000, 'failed');
    console.log(`✅ Trabajos fallidos eliminados de ${queue.name}`);
  }
  
  console.log('🎉 Listo, colas limpias.');
  process.exit(0);
}

clearFailed();
