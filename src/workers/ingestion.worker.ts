/**
 * src/workers/ingestion.worker.ts
 *
 * Worker principal de ingesta. Escucha la `ingestionQueue` y enruta cada job:
 *
 *   ZIP/RAR  →  re-encola cada hijo como job individual en ingestionQueue
 *   PDF/IMG  →  encola en extractionQueue con type: 'extract-facturable'
 *               (routing facturable/multi en la misma respuesta; sin hop classify)
 *
 * Los contenedores se leen aquí desde S3 autenticado para expandirlos; los
 * documentos individuales se enrutan a extraction.worker.ts.
 */

import { Worker, Job, JobsOptions } from 'bullmq';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { redis } from '@/lib/redis';
import { ingestionQueue, extractionQueue, IngestionJobData, INGESTION_QUEUE_NAME } from '@/lib/queue';
import { updateIngestionProgress, PROGRESS, createIngestionRecord } from '@/lib/ingestion-progress';
import { wLog } from '@/lib/worker-logger';
import { archiveChildStorageKey, extractArchiveEntries } from '@/services/ingestion/archive';
import { findDuplicateFilesByHash } from '@/services/upload-service';

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
        // ── Caso 1: archivo comprimido (ZIP/RAR) ──────────────────────────────
        // Leer el padre por S3 autenticado es deliberado: una URL pública puede
        // expirar, no estar accesible desde el worker o tener ACL distinta. La
        // expansión se reconstruye de forma determinista en cada reintento.
        if (isCompressedFile) {
          await updateIngestionProgress(uploadId, {
            status: 'procesando',
            step: 'Extrayendo lote',
            progress: 5,
            mensaje: 'Leyendo el archivo comprimido desde almacenamiento seguro...',
          });

          const storage = createStorageClient();
          const bucketName = process.env.MINIO_BUCKET_NAME || 'gestor-documental';
          const archiveBuffer = await readObjectBuffer(storage, bucketName, data.text);
          const archiveType = normalizedFileType === 'rar' ? 'rar' : 'zip';
          const extracted = await extractArchiveEntries(archiveBuffer, archiveType, uploadId);
          const candidates = extracted.entries.filter((entry) => !entry.rejectionReason && entry.fileBuffer && entry.fileHash);
          const duplicateByHash = await findDuplicateFilesByHash(
            candidates.map((entry) => entry.fileHash!),
            data.empresaId
          );
          const hashesInThisArchive = new Set<string>();
          // `uploadId` es determinista para cada entrada del archivo. Usarlo
          // también como jobId vuelve idempotente la frontera cola: si el
          // worker se cae después de expandir/subir hijos y antes de confirmar
          // el job padre, BullMQ no duplica el trabajo al reintentar.
          const childJobs: Array<{ name: string; data: IngestionJobData; opts: JobsOptions }> = [];
          let rejected = 0;

          for (const entry of extracted.entries) {
            await createIngestionRecord({
              uploadId: entry.uploadId,
              parentUploadId: uploadId,
              empresaId: BigInt(data.empresaId),
              documentoNombre: entry.fileName,
              documentoTipo: entry.normalizedFileType,
              fileHash: entry.fileHash,
              origen: data.origen,
            });

            if (entry.rejectionReason) {
              rejected++;
              await updateIngestionProgress(entry.uploadId, {
                status: 'Fallido',
                step: 'Archivo no procesable',
                progress: 0,
                mensaje: `❌ ${entry.rejectionReason}`,
              });
              continue;
            }

            const duplicate = entry.fileHash && (duplicateByHash.get(entry.fileHash) || hashesInThisArchive.has(entry.fileHash));
            if (duplicate) {
              rejected++;
              await updateIngestionProgress(entry.uploadId, {
                // Fallido para que el agregador del padre lo contabilice como
                // terminal; el paso/mensaje conservan el motivo exacto.
                status: 'Fallido',
                step: 'Verificación de duplicados',
                progress: 100,
                mensaje: '⚠️ Factura omitida: ya existe un archivo idéntico en esta empresa o en este mismo lote.',
              });
              continue;
            }
            hashesInThisArchive.add(entry.fileHash!);

            try {
              const childPath = archiveChildStorageKey(data.empresaId, uploadId, entry);
              await storage.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: childPath,
                Body: entry.fileBuffer!,
                ContentType: entry.mimeType || 'application/octet-stream',
              }));
              // PDFTools recibe una URL temporal; los objetos extraídos no se
              // exponen públicamente sólo para permitir la paginación.
              const childUrl = await getSignedUrl(
                storage,
                new GetObjectCommand({ Bucket: bucketName, Key: childPath }),
                { expiresIn: 6 * 60 * 60 }
              );
              await createIngestionRecord({
                uploadId: entry.uploadId,
                parentUploadId: uploadId,
                empresaId: BigInt(data.empresaId),
                documentoNombre: entry.fileName,
                documentoTipo: entry.normalizedFileType,
                fileHash: entry.fileHash,
                filePath: childPath,
                origen: data.origen,
              });

              const extension = extensionFromName(entry.fileName, entry.normalizedFileType);
              childJobs.push({
                name: `ingest-child-${entry.uploadId}`,
                data: {
                  uploadId: entry.uploadId,
                  parentUploadId: uploadId,
                  empresaId: data.empresaId,
                  cif: data.cif,
                  nombreEmpresa: data.nombreEmpresa,
                  recargo: data.recargo,
                  text: childPath,
                  fileName: entry.fileName,
                  originalFileName: entry.originalFileName,
                  fileHash: entry.fileHash!,
                  publicUrl: childUrl,
                  mimeType: entry.mimeType!,
                  normalizedFileType: entry.normalizedFileType!,
                  fileExtension: extension,
                  fileSize: entry.fileSize,
                  isCompressedFile: false,
                  fechaSubida: data.fechaSubida,
                  origen: data.origen,
                  documentoIndex: childJobs.length + 1,
                  totalDocumentos: candidates.length,
                },
                opts: {
                  jobId: `ingest-child-${entry.uploadId}`,
                  delay: childJobs.length * 200,
                },
              });
            } catch (childError: any) {
              // Una factura con error de almacenamiento no borra ni frena las
              // demás. Queda visible en Actividad y el lote continúa.
              rejected++;
              await updateIngestionProgress(entry.uploadId, {
                status: 'Fallido',
                step: 'Guardando archivo extraído',
                progress: 0,
                mensaje: `❌ No se pudo guardar este archivo: ${childError?.message || 'error desconocido'}`,
              });
            }
          }

          if (childJobs.length === 0) {
            await updateIngestionProgress(uploadId, {
              status: 'Fallido',
              step: 'Lote sin documentos procesables',
              progress: 0,
              mensaje: extracted.entries.length === 0
                ? '❌ El archivo comprimido está vacío o solo contiene archivos de sistema.'
                : `❌ No se pudo encolar ningún documento (${rejected} rechazado(s)).`,
            });
            return { encolados: 0, rechazados: rejected };
          }

          await ingestionQueue.addBulk(childJobs);
          await updateIngestionProgress(uploadId, {
            status: 'procesando',
            step: `Lote preparado: ${childJobs.length} documentos`,
            progress: 10,
            mensaje: `📦 ${childJobs.length} documento(s) en cola${rejected ? ` · ${rejected} rechazado(s)` : ''}${extracted.ignoredEntries ? ` · ${extracted.ignoredEntries} archivo(s) de sistema ignorado(s)` : ''}.`,
          });

          console.log(`[IngestionWorker] ✅ ${childJobs.length} hijos encolados para ${fileName}; rechazados=${rejected}`);
          return { encolados: childJobs.length, rechazados: rejected };
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

        // El job ya fue aceptado por BullMQ. No queda "procesando" hasta que
        // un worker lo tome: en lotes grandes esa diferencia evita que un
        // reconciliador confunda espera legítima con un worker caído.
        await updateIngestionProgress(uploadId, {
          status: 'waiting',
          step: 'En cola de extracción',
          progress: 20,
          mensaje: 'Archivo en cola; esperando capacidad de análisis.',
        });

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

function getStorageEndpoint(): string {
  const endpoint = (
    process.env.MINIO_INTERNAL_ENDPOINT ||
    process.env.MINIO_ENDPOINT ||
    process.env.MINIO_PUBLIC_ENDPOINT
  )?.trim();
  if (!endpoint) throw new Error('Falta MINIO_ENDPOINT (o MINIO_INTERNAL_ENDPOINT) para leer el archivo comprimido.');
  return endpoint;
}

function createStorageClient(): S3Client {
  const accessKeyId = process.env.MINIO_ACCESS_KEY;
  const secretAccessKey = process.env.MINIO_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error('Faltan credenciales de MinIO para leer el archivo comprimido.');
  }
  return new S3Client({
    region: process.env.MINIO_REGION || 'us-east-1',
    endpoint: getStorageEndpoint(),
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

async function readObjectBuffer(s3Client: S3Client, bucketName: string, key: string): Promise<Buffer> {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: key }));
  if (!response.Body) throw new Error(`MinIO devolvió el archivo comprimido sin contenido (${key}).`);

  const chunks: Buffer[] = [];
  for await (const chunk of response.Body as NodeJS.ReadableStream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  const buffer = Buffer.concat(chunks);
  if (buffer.length === 0) throw new Error('El archivo comprimido está vacío.');
  return buffer;
}

function extensionFromName(fileName: string, normalizedType?: string): string {
  const leaf = fileName.split('/').pop() || fileName;
  const ext = leaf.includes('.') ? leaf.slice(leaf.lastIndexOf('.') + 1).toLowerCase() : '';
  if (ext) return ext;
  const fallback: Record<string, string> = {
    pdf: 'pdf',
    jpeg: 'jpg',
    png: 'png',
    webp: 'webp',
    tiff: 'tiff',
    bmp: 'bmp',
    word: 'doc',
    excel: 'xls',
  };
  return fallback[normalizedType || ''] || 'bin';
}
