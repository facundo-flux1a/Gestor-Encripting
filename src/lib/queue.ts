/**
 * src/lib/queue.ts
 * Definición de las colas BullMQ para el sistema de ingesta.
 * Usa la misma conexión ioredis que ya existe en redis.ts.
 */
import { Queue, QueueEvents } from 'bullmq';
import { redis } from './redis';

const connection = redis;

// ─── Cola principal de ingesta ────────────────────────────────────────────────
// Recibe cada archivo individual (PDF, imagen, archivo extraído de ZIP/RAR)
// y lo enruta al worker correcto según el tipo.
// Usamos un prefijo para que si compartimos Redis entre producción y desarrollo
// no se choquen los jobs.
const queuePrefix = process.env.NODE_ENV === 'production' ? '{prod}' : '{dev}';

export const INGESTION_QUEUE_NAME = `${queuePrefix}-ingestion`;
export const GEMINI_QUEUE_NAME = `${queuePrefix}-gemini-extraction`;
export const DB_WRITER_QUEUE_NAME = `${queuePrefix}-db-writer`;

export const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

// ─── Cola de extracción con Gemini (rate-limited) ─────────────────────────────
// Todos los llamados a Gemini pasan por acá para respetar el rate limit.
// La concurrencia se controla con GEMINI_CONCURRENCY (env var).
// Default conservador: 10 jobs simultáneos → ajustar según cuota real.
export const geminiQueue = new Queue(GEMINI_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 }, // 10s → 20s → 40s → 80s → 160s
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

// ─── Queue Events (para monitoreo y logging) ──────────────────────────────────
export const ingestionQueueEvents = new QueueEvents(INGESTION_QUEUE_NAME, { connection });
export const geminiQueueEvents = new QueueEvents(GEMINI_QUEUE_NAME, { connection });
export const dbWriterQueueEvents = new QueueEvents(DB_WRITER_QUEUE_NAME, { connection });

// ─── Tipos de jobs de ingesta ─────────────────────────────────────────────────
// Espeja exactamente el payload que upload-service.ts enviaba al webhook de n8n.
// Así el corte es un simple swap del fetch() por un queue.add().
export interface IngestionJobData {
  // ── Identificadores ──────────────────────────────────────────
  uploadId: string;          // ID de ESTE archivo (hijo si viene de ZIP/RAR)
  parentUploadId: string;    // ID del lote padre (igual a uploadId si es archivo único)

  // ── Empresa ──────────────────────────────────────────────────
  empresaId: string;
  cif: string;
  nombreEmpresa: string;
  recargo: boolean;

  // ── Archivo ──────────────────────────────────────────────────
  text: string;              // S3 path (ej: "archivos/factura_2026.pdf") — igual que n8n
  fileName: string;          // Nombre normalizado (sin espacios)
  originalFileName: string;
  fileHash: string;          // SHA256 del archivo completo
  publicUrl: string;         // URL pública en MinIO
  mimeType: string;
  normalizedFileType: 'pdf' | 'zip' | 'rar' | 'jpeg' | 'png' | 'word' | 'excel' | string;
  fileExtension: string;
  fileSize: number;
  isCompressedFile: boolean;
  fechaSubida: string;       // ISO string

  // ── Hijos de ZIP/RAR (solo si isCompressedFile === true) ──────
  individualFileHashes?: Record<string, string>;   // fileName → hash
  individualUploadIds?: Record<string, string>;    // fileName → childUploadId
  individualFilePaths?: Record<string, string>;    // fileName → S3 path del hijo ya subido a MinIO
  individualPublicUrls?: Record<string, string>;   // fileName → URL pública del hijo en MinIO

  // ── Origen ──────────────────────────────────────────────────
  origen: 'dashboard' | 'correo';

  // ── Para documentos múltiples (llenado por el worker, no upload-service) ──
  documentoIndex?: number;    // 1-based: qué doc dentro del PDF múltiple
  totalDocumentos?: number;   // total de docs en el PDF múltiple
  pageStart?: number;         // página inicial de este doc en el PDF
  pageEnd?: number;           // página final de este doc en el PDF
}

// ─── Tipos de jobs de Gemini ──────────────────────────────────────────────────
// El worker de ingesta pone estos jobs en geminiQueue después de clasificar.
export type GeminiJobType =
  | 'classify'                // Analista4/Analista33 — ¿facturable? ¿múltiple?
  | 'paginate'                // Analista25/Analista30 — rangos de páginas por doc
  | 'extract-facturable'      // Analista/Analista8 — extractor completo
  | 'extract-non-facturable'  // Analista32 — extractor no facturable
  | 'extract-multiple-image'; // Imagen con múltiples facturas (sin paginación PDF)

export interface GeminiJobData {
  type: GeminiJobType;

  // Contexto completo heredado del job de ingesta
  ingestion: IngestionJobData;

  // Para extract-facturable de un PDF múltiple ya paginado
  pageStart?: number;
  pageEnd?: number;
  documentoIndex?: number;
  totalDocumentos?: number;
  numeroDocumento?: string;  // número extraído por el paginador
}

// ─── Tipos de jobs del DB Writer ──────────────────────────────────────────────
export interface DbWriterJobData {
  ingestion: IngestionJobData;
  aiResult: any; // El JSON final normalizado (DocumentoGemini)
}

// ─── Cola de escritura en BD (Db Writer) ──────────────────────────────────────
export const dbWriterQueue = new Queue(DB_WRITER_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});
