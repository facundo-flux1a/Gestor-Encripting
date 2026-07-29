/**
 * src/workers/ingestion.worker.ts
 *
 * Worker principal de ingesta. Escucha la `ingestionQueue` y enruta cada job:
 *
 *   ZIP/RAR  →  re-encola cada hijo como job individual en ingestionQueue
 *   PDF/IMG  →  encola en extractionQueue con type: 'extract-facturable'
 *               (routing facturable/multi en la misma respuesta; sin hop classify)
 *
 * El archivo físico NO se descarga aquí — solo se enruta.
 * La descarga y extracción ocurren en extraction.worker.ts.
 */

import { Worker, Job } from 'bullmq';
import { redis } from '@/lib/redis';
import { ingestionQueue, extractionQueue, IngestionJobData, INGESTION_QUEUE_NAME } from '@/lib/queue';
import { updateIngestionProgress, PROGRESS, createIngestionRecord } from '@/lib/ingestion-progress';
import { wLog } from '@/lib/worker-logger';

// Cuántos jobs de ingesta (ZIP-routing) procesar en paralelo.
// Es CPU-light, puede ser alto. Los Gemini calls tienen su propia limitación.
const INGESTION_CONCURRENCY = parseInt(process.env.INGESTION_CONCURRENCY || '20', 10);

export function startIngestionWorker() {
  const worker = new Worker<IngestionJobData>(
    INGESTION_QUEUE_NAME,
    async (job: Job<IngestionJobData>) => {
      const data = job.data;
      const { uploadId, fileName, normalizedFileType, isCompressedFile } = data;

      wLog('IngestionWorker', `📥 Job ${job.id} | ${fileName} | ${normalizedFileType}`);

      try {
        // ── Caso 1: Es un archivo comprimido (ZIP o RAR) ──────────────────────
        // El upload-service ya:
        //   - Calculó los hashes de los hijos
        //   - Creó los registros en actividad para cada hijo
        //   - Nos manda individualFileHashes e individualUploadIds
        //
        // Nuestro trabajo: encolar cada hijo en ingestionQueue como job individual.
        if (isCompressedFile) {
          // Si el ZIP/RAR viene del webhook, no tendrá individualFileHashes y debemos extraerlo ahora
          if (!data.individualFileHashes || !data.individualUploadIds) {
            console.log(`[IngestionWorker] 📦 ZIP/RAR de origen webhook sin extraer. Descargando y extrayendo...`);
            
            await updateIngestionProgress(uploadId, {
              status: 'procesando',
              step: 'Extrayendo lote',
              progress: 5,
              mensaje: 'Descargando archivo comprimido para extraer documentos...',
            });

            const response = await fetch(data.publicUrl);
            if (!response.ok) throw new Error(`Error HTTP al descargar ZIP/RAR de MinIO: ${response.status}`);
            const fileBuffer = await response.arrayBuffer();

            const { S3Client } = await import('@aws-sdk/client-s3');
            const MINIO_ENDPOINT = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar';
            const s3Client = new S3Client({
              region: process.env.MINIO_REGION || 'us-east-1',
              endpoint: MINIO_ENDPOINT,
              credentials: {
                accessKeyId: process.env.MINIO_ACCESS_KEY!,
                secretAccessKey: process.env.MINIO_SECRET_KEY!,
              },
              forcePathStyle: true,
            });

            const { extractAndUploadZipChildren, extractAndUploadRarChildren } = await import('@/services/upload-service');
            const bucketName = process.env.MINIO_BUCKET_NAME || 'gestor-documental';
            
            let extractResult;
            if (data.normalizedFileType === 'rar') {
              extractResult = await extractAndUploadRarChildren(fileBuffer, uploadId, s3Client, bucketName, MINIO_ENDPOINT);
            } else {
              extractResult = await extractAndUploadZipChildren(fileBuffer, uploadId, s3Client, bucketName, MINIO_ENDPOINT);
            }

            data.individualFileHashes = extractResult.fileHashes;
            data.individualUploadIds  = extractResult.uploadIds;
            data.individualFilePaths  = extractResult.filePaths;
            data.individualPublicUrls = extractResult.publicUrls;

            // Crear registros de actividad inicial para cada hijo
            for (const [childName, childId] of Object.entries(extractResult.uploadIds)) {
              await createIngestionRecord({
                uploadId: childId,
                parentUploadId: uploadId,
                empresaId: BigInt(data.empresaId),
                documentoNombre: childName,
                fileHash: extractResult.fileHashes[childName],
                origen: (data.origen as 'dashboard' | 'correo') || 'correo',
              });
            }
          }

          const childFileNames = Object.keys(data.individualFileHashes);
          const totalHijos = childFileNames.length;

          console.log(`[IngestionWorker] 📦 ZIP/RAR con ${totalHijos} archivos. Encolando hijos...`);

          await updateIngestionProgress(uploadId, {
            status: 'procesando',
            step: `Lote extraído: ${totalHijos} archivos`,
            progress: 10,
            mensaje: `Archivo comprimido extraído exitosamente. Encolando ${totalHijos} documentos...`,
          });

          // Encolar cada hijo como job individual
          const childJobs = childFileNames.map((childFileName, idx) => {
            const childUploadId = data.individualUploadIds![childFileName];
            const childHash     = data.individualFileHashes![childFileName];

            // Usar el S3 path y URL propios del hijo (ya subido individualmente en upload-service)
            const childS3Path  = data.individualFilePaths?.[childFileName]  ?? data.text;
            const childPubUrl  = data.individualPublicUrls?.[childFileName] ?? data.publicUrl;

            // Determinar el tipo del hijo por extensión
            const ext = childFileName.split('.').pop()?.toLowerCase() || '';
            const childMimeType       = getMimeTypeFromExt(ext);
            const childNormalizedType = getNormalizedTypeFromExt(ext);

            const childJobData: IngestionJobData = {
              // IDs
              uploadId:       childUploadId,
              parentUploadId: uploadId, // el ZIP/RAR padre

              // Empresa (heredada)
              empresaId:    data.empresaId,
              cif:          data.cif,
              nombreEmpresa: data.nombreEmpresa,
              recargo:      data.recargo,

              // El archivo hijo: su propio S3 path y URL pública (ya subido a MinIO)
              text:               childS3Path,
              fileName:           childFileName,
              originalFileName:   childFileName,
              fileHash:           childHash,
              publicUrl:          childPubUrl,
              mimeType:           childMimeType,
              normalizedFileType: childNormalizedType,
              fileExtension:      ext,
              fileSize:           0, // desconocido en esta etapa
              isCompressedFile:   false,
              fechaSubida:        data.fechaSubida,
              origen:             data.origen,

              // Progreso relativo al lote
              documentoIndex:  idx + 1,
              totalDocumentos: totalHijos,
            };

            return {
              name: `ingest-child-${childUploadId}`,
              data: childJobData,
              opts: {
                delay: idx * 200, // 200ms entre cada hijo para no sobrecargar
              },
            };
          });

          await ingestionQueue.addBulk(childJobs);

          console.log(`[IngestionWorker] ✅ ${totalHijos} hijos encolados para ${fileName}`);
          return { encolados: totalHijos };
        }

        // ── Caso 2: Archivo individual (PDF, imagen, Word, Excel...) ──────────
        // Directo a extract-facturable: es_facturable / es_multiple viajan en la
        // misma respuesta; el extraction worker bifurca a paginate / NF / multi-img.
        console.log(`[IngestionWorker] 📄 Archivo individual. Encolando extract (sin classify)...`);

        await updateIngestionProgress(uploadId, PROGRESS.RECEIVED);

        // Pacing también en carga singular (antes solo lotes multi tenían delay).
        // Evita que N subidas 1-a-1 saturen el LLM al mismo segundo.
        const singularDelayMs = parseInt(process.env.SINGULAR_CLASSIFY_DELAY_MS || '1500', 10);
        const staggerIndex = typeof data.documentoIndex === 'number' ? Math.max(0, data.documentoIndex - 1) : 0;
        // Si no viene de lote, usar un jitter estable por uploadId para no alinear todos en t=0
        const hashDelay = !data.documentoIndex
          ? (Array.from(uploadId).reduce((a, c) => a + c.charCodeAt(0), 0) % 5) * singularDelayMs
          : staggerIndex * singularDelayMs;

        await extractionQueue.add(
          `extract-facturable-${uploadId}`,
          {
            type: 'extract-facturable',
            ingestion: data,
          },
          {
            jobId: `extract-facturable-${uploadId}`,
            delay: hashDelay,
          }
        );

        console.log(`[IngestionWorker] ✅ Job de extracción encolado para ${fileName}`);
        return { extrayendo: true };

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
    wLog('IngestionWorker', `✅ Job completado: ${job.id}`, 'success');
  });

  worker.on('failed', (job, err) => {
    console.error(`[IngestionWorker] ❌ Job fallido: ${job?.id} | ${err.message}`);
    wLog('IngestionWorker', `❌ Job fallido: ${job?.id} — ${err.message}`, 'error');
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
