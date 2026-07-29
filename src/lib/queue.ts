/**
 * src/lib/queue.ts
 * Definición de las colas BullMQ para el sistema de ingesta.
 * Usa la misma conexión ioredis que ya existe en redis.ts.
 */
import { Queue, QueueEvents } from 'bullmq';
import { redis } from './redis';

const connection = redis;

// Prefijo hash-tag para Redis Cluster / separar prod vs dev
const queuePrefix = process.env.NODE_ENV === 'production' ? '{prod}' : '{dev}';

export const INGESTION_QUEUE_NAME = `${queuePrefix}-ingestion`;
/** Nombre nuevo. Jobs viejos en `-gemini-extraction` hay que drenar/obliterar al migrar. */
export const EXTRACTION_QUEUE_NAME = `${queuePrefix}-extraction`;
/** @deprecated alias durante migración — misma cola que EXTRACTION si ya migraste Redis */
export const GEMINI_QUEUE_NAME = EXTRACTION_QUEUE_NAME;
export const DB_WRITER_QUEUE_NAME = `${queuePrefix}-db-writer`;
export const NOTIFICATION_QUEUE_NAME = `${queuePrefix}-notification`;

export const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

// ─── Cola de extracción (Azure DI + Azure OpenAI, rate-limited) ───────────────
export const extractionQueue = new Queue(EXTRACTION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

/** @deprecated usar extractionQueue */
export const geminiQueue = extractionQueue;

export const ingestionQueueEvents = new QueueEvents(INGESTION_QUEUE_NAME, { connection });
export const extractionQueueEvents = new QueueEvents(EXTRACTION_QUEUE_NAME, { connection });
/** @deprecated */
export const geminiQueueEvents = extractionQueueEvents;
export const dbWriterQueueEvents = new QueueEvents(DB_WRITER_QUEUE_NAME, { connection });
export const notificationQueueEvents = new QueueEvents(NOTIFICATION_QUEUE_NAME, { connection });

// ─── Cola de Notificaciones (Resumen de Ingesta) ──────────────────────────────
export const notificationQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { count: 200 },
    removeOnFail: { count: 500 },
  },
});

export interface IngestionJobData {
  uploadId: string;
  parentUploadId: string;
  empresaId: string;
  cif: string;
  nombreEmpresa: string;
  recargo: boolean;
  text: string;
  fileName: string;
  originalFileName: string;
  fileHash: string;
  publicUrl: string;
  mimeType: string;
  normalizedFileType: 'pdf' | 'zip' | 'rar' | 'jpeg' | 'png' | 'word' | 'excel' | string;
  fileExtension: string;
  fileSize: number;
  isCompressedFile: boolean;
  fechaSubida: string;
  individualFileHashes?: Record<string, string>;
  individualUploadIds?: Record<string, string>;
  individualFilePaths?: Record<string, string>;
  individualPublicUrls?: Record<string, string>;
  origen: 'dashboard' | 'correo';
  documentoIndex?: number;
  totalDocumentos?: number;
  pageStart?: number;
  pageEnd?: number;
}

export type ExtractionJobType =
  | 'classify'
  | 'paginate'
  | 'extract-facturable'
  | 'extract-non-facturable'
  | 'extract-multiple-image'
  | 'extract-repair';

/** @deprecated */
export type GeminiJobType = ExtractionJobType;

export interface ExtractionJobData {
  type: ExtractionJobType;
  ingestion: IngestionJobData;
  pageStart?: number;
  pageEnd?: number;
  documentoIndex?: number;
  totalDocumentos?: number;
  numeroDocumento?: string;
  repairAttempt?: number;
  previousFailures?: Array<{ code: string; message: string }>;
  previousAiResult?: unknown;
}

/** @deprecated */
export type GeminiJobData = ExtractionJobData;

export interface DbWriterJobData {
  ingestion: IngestionJobData;
  aiResult: any;
  fiscalStatus?: 'VALIDADO' | 'REVISION';
  fiscalRevisionReasons?: Array<{ code: string; message: string }>;
}

export const dbWriterQueue = new Queue(DB_WRITER_QUEUE_NAME, {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { count: 500 },
    removeOnFail: { count: 1000 },
  },
});

// ─── Tipos de jobs de Notificación ───────────────────────────────────────────
export interface NotificationJobData {
  parentUploadId: string;    // ID del lote principal
  uploadIds: string[];       // Array de IDs de todos los archivos válidos subidos
  emailFrom: string;         // Correo del remitente
  empresaId: string;
  nombreEmpresa: string;
  batchTimestamp: string;    // Fecha de recepción del correo
  earlyRejectedFiles?: Array<{ filename: string; reason: string }>; // Archivos que fallaron inmediatamente
}
