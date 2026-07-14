import 'dotenv/config';
import { ingestionQueue, geminiQueue, dbWriterQueue } from '../lib/queue';

async function nukeAll() {
  console.log('💣 Limpieza total de todas las colas BullMQ...\n');

  for (const q of [ingestionQueue, geminiQueue, dbWriterQueue]) {
    try {
      // pause queue first to stop workers from grabbing jobs while we nuke
      await q.pause(); 
      // obliterate destruye la cola por completo, el force ignora locks de jobs activos
      await q.obliterate({ force: true });
      console.log(`✅ ${q.name}: completamente aniquilada (obliterated)`);
    } catch (e: any) {
      console.log(`⚠️ ${q.name}: error al aniquilar (${e.message})`);
    } finally {
      // reactivar por las dudas (aunque obliterate la borra de redis)
      await q.resume();
    }
  }

  console.log('\n🎉 Todas las colas vacías. Sistema listo para prueba limpia.');
  process.exit(0);
}

nukeAll().catch(console.error);
