/**
 * src/workers/ingestion.worker.ts
 *
 * Worker principal de ingesta. Escucha la `ingestionQueue` y enruta cada job:
 *
 *   ZIP/RAR  →  re-encola cada hijo como job individual en ingestionQueue
 *   PDF/IMG  →  encola en geminiQueue con type: 'classify'
 *
 * El archivo físico NO se descarga aquí — solo se enruta.
 * La descarga y llamada a Gemini ocurre en gemini.worker.ts.
 */

import { Worker, Job } from 'bullmq';
import { redis } from '@/lib/redis';
import { ingestionQueue, geminiQueue, IngestionJobData, INGESTION_QUEUE_NAME } from '@/lib/queue';
import { updateIngestionProgress, PROGRESS, createIngestionRecord } from '@/lib/ingestion-progress';

// Cuántos jobs de ingesta (ZIP-routing) procesar en paralelo.
// Es CPU-light, puede ser alto. Los Gemini calls tienen su propia limitación.
const INGESTION_CONCURRENCY = parseInt(process.env.INGESTION_CONCURRENCY || '20', 10);

export function startIngestionWorker() {
  const worker = new Worker<IngestionJobData>(
    INGESTION_QUEUE_NAME,
    async (job: Job<IngestionJobData>) => {
      const data = job.data;
      const { uploadId, fileName, normalizedFileType, isCompressedFile } = data;

      console.log(`[IngestionWorker] 📥 Job ${job.id} | ${fileName} | tipo: ${normalizedFileType}`);

      try {
        // ── Caso 1: Es un archivo comprimido (ZIP o RAR) ──────────────────────
        // El upload-service ya:
        //   - Calculó los hashes de los hijos
        //   - Creó los registros en actividad para cada hijo
        //   - Nos manda individualFileHashes e individualUploadIds
        //
        // Nuestro trabajo: encolar cada hijo en ingestionQueue como job individual.
        if (isCompressedFile && data.individualFileHashes && data.individualUploadIds) {
          const childFileNames = Object.keys(data.individualFileHashes);
          const totalHijos = childFileNames.length;

          console.log(`[IngestionWorker] 📦 ZIP/RAR con ${totalHijos} archivos. Encolando hijos...`);

          await updateIngestionProgress(uploadId, {
            status: 'procesando',
            step: `Lote recibido: ${totalHijos} archivos`,
            progress: 5,
            mensaje: `Archivo comprimido con ${totalHijos} documentos. Procesando en cola...`,
          });

          // Encolar cada hijo como job individual
          const childJobs = childFileNames.map((childFileName, idx) => {
            const childUploadId = data.individualUploadIds![childFileName];
            const childHash = data.individualFileHashes![childFileName];

            // Determinar el tipo del hijo por extensión
            const ext = childFileName.split('.').pop()?.toLowerCase() || '';
            const childMimeType = getMimeTypeFromExt(ext);
            const childNormalizedType = getNormalizedTypeFromExt(ext);

            const childJobData: IngestionJobData = {
              // IDs
              uploadId: childUploadId,
              parentUploadId: uploadId, // el ZIP padre

              // Empresa (heredada)
              empresaId: data.empresaId,
              cif: data.cif,
              nombreEmpresa: data.nombreEmpresa,
              recargo: data.recargo,

              // El archivo hijo: la URL del ZIP padre con el nombre del hijo
              // El worker de Gemini sabe cómo extraer el archivo correcto del ZIP
              text: data.text, // S3 path del ZIP padre
              fileName: childFileName,
              originalFileName: childFileName,
              fileHash: childHash,
              publicUrl: data.publicUrl, // URL del ZIP padre
              mimeType: childMimeType,
              normalizedFileType: childNormalizedType,
              fileExtension: ext,
              fileSize: 0, // desconocido hasta que se extrae
              isCompressedFile: false,
              fechaSubida: data.fechaSubida,

              origen: data.origen,

              // Progreso relativo al lote
              documentoIndex: idx + 1,
              totalDocumentos: totalHijos,
            };

            return {
              name: `ingest-child-${childUploadId}`,
              data: childJobData,
              opts: {
                // Escalonar los hijos para no sobrecargar
                delay: idx * 200, // 200ms entre cada hijo
              },
            };
          });

          await ingestionQueue.addBulk(childJobs);

          console.log(`[IngestionWorker] ✅ ${totalHijos} hijos encolados para ${fileName}`);
          return { encolados: totalHijos };
        }

        // ── Caso 2: Archivo individual (PDF, imagen, Word, Excel...) ──────────
        // Encolar en geminiQueue para clasificación. El gemini worker se encarga
        // de llamar a Analista4/Analista33 y luego bifurcar.
        console.log(`[IngestionWorker] 📄 Archivo individual. Encolando en geminiQueue para clasificación...`);

        await updateIngestionProgress(uploadId, PROGRESS.RECEIVED);

        await geminiQueue.add(
          `classify-${uploadId}`,
          {
            type: 'classify',
            ingestion: data,
          },
          {
            jobId: `classify-${uploadId}`, // deduplicación
          }
        );

        console.log(`[IngestionWorker] ✅ Job de clasificación encolado para ${fileName}`);
        return { clasificando: true };

      } catch (error: any) {
        console.error(`[IngestionWorker] ❌ Error en job ${job.id} (${fileName}):`, error.message);

        await updateIngestionProgress(uploadId, {
          status: 'Fallido',
          step: 'Error en cola de ingesta',
          progress: 0,
          mensaje: `❌ Error interno al encolar el documento: ${error.message}`,
        }).catch(() => {}); // No propagar errores de progreso

        throw error; // BullMQ hará el retry según la config
      }
    },
    {
      connection: redis,
      concurrency: INGESTION_CONCURRENCY,
    }
  );

  worker.on('completed', (job) => {
    console.log(`[IngestionWorker] ✅ Job completado: ${job.id}`);
  });

  worker.on('failed', (job, err) => {
    console.error(`[IngestionWorker] ❌ Job fallido: ${job?.id} | ${err.message}`);
  });

  worker.on('error', (err) => {
    console.error('[IngestionWorker] Error del worker:', err);
  });

  console.log(`[IngestionWorker] 🚀 Arrancado con concurrency=${INGESTION_CONCURRENCY}`);
  return worker;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getMimeTypeFromExt(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] || 'application/octet-stream';
}

function getNormalizedTypeFromExt(ext: string): string {
  const map: Record<string, string> = {
    pdf: 'pdf',
    jpg: 'jpeg',
    jpeg: 'jpeg',
    png: 'png',
    doc: 'word',
    docx: 'word',
    xls: 'excel',
    xlsx: 'excel',
  };
  return map[ext] || ext;
}
