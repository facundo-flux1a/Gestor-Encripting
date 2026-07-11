/**
 * src/workers/index.ts
 * 
 * Punto de entrada para inicializar todos los workers de BullMQ.
 * Ejecutar con: npx tsx src/workers/index.ts
 */
import 'dotenv/config'; // <-- ESTO CARGA EL .env AUTOMÁTICAMENTE


import { startIngestionWorker } from './ingestion.worker';
import { startGeminiWorker } from './gemini.worker';
import { startDbWriterWorker } from './db-writer.worker';

async function bootstrap() {
  console.log('🚀 Iniciando sistema de Workers (BullMQ)...');
  
  try {
    startIngestionWorker();
    startGeminiWorker();
    startDbWriterWorker();
    
    console.log('✅ Todos los workers han sido iniciados correctamente y están escuchando en Redis.');
  } catch (error) {
    console.error('❌ Error al iniciar los workers:', error);
    process.exit(1);
  }
}

bootstrap();
