/**
 * src/workers/extraction.worker.ts
 *
 * Worker de extracción (Azure DI primario + Azure OpenAI para LLM).
 * Maneja clasificación, paginación y extracción de datos fiscales.
 */

import { Worker, Job } from 'bullmq';
import { redis } from '@/lib/redis';
import { extractionQueue, ExtractionJobData, ingestionQueue, dbWriterQueue, EXTRACTION_QUEUE_NAME } from '@/lib/queue';
import { updateIngestionProgress, createIngestionRecord, updateParentProgress } from '@/lib/ingestion-progress';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  PROMPT_PAGINADOR,
  PROMPT_EXTRACTOR_FACTURABLE,
  PROMPT_EXTRACTOR_NO_FACTURABLE
} from '@/services/ingestion/prompts_v2';
import { parseLlmResponse, normalizeDocumento, DocumentoExtraido } from '@/services/ingestion/normalize';
import { analyzeInvoiceDocument, isAzureDiConfigured } from '@/services/ingestion/azure-di';
import {
  azureDiLooksLikeInvoice,
  buildAzureDiContext,
  mapAzureDiInvoiceToDocumentShape,
} from '@/services/ingestion/azure-di-map';
import { resolveExtractRoute } from '@/services/ingestion/extract-route';
import { resolvePreflight } from '@/services/ingestion/pdf-preflight';
import {
  recordLlmCall,
  callTypeFromJobType,
  LlmCallType,
} from '@/services/ingestion/llm-metrics';
import {
  callAzureOpenAiChat,
  callAzureOpenAiChatWithImages,
  assertAzureOpenAiConfigured,
  parseLlmJson,
} from '@/services/ingestion/azure-openai';
import { runFiscalGuards, formatGuardFailures, isRepairableGuardFailure } from '@/services/ingestion/fiscal-guards';
import { FiscalStatus } from '@/lib/document-fiscal-status';
import { wLog } from '@/lib/worker-logger';

assertAzureOpenAiConfigured();
const EXTRACTION_CONCURRENCY = parseInt(
  process.env.EXTRACTION_CONCURRENCY || process.env.GEMINI_CONCURRENCY || '2',
  10
);
const MAX_EXTRACT_REPAIRS = parseInt(process.env.MAX_EXTRACT_REPAIRS || '1', 10);

export function startExtractionWorker() {
  const worker = new Worker<ExtractionJobData>(
    EXTRACTION_QUEUE_NAME,
    async (job: Job<ExtractionJobData>) => {
      const { type, ingestion } = job.data;
      const { uploadId, fileName, text: s3Path } = ingestion;

      wLog('ExtractionWorker', `🧠 Job ${job.id} | ${type} | ${fileName}`);

      try {
        await updateIngestionProgress(uploadId, {
          status: 'procesando',
          step: `Analizando con IA (${type})`,
          progress: 30,
          mensaje: 'Leyendo documento y ejecutando análisis predictivo...',
        });

        // 1. Descargar archivo físico desde S3
        const fileBuffer = await getFileBufferFromS3(s3Path);
        
        // 2. Procesar según tipo de tarea
        switch (type) {
          case 'classify':
            await handleClassify(job, fileBuffer);
            break;
          case 'paginate':
            await handlePaginate(job, fileBuffer);
            break;
          case 'extract-facturable':
            await handleExtractFacturable(job, fileBuffer);
            break;
          case 'extract-non-facturable':
            await handleExtractNonFacturable(job, fileBuffer);
            break;
          case 'extract-multiple-image':
            await handleExtractMultipleImage(job, fileBuffer);
            break;
          case 'extract-repair':
            await handleExtractRepair(job, fileBuffer);
            break;
          default:
            throw new Error(`Tipo de job Gemini no soportado: ${type}`);
        }

      } catch (error: any) {
        const is429 = error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED');
        
        if (is429) {
          // BACKOFF EXPONENCIAL PARA SOFT-BANS (techo 300s). Con concurrency=1 no hay ráfaga paralela.
          const consecutive = await redis.incr(CONSECUTIVE_429_KEY).catch(() => 1);
          if (consecutive === 1) await redis.expire(CONSECUTIVE_429_KEY, 3600);

          let blockSeconds = 60;
          if (consecutive === 2) blockSeconds = 120;
          else if (consecutive >= 3) blockSeconds = 300;

          wLog('ExtractionWorker', `⏳ Rate limit 429 consecutivo #${consecutive}. Bloqueando ${blockSeconds}s → ${fileName}`, 'rate');
          await redis.setex(RPM_REDIS_KEY, blockSeconds, String(RPM_LIMIT + 1)).catch(() => {});

          await recordLlmCall({
            uploadId,
            callType: callTypeFromJobType(type),
            is429: true,
          }).catch(() => {});

          await updateIngestionProgress(uploadId, {
            status: 'waiting_capacity',
            step: 'Esperando cupo de procesamiento',
            progress: 50,
            mensaje: `Pausado para optimizar rendimiento. Retomando en ${Math.ceil(blockSeconds/60)} minutos...`,
          }).catch(() => {});
          
          if (ingestion.parentUploadId) {
            await updateParentProgress(ingestion.parentUploadId).catch(() => {});
          }

          if (job.token) {
            await job.moveToDelayed(Date.now() + (blockSeconds * 1000) + 2000, job.token);
          }
          const delayErr = new Error(`Delayed due to RateLimit (Backoff ${blockSeconds}s)`);
          delayErr.name = 'DelayedError';
          throw delayErr;
        }
        
        // Determinar si es el último intento de BullMQ
        const maxAttempts = job.opts.attempts || 1;
        const isLastAttempt = (job.attemptsMade + 1) >= maxAttempts;
        
        if (isLastAttempt) {
          // Es el último intento, marcar como Fallido definitivamente
          wLog('ExtractionWorker', `❌ Error final en job ${job.id} (${fileName}) tras ${maxAttempts} intentos: ${error.message}`, 'error');
          await updateIngestionProgress(uploadId, {
            status: 'Fallido',
            step: `Error IA (${type})`,
            progress: 0,
            mensaje: `Fallo definitivo tras ${maxAttempts} intentos: ${error.message}`,
          }).catch(() => {});
        } else {
          // Aún hay intentos disponibles en BullMQ
          wLog('ExtractionWorker', `⚠️ Error en job ${job.id} (intento ${job.attemptsMade + 1}/${maxAttempts}): ${error.message}`, 'warn');
          await updateIngestionProgress(uploadId, {
            status: 'Reintentando',
            step: `Reintentando (${type})`,
            progress: 10,
            mensaje: `Fallo temporal, programado para reintento: ${error.message.substring(0, 50)}...`,
          }).catch(() => {});
        }
        
        throw error;
      }
    },
    {
      connection: redis,
      concurrency: EXTRACTION_CONCURRENCY,
      // Limitar a nivel de worker (Rate limit interno de BullMQ)
      // NOTA: defaultJobOptions no existe en WorkerOptions, va en la Queue (ver lib/queue.ts)
      limiter: {
        max: RPM_LIMIT,
        duration: 60000,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[ExtractionWorker] ✅ Job completado: ${job.id}`);
    wLog('ExtractionWorker', `✅ Job completado: ${job.id}`, 'success');
  });
  worker.on('failed', (job, err) => {
    console.error(`[ExtractionWorker] ❌ Job fallido: ${job?.id} | ${err.message}`);
    wLog('ExtractionWorker', `❌ Job fallido: ${job?.id} — ${err.message}`, 'error');
  });
  
  console.log(
    `[ExtractionWorker] 🚀 Arrancado con concurrency=${EXTRACTION_CONCURRENCY} | LLM=azure-openai | TPM=${TPM_LIMIT} | RPM=${RPM_LIMIT}`
  );
  return worker;
}

// ─── Helpers S3 / rate-limit ──────────────────────────────────────────────────

async function getFileBufferFromS3(s3Path: string): Promise<Buffer> {
  const { MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME } = process.env;
  const MINIO_ENDPOINT = process.env.MINIO_PUBLIC_ENDPOINT || process.env.MINIO_ENDPOINT || 'https://minio.allbase.com.ar';
  
  const s3Client = new S3Client({
    region: process.env.MINIO_REGION || "us-east-1",
    endpoint: MINIO_ENDPOINT,
    credentials: {
      accessKeyId: MINIO_ACCESS_KEY!,
      secretAccessKey: MINIO_SECRET_KEY!,
    },
    forcePathStyle: true,
  });

  const response = await s3Client.send(new GetObjectCommand({
    Bucket: MINIO_BUCKET_NAME!,
    Key: s3Path,
  }));

  const stream = response.Body as NodeJS.ReadableStream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ─── Token Budget Tracker (TPM proactivo) ─────────────────────────────────────
// Azure OpenAI limita por tokens/minuto (TPM), no solo por requests (RPM).
// Como el consumo es completamente dinámico (depende del documento), leemos el
// usage real de cada respuesta y lo acumulamos en Redis con TTL de 60s.
// Antes de cada llamada verificamos si hay presupuesto disponible; si no, esperamos.

const TPM_REDIS_KEY = 'openai:tpm:window';
const RPM_REDIS_KEY = 'openai:rpm:window';
const CONSECUTIVE_429_KEY = 'openai:429:consecutive';
const TPM_LIMIT = parseInt(process.env.OPENAI_TPM_LIMIT || process.env.GEMINI_TPM_LIMIT || '1000000', 10);
const RPM_LIMIT = parseInt(process.env.OPENAI_RPM_LIMIT || process.env.GEMINI_RPM_LIMIT || '120', 10);
const TPM_SAFETY_MARGIN = 0.85;
const TOKENS_PER_DOC_ESTIMATE = parseInt(
  process.env.LLM_TOKENS_PER_DOC_ESTIMATE || process.env.GEMINI_TOKENS_PER_DOC_ESTIMATE || '13000',
  10
);

/**
 * Reserva cuota de tokens/RPM en Redis ANTES de realizar la llamada HTTP al LLM.
 * Esto evita condiciones de carrera cuando hay múltiples workers en paralelo.
 */
async function waitForTokenBudget(uploadId?: string, parentUploadId?: string): Promise<void> {
  const tpmBudget = Math.floor(TPM_LIMIT * TPM_SAFETY_MARGIN);
  const estimatedTokens = TOKENS_PER_DOC_ESTIMATE || 13000;

  for (let attempt = 0; attempt < 500; attempt++) {
    try {
      const currentTpm = parseInt((await redis.get(TPM_REDIS_KEY)) || '0', 10);
      const currentRpm = parseInt((await redis.get(RPM_REDIS_KEY)) || '0', 10);

      // Verificar si la reserva preventivamente cabe dentro del presupuesto
      if (currentTpm + estimatedTokens <= tpmBudget && currentRpm + 1 <= RPM_LIMIT) {
        // Reservar en Redis INMEDIATAMENTE antes de enviar la petición
        const newTpm = await redis.incrby(TPM_REDIS_KEY, estimatedTokens);
        const tpmTtl = await redis.ttl(TPM_REDIS_KEY);
        if (tpmTtl <= 0) await redis.expire(TPM_REDIS_KEY, 61);

        const newRpm = await redis.incr(RPM_REDIS_KEY);
        const rpmTtl = await redis.ttl(RPM_REDIS_KEY);
        if (rpmTtl <= 0) await redis.expire(RPM_REDIS_KEY, 61);

        console.log(`[RateLimit] 🛡️ Pre-reserva: +${estimatedTokens} tokens | TPM: ${newTpm}/${TPM_LIMIT} | RPM: ${newRpm}/${RPM_LIMIT}`);

        if (attempt > 0 && uploadId) {
          await updateIngestionProgress(uploadId, {
            status: 'processing',
            step: 'Analizando con IA',
            progress: 60,
            mensaje: 'Cuota disponible, retomando análisis...',
          }).catch(() => {});
        }
        return;
      }

      // Si excede la cuota estimada, esperar a que expire la ventana
      let waitMs = 5000;
      let causa = '';
      if (currentRpm + 1 > RPM_LIMIT) {
        const ttl = await redis.ttl(RPM_REDIS_KEY);
        if (ttl <= 0) {
          await redis.del(RPM_REDIS_KEY);
          continue;
        }
        waitMs = Math.max(ttl * 1000, 1000);
        causa = 'RPM';
      } else {
        const ttl = await redis.ttl(TPM_REDIS_KEY);
        if (ttl <= 0) {
          await redis.del(TPM_REDIS_KEY);
          continue;
        }
        waitMs = Math.max(ttl * 1000, 1000);
        causa = 'TPM';
      }

      const waitSec = Math.ceil(waitMs / 1000);
      console.warn(
        `[RateLimit] ⏳ Límite ${causa} alcanzado (TPM actual: ${currentTpm}/${TPM_LIMIT}, RPM: ${currentRpm}/${RPM_LIMIT}). Esperando ${waitSec}s...`
      );

      if (uploadId) {
        await updateIngestionProgress(uploadId, {
          status: 'waiting_capacity',
          step: 'Esperando cupo de procesamiento',
          progress: 50,
          mensaje: `Pausado por límite de tokens (${causa}). Retomando en ${waitSec}s...`,
        }).catch(() => {});
      }
      if (parentUploadId) {
        await updateParentProgress(parentUploadId).catch(() => {});
      }

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } catch (err) {
      console.warn('[RateLimit] ⚠️ Error leyendo contadores de Redis, esperando 10s...', err);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
}

async function callLlm(
  prompt: string,
  fileBuffer: Buffer,
  mimeType: string,
  _jsonSchema?: any,
  uploadId?: string,
  parentUploadId?: string,
  callType: LlmCallType = 'other'
): Promise<any> {
  const started = Date.now();
  const estimatedTokens = TOKENS_PER_DOC_ESTIMATE || 13000;
  
  // Esperar y pre-reservar cuota en Redis
  await waitForTokenBudget(uploadId, parentUploadId);

  const azurePrompt =
    /JSON array|array sin texto|ÚNICAMENTE un JSON array/i.test(prompt)
      ? `${prompt}\n\nIMPORTANTE: envuelve el array en un objeto JSON: {"documents":[...]}`
      : prompt;

  try {
    const { text, usage } = await callAzureOpenAiChat({
      prompt: azurePrompt,
      fileBuffer,
      mimeType,
      json: true,
      maxCompletionTokens: 16384,
    });

    // Ajustar la pre-reserva de Redis con el consumo real exacto
    const actualTokens = usage?.total_tokens || estimatedTokens;
    const diff = actualTokens - estimatedTokens;
    if (diff !== 0) {
      await redis.incrby(TPM_REDIS_KEY, diff).catch(() => {});
    }

    if (uploadId) {
      await recordLlmCall({
        uploadId,
        callType,
        bytes: fileBuffer.length,
        durationMs: Date.now() - started,
      });
    }

    await redis.del(CONSECUTIVE_429_KEY).catch(() => {});

    const logChunks = Math.ceil(text.length / 4000);
    if (logChunks <= 1) {
      wLog('LLM-RAW', `📝 [${callType}] Respuesta completa (${text.length} chars):\n${text}`, 'info');
    } else {
      for (let i = 0; i < Math.min(logChunks, 2); i++) {
        wLog(
          'LLM-RAW',
          `📝 [${callType}] Parte ${i + 1}/${logChunks} (${text.length} chars total):\n${text.substring(i * 4000, (i + 1) * 4000)}`,
          'info'
        );
      }
    }
    const parsed = parseLlmJson(text);
    wLog(
      'LLM-RAW',
      `✅ [${callType}] JSON parseado OK. Tokens usados: ${usage?.total_tokens ?? '?'} (prompt: ${usage?.prompt_tokens ?? '?'}, completion: ${usage?.completion_tokens ?? '?'})`,
      'success'
    );
    return parsed;
  } catch (e: any) {
    const is429 =
      e?.status === 429 ||
      e?.statusCode === 429 ||
      e?.message?.includes('429') ||
      e?.message?.includes('rate limit');

    if (is429) {
      console.warn('[RateLimit] 🚨 429 capturado de Azure OpenAI. Bloqueando ventana en Redis por 60s...');
      await redis.set(TPM_REDIS_KEY, TPM_LIMIT.toString(), 'EX', 60).catch(() => {});
      await redis.set(RPM_REDIS_KEY, RPM_LIMIT.toString(), 'EX', 60).catch(() => {});
    }
    throw e;
  }
}

async function splitPdfWithTools(pdfUrl: string, pageStart: number, pageEnd: number, filename: string): Promise<{ buffer: Buffer; croppedUrl: string }> {
  const pdftoolsUrl = process.env.PDFTOOLS_URL || 'https://pdftools.allbase.com.ar/split';
  const apiKey = process.env.PDFTOOLS_API_KEY || 'pdf_tools_secret';
  
  console.log(`[ExtractionWorker] ✂️  Recortando PDF con pdftools (${pageStart}-${pageEnd}) para ${filename}`);
  
  const res = await fetch(pdftoolsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey
    },
    body: JSON.stringify({
      pdf_url: pdfUrl,
      page_start: pageStart,
      page_end: pageEnd,
      filename: filename
    })
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Error en pdftools (${res.status}): ${errorText}`);
  }
  
  const data = await res.json();
  // data.url es la URL pública del recorte en MinIO — esto es lo que guardamos en archivos_documento
  const croppedUrl: string = data.url;
  const urlObj = new URL(croppedUrl);
  const bucketName = process.env.MINIO_BUCKET_NAME || 'gestor-documental';
  const s3Path = urlObj.pathname.replace(new RegExp(`^/${bucketName}/`), '');
  
  console.log(`[ExtractionWorker] ✅ PDF recortado en MinIO: ${s3Path} → ${croppedUrl}`);
  
  const buffer = await getFileBufferFromS3(s3Path);
  return { buffer, croppedUrl };
}

async function convertPdfToImagesWithPdfTools(pdfUrl: string, pageStart = 1, pageEnd = 10): Promise<Buffer[]> {
  const pdftoolsUrl = (process.env.PDFTOOLS_URL || 'https://pdftools.allbase.com.ar/split').replace(/\/split$/, '/to-images');
  const apiKey = process.env.PDFTOOLS_API_KEY || 'pdf_tools_secret';

  const res = await fetch(pdftoolsUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      pdf_url: pdfUrl,
      page_start: pageStart,
      page_end: pageEnd,
      output: 'base64',
      dpi: 150,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`pdftools to-images (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const b64List: string[] = data.images || [];
  return b64List.map((b64) => Buffer.from(b64, 'base64'));
}

/** Paginador primario usando Vertex AI Service Account (GCP OAuth2 REST API, PDF directo en base64) */
async function callGeminiPdfPaginate(opts: {
  prompt: string;
  fileBuffer: Buffer;
}): Promise<any> {
  const rawCreds = process.env.VERTEX_AI_CREDENTIALS;
  if (!rawCreds) {
    throw new Error('Falta VERTEX_AI_CREDENTIALS en el entorno.');
  }

  let creds: { client_email: string; private_key: string; project_id: string };
  try {
    creds = JSON.parse(
      rawCreds.startsWith('{') ? rawCreds : Buffer.from(rawCreds, 'base64').toString('utf8')
    );
  } catch (err: any) {
    throw new Error(`Error parseando VERTEX_AI_CREDENTIALS: ${err.message}`);
  }

  // 1. Obtener Access Token vía OAuth2 con JWT firmado
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: creds.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const b64h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(b64h + '.' + b64p);
  const sig = signer.sign(creds.private_key, 'base64url');
  const jwt = b64h + '.' + b64p + '.' + sig;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const tokenErr = await tokenRes.text().catch(() => '');
    throw new Error(`OAuth2 token error (${tokenRes.status}): ${tokenErr.slice(0, 200)}`);
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // 2. Invocación a Vertex AI Generative AI endpoint
  const proj = creds.project_id || process.env.VERTEX_AI_PROJECT_ID;
  const loc =
    process.env.VERTEX_AI_LOCATION === 'global'
      ? 'us-central1'
      : process.env.VERTEX_AI_LOCATION || 'us-central1';
  const model = process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash';

  const targetUrl = `https://${loc}-aiplatform.googleapis.com/v1/projects/${proj}/locations/${loc}/publishers/google/models/${model}:generateContent`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: opts.fileBuffer.toString('base64'),
            },
          },
          { text: opts.prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Vertex AI HTTP ${res.status}: ${errText.slice(0, 250)}`);
  }

  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Vertex AI devolvió respuesta vacía');
  return parseLlmJson(text);
}

const GEMINI_TPM_LIMIT = parseInt(process.env.GEMINI_TPM_LIMIT || '50000', 10);
const GEMINI_RPM_LIMIT = parseInt(process.env.GEMINI_RPM_LIMIT || '4', 10);
const GEMINI_TPM_REDIS_KEY = 'ratelimit:gemini:tpm';
const GEMINI_RPM_REDIS_KEY = 'ratelimit:gemini:rpm';

/** Reserva cuota en Redis específicamente para Vertex AI / Gemini (GEMINI_RPM_LIMIT y GEMINI_TPM_LIMIT) */
async function waitForGeminiTokenBudget(uploadId?: string, parentUploadId?: string): Promise<void> {
  const estimatedTokens = 3000;

  for (let attempt = 0; attempt < 500; attempt++) {
    try {
      const currentTpm = parseInt((await redis.get(GEMINI_TPM_REDIS_KEY)) || '0', 10);
      const currentRpm = parseInt((await redis.get(GEMINI_RPM_REDIS_KEY)) || '0', 10);

      if (currentTpm + estimatedTokens <= GEMINI_TPM_LIMIT && currentRpm + 1 <= GEMINI_RPM_LIMIT) {
        const newTpm = await redis.incrby(GEMINI_TPM_REDIS_KEY, estimatedTokens);
        if (newTpm === estimatedTokens) await redis.expire(GEMINI_TPM_REDIS_KEY, 61);

        const newRpm = await redis.incr(GEMINI_RPM_REDIS_KEY);
        if (newRpm === 1) await redis.expire(GEMINI_RPM_REDIS_KEY, 61);

        console.log(`[VertexRateLimit] 🛡️ Pre-reserva: +${estimatedTokens} tokens | TPM: ${newTpm}/${GEMINI_TPM_LIMIT} | RPM: ${newRpm}/${GEMINI_RPM_LIMIT}`);
        return;
      }

      let waitMs = 5000;
      let causa = '';
      if (currentRpm + 1 > GEMINI_RPM_LIMIT) {
        const ttl = await redis.ttl(GEMINI_RPM_REDIS_KEY);
        waitMs = Math.max((ttl + 1) * 1000, 5000);
        causa = 'RPM';
      } else {
        const ttl = await redis.ttl(GEMINI_TPM_REDIS_KEY);
        waitMs = Math.max((ttl + 1) * 1000, 5000);
        causa = 'TPM';
      }

      const waitSec = Math.ceil(waitMs / 1000);
      console.warn(
        `[VertexRateLimit] ⏳ Límite Vertex/Gemini ${causa} alcanzado (TPM actual: ${currentTpm}/${GEMINI_TPM_LIMIT}, RPM: ${currentRpm}/${GEMINI_RPM_LIMIT}). Esperando ${waitSec}s...`
      );

      await new Promise((resolve) => setTimeout(resolve, waitMs));
    } catch (err) {
      console.warn('[VertexRateLimit] ⚠️ Error leyendo contadores Redis, esperando 5s...', err);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

// ─── Handlers por Tipo ────────────────────────────────────────────────────────

async function handleClassify(job: Job<ExtractionJobData>, _fileBuffer: Buffer) {
  // Compat: jobs `classify-*` aún en cola Redis → reencolar extract.
  const { ingestion } = job.data;
  wLog('ExtractionWorker', `↪️  classify legacy → extract-facturable (${ingestion.fileName})`);
  await extractionQueue.add(
    `extract-facturable-${ingestion.uploadId}`,
    { type: 'extract-facturable', ingestion },
    { jobId: `extract-facturable-${ingestion.uploadId}` }
  );
}

async function handlePaginate(job: Job<ExtractionJobData>, fileBuffer: Buffer) {
  const { ingestion } = job.data;
  console.log(`[ExtractionWorker] Paginando ${ingestion.fileName}...`);

  await updateIngestionProgress(ingestion.uploadId, {
    status: 'procesando',
    step: 'Paginando documento múltiple',
    progress: 40,
    mensaje: 'Identificando inicio y fin de cada documento en el PDF...',
  });

  const schema = {
    type: 'ARRAY',
    items: {
      type: 'OBJECT',
      properties: {
        numero: { type: 'STRING' },
        page_start: { type: 'INTEGER' },
        page_end: { type: 'INTEGER' },
        shared_page: { type: 'BOOLEAN' }
      }
    }
  };

  // Paginador directo: gpt-5.x en Azure AI Foundry procesa el PDF nativo via type:file
  const pagesRaw = await callLlm(
    PROMPT_PAGINADOR,
    fileBuffer,
    ingestion.mimeType,
    schema,
    ingestion.uploadId,
    undefined,
    'paginate'
  );

  const pages = Array.isArray(pagesRaw)
    ? pagesRaw
    : Array.isArray((pagesRaw as any)?.documents)
      ? (pagesRaw as any).documents
      : [];

  if (pages.length === 0) {
    wLog(
      'ExtractionWorker',
      `⚠️ Paginador devolvió array vacío para ${ingestion.fileName}. Fallback → extract-facturable como documento único.`,
      'warn'
    );
    await updateIngestionProgress(ingestion.uploadId, {
      status: 'procesando',
      step: 'Fallback: documento único',
      progress: 45,
      mensaje: 'No se detectaron múltiples documentos. Procesando como archivo único...',
    });
    await extractionQueue.add(`extract-facturable-${ingestion.uploadId}`, {
      type: 'extract-facturable',
      ingestion,
    }, { jobId: `extract-facturable-${ingestion.uploadId}` });
    return;
  }

  console.log(`[ExtractionWorker] 📑 Paginación completada: ${pages.length} documentos encontrados.`);

  // Calcular delay entre hijos de forma dinámica y segura:
  // - Máximo de documentos que entran en la ventana = floor(TPM / TOKENS_PER_DOC)
  // - Delay necesario para espaciarlos uniformemente en >60s
  // Ej: 30000 TPM / 12000 = 2 docs por minuto máximo.
  // Delay = 62000ms / 2 = 31000ms (31 segundos entre cada doc)
  const maxDocsPerMinute = Math.max(1, Math.floor(TPM_LIMIT / TOKENS_PER_DOC_ESTIMATE));
  const calculatedDelay = Math.ceil(62000 / maxDocsPerMinute); 
  const INTER_JOB_DELAY_MS = parseInt(
    process.env.EXTRACTION_INTER_JOB_DELAY_MS || process.env.GEMINI_INTER_JOB_DELAY_MS || String(calculatedDelay),
    10
  );
  console.log(`[ExtractionWorker] ⏱️ Delay entre hijos: ${INTER_JOB_DELAY_MS}ms (calculado: ${calculatedDelay}ms | tokens/doc: ${TOKENS_PER_DOC_ESTIMATE} | TPM: ${TPM_LIMIT})`);

  const childJobs = pages.map((pageData: any, idx: number) => {
    // Generar uploadId individual (hash aleatorio de 8 caracteres)
    const randomHash = crypto.randomBytes(4).toString('hex');
    const subUploadId = `${ingestion.uploadId}_doc_${randomHash}`;
    
    // Generar file_hash único de 64 caracteres
    let childFileHash = undefined;
    if (ingestion.empresaId) {
      const numeroDoc = pageData.numero || `DOC_${idx + 1}`;
      const hashData = `${subUploadId}${numeroDoc}${ingestion.empresaId}`;
      childFileHash = crypto.createHash('sha256').update(hashData).digest('hex');
    }

    return {
      name: `extract-facturable-${subUploadId}`,
      data: {
        type: 'extract-facturable',
        ingestion: {
          ...ingestion,
          uploadId: subUploadId,
          parentUploadId: ingestion.uploadId,
          documentoIndex: idx + 1,
          totalDocumentos: pages.length,
          fileHash: childFileHash
        },
        pageStart: pageData.page_start,
        pageEnd: pageData.page_end,
        numeroDocumento: pageData.numero
      },
      opts: {
        delay: idx * INTER_JOB_DELAY_MS, // escalonado: job 0 → 0ms, job 1 → 10s, job 2 → 20s...
      }
    };
  });

  console.log(`[ExtractionWorker] 📦 Creando registros DB para ${childJobs.length} hijos...`);
  // Crear el registro de base de datos (actividad) para cada hijo ANTES de encolarlos,
  // para que el polling del frontend encuentre sus IDs y puedan recalcular al padre.
  // Optimizado con Promise.all (concurrencia controlada) para no tardar 60s en 200 inserts.
  const CHUNK_SIZE = 3;
  for (let i = 0; i < childJobs.length; i += CHUNK_SIZE) {
    const chunk = childJobs.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map((job: typeof childJobs[0]) => 
      createIngestionRecord({
        uploadId: job.data.ingestion.uploadId,
        parentUploadId: job.data.ingestion.parentUploadId!,
        empresaId: BigInt(job.data.ingestion.empresaId),
        documentoNombre: `${ingestion.fileName} - Pág ${job.data.pageStart}`,
        fileHash: job.data.ingestion.fileHash,
        origen: job.data.ingestion.origen as 'dashboard' | 'correo',
      }).catch(err => {
        console.error(`[ExtractionWorker] ❌ Error creando actividad hijo ${job.data.ingestion.uploadId}:`, err);
      })
    ));
  }

  console.log(`[ExtractionWorker] 📦 Encolando ${childJobs.length} jobs con delay escalonado de ${INTER_JOB_DELAY_MS}ms...`);
  await extractionQueue.addBulk(childJobs);
}

async function handleExtractFacturable(job: Job<ExtractionJobData>, fileBuffer: Buffer) {
  const { ingestion, pageStart, pageEnd } = job.data;
  console.log(`[ExtractionWorker] Extrayendo facturable ${ingestion.fileName}...`);

  // Fase 2: raíz sin recorte → preflight local. Alta confianza multi → paginate sin extract desechable.
  if (pageStart == null && pageEnd == null) {
    const pre = resolvePreflight(fileBuffer, ingestion.mimeType);
    wLog('ExtractionWorker', `🧭 Preflight ${ingestion.fileName}: ${pre.decision} (${pre.reason})`);
    if (pre.decision === 'paginate') {
      await updateIngestionProgress(ingestion.uploadId, {
        status: 'procesando',
        step: 'Múltiples documentos (preflight)',
        progress: 40,
        mensaje: 'Alta confianza de multi-doc: paginando sin extract previo...',
      });
      await extractionQueue.add(`paginate-${ingestion.uploadId}`, {
        type: 'paginate',
        ingestion,
      });
      return;
    }
  }

  await updateIngestionProgress(ingestion.uploadId, {
    status: 'procesando',
    step: 'Extrayendo datos fiscales',
    progress: 60,
    mensaje: `Extrayendo líneas e impuestos (Doc ${ingestion.documentoIndex || 1}/${ingestion.totalDocumentos || 1})...`,
  });

  const recargo = ingestion.recargo === true ? 'true' : 'false';

  // Se unifican todos los casos al mismo prompt según requerimiento
  const basePrompt = PROMPT_EXTRACTOR_FACTURABLE;

  let prompt = basePrompt
    .replace(/\{\{CIF_EMPRESA\}\}/g, ingestion.cif || 'NO_PROPORCIONADO')
    .replace(/\{\{NOMBRE_EMPRESA\}\}/g, ingestion.nombreEmpresa || 'NO_PROPORCIONADO')
    .replace(/\{\{RECARGO_EMPRESA\}\}/g, recargo);

  let finalBuffer = fileBuffer;
  let fileUrlForDb = ingestion.publicUrl;
  
  // Las imágenes NO pueden ser recortadas con pdftools.
  // Si viene pageStart/pageEnd pero es una imagen, ignoramos el recorte y procesamos la imagen completa.
  const isImage = ingestion.mimeType?.startsWith('image/');

  if (pageStart && pageEnd && !isImage) {
    try {
      const { buffer, croppedUrl } = await splitPdfWithTools(ingestion.publicUrl, pageStart, pageEnd, `doc_${ingestion.uploadId}`);
      finalBuffer = buffer;
      fileUrlForDb = croppedUrl;
      console.log(`[ExtractionWorker] ✂️  Usando PDF recortado de ${pageStart} a ${pageEnd} → ${croppedUrl}`);
    } catch (error: any) {
      console.error(`[ExtractionWorker] ❌ Error crítico al recortar PDF con pdftools. Error: ${error.message}`);
      throw new Error(`Fallo en recorte de PDF (${pageStart}-${pageEnd}): ${error.message}`);
    }
  } else if (pageStart && pageEnd && isImage) {
    console.log(`[ExtractionWorker] 🖼️  Imagen con rango de páginas indicado — ignorando recorte (no aplica a imágenes).`);
  }

  // Primario: Azure DI (prebuilt-invoice o azure-di-hybrid). Azure OpenAI = fallback.
  const isHybrid = (process.env.EXTRACT_PRIMARY || '').toLowerCase() === 'azure-di-hybrid';
  const preferAzure =
    (process.env.EXTRACT_PRIMARY || 'azure-di').toLowerCase() !== 'llm' &&
    isAzureDiConfigured();
  const canUseAzureDi =
    preferAzure &&
    (ingestion.mimeType === 'application/pdf' ||
      Boolean(ingestion.mimeType?.startsWith('image/')) ||
      /\.pdf$/i.test(ingestion.fileName || ''));

  let rawParsed: DocumentoExtraido | Record<string, unknown>;
  let usedExtractor: 'azure-di' | 'azure-di-hybrid' | 'azure-openai' = 'azure-openai';
  let ocrText = ''; // disponible para el fallback de visión en todos los paths

  if (canUseAzureDi) {
    try {
      await updateIngestionProgress(ingestion.uploadId, {
        status: 'procesando',
        step: isHybrid ? 'Leyendo layout del documento' : 'Extrayendo datos estructurados',
        progress: 58,
        mensaje: isHybrid ? 'Ejecutando OCR avanzado...' : 'Analizando estructura del documento...',
      });
      const diResult = await analyzeInvoiceDocument(finalBuffer, ingestion.mimeType);

      if (isHybrid) {
        wLog('ExtractionWorker', `✅ Azure DI Layout OK. Enviando OCR a LLM (${ingestion.fileName})`);

        // ─── MODO HYBRID: OCR + contexto estructurado ────────────────────────────
        // AZURE_DI_HYBRID_STRUCTURED_CONTEXT=true (default) → inyecta los campos
        // estructurados de Azure DI como contexto de apoyo para el LLM.
        // Para volver al comportamiento anterior (solo OCR), pon =false en .env.
        // ─── VERSIÓN ANTERIOR (solo OCR crudo): ──────────────────────────────────
        // const promptWithOcr = `${prompt}\n\n[TEXTO OCR DEL DOCUMENTO EXTRAÍDO POR AZURE DI]:\n${diResult.content || ''}`;
        // ─────────────────────────────────────────────────────────────────────────
        const useStructuredContext = (process.env.AZURE_DI_HYBRID_STRUCTURED_CONTEXT ?? 'true') !== 'false';
        const azureDiContextBlock = useStructuredContext ? buildAzureDiContext(diResult) : '';
        ocrText = diResult.content || '';

        const promptWithOcr = azureDiContextBlock
          ? `${prompt}\n\n[TEXTO OCR DEL DOCUMENTO (fuente principal - texto completo)]:\n${ocrText}\n\n${azureDiContextBlock}`
          : `${prompt}\n\n[TEXTO OCR DEL DOCUMENTO EXTRAÍDO POR AZURE DI]:\n${ocrText}`;

        // LOG: negativos en el prompt antes de mandarlo al LLM
        const negativosEnPrompt = (promptWithOcr.match(/-\d[\d.,]*/g) || []);
        wLog('PreLLM-Negativos', `🔍 Valores negativos detectados en el prompt (${negativosEnPrompt.length} total):\n${[...new Set(negativosEnPrompt)].slice(0, 30).join('  |  ')}`, 'info');

        // LOG: OCR crudo que recibe el LLM
        wLog('AzureDI-OCR', `📄 OCR crudo (${ocrText.length} chars, ${ingestion.fileName}):\n${ocrText.substring(0, 3000)}${ocrText.length > 3000 ? `\n...[ +${ocrText.length - 3000} chars más ]` : ''}`, 'info');
        if (azureDiContextBlock) {
          wLog('AzureDI-Context', `🔢 Contexto estructurado Azure DI que va al LLM:\n${azureDiContextBlock}`, 'info');
        }


        await updateIngestionProgress(ingestion.uploadId, {
          status: 'procesando',
          step: 'Estructurando con LLM',
          progress: 68,
          mensaje: 'Analizando OCR y estructurando datos fiscales...',
        });

        const result = await callLlm(
          promptWithOcr,
          Buffer.alloc(0),
          'text/plain',
          undefined,
          ingestion.uploadId,
          ingestion.parentUploadId,
          'extract'
        );
        rawParsed = parseLlmResponse(JSON.stringify(result));
        usedExtractor = 'azure-di-hybrid';
      } else if (azureDiLooksLikeInvoice(diResult)) {
        rawParsed = mapAzureDiInvoiceToDocumentShape(diResult, { empresaCif: ingestion.cif });
        usedExtractor = 'azure-di';
        wLog(
          'ExtractionWorker',
          `✅ Azure DI OK ${ingestion.fileName} (conf=${String((rawParsed as any)._azure_di_confidence ?? '?')})`
        );
      } else {
        wLog('ExtractionWorker', `↪️  Azure DI sin factura clara → Azure OpenAI (${ingestion.fileName})`, 'warn');
        const result = await callLlm(
          prompt,
          finalBuffer,
          ingestion.mimeType,
          undefined,
          ingestion.uploadId,
          ingestion.parentUploadId,
          'extract'
        );
        rawParsed = parseLlmResponse(JSON.stringify(result));
      }
    } catch (diErr: any) {
      wLog(
        'ExtractionWorker',
        `↪️  Azure DI falló → Azure OpenAI (${ingestion.fileName}): ${diErr?.message || diErr}`,
        'warn'
      );
      const result = await callLlm(
        prompt,
        finalBuffer,
        ingestion.mimeType,
        undefined,
        ingestion.uploadId,
        ingestion.parentUploadId,
        'extract'
      );
      rawParsed = parseLlmResponse(JSON.stringify(result));
    }
  } else {
    const result = await callLlm(
      prompt,
      finalBuffer,
      ingestion.mimeType,
      undefined,
      ingestion.uploadId,
      ingestion.parentUploadId,
      'extract'
    );
    console.log(`[ExtractionWorker] ✅ Respuesta cruda de Gemini recibida para ${ingestion.fileName}`);
    rawParsed = parseLlmResponse(JSON.stringify(result));
  }

  // Si Azure DI ya vio multi-factura, no hace falta persistir el Frankenstein:
  // resolveExtractRoute → paginate (Gemini/partes). Log explícito.
  if (usedExtractor === 'azure-di' && (rawParsed as any)?.es_multiple === true) {
    wLog(
      'ExtractionWorker',
      `↪️  Azure DI detectó multi-factura → paginate (${ingestion.fileName})`,
      'warn'
    );
  }

  // Normalizar los datos
  console.log(
    `[ExtractionWorker] 🔄 Validando y normalizando JSON estructurado (extractor=${usedExtractor})...`
  );
  const rawObj =
    rawParsed && typeof rawParsed === 'object' && !Array.isArray(rawParsed)
      ? (rawParsed as Record<string, unknown>)
      : {};

  const route = resolveExtractRoute({
    raw: rawObj,
    mimeType: ingestion.mimeType,
    pageStart,
    pageEnd,
  });

  if (route === 'non-facturable') {
    wLog('ExtractionWorker', `↪️  extract → no facturable (${ingestion.fileName})`);
    await updateIngestionProgress(ingestion.uploadId, {
      status: 'procesando',
      step: 'Documento no facturable',
      progress: 45,
      mensaje: 'Reencaminando a extractor de archivo / categoría...',
    });
    await extractionQueue.add(`extract-non-${ingestion.uploadId}`, {
      type: 'extract-non-facturable',
      ingestion,
    });
    return;
  }

  if (route === 'paginate') {
    wLog('ExtractionWorker', `↪️  extract → paginate multi-PDF (${ingestion.fileName})`);
    await updateIngestionProgress(ingestion.uploadId, {
      status: 'procesando',
      step: 'Múltiples documentos detectados',
      progress: 40,
      mensaje: 'Identificando rangos de páginas para cada documento...',
    });
    await extractionQueue.add(`paginate-${ingestion.uploadId}`, {
      type: 'paginate',
      ingestion,
    });
    return;
  }

  if (route === 'multi-image') {
    wLog('ExtractionWorker', `↪️  extract → multi-image (${ingestion.fileName})`);
    await extractionQueue.add(`extract-multi-img-${ingestion.uploadId}`, {
      type: 'extract-multiple-image',
      ingestion,
    });
    return;
  }

  const normalized = normalizeDocumento(rawParsed, ingestion.cif);
  console.log(`[ExtractionWorker] ✅ Normalización completada. Ejecutando fiscal-guards...`);

  // LOG: resultado normalizado antes de los guards
  wLog('Normalize', `🗂️ Resultado normalizado (${ingestion.fileName}):\n` +
    `  tipo_doc: ${(normalized as any).tipo_documento}\n` +
    `  importe_total: ${(normalized as any).importe_total ?? (normalized as any).documento?.importe_total}\n` +
    `  importe_sin_iva: ${(normalized as any).importe_sin_iva ?? (normalized as any).documento?.importe_sin_iva}\n` +
    `  impuestos: ${JSON.stringify((normalized as any).totales_por_impuesto ?? [])}\n` +
    `  emisor_cif: ${(normalized as any).empresa_emisora?.cif} | cliente_cif: ${(normalized as any).cliente?.cif}\n` +
    `  incidencia: ${(normalized as any).incidencia} — ${(normalized as any).descripcion_incidencia ?? ''}`, 'info');

  await enqueueAfterFiscalGuards({
    job,
    ingestion: { ...ingestion, publicUrl: fileUrlForDb },
    normalized,
    pageStart,
    pageEnd,
    fileBuffer: (ingestion.mimeType === 'application/pdf' || /\.pdf$/i.test(ingestion.fileName || '')) ? finalBuffer : undefined,
    ocrText: ocrText,
  });
}

/** Tipos de incidencia que activan el fallback de visión. */
const VISION_TRIGGER_TYPES = ['datos_fiscales_ilegibles', 'total_no_localizado', 'error_cuadre', 'cif_no_encontrado', 'otros'];

/**
 * Convierte el PDF a imágenes PNG y llama al LLM con visión,
 * usando el texto OCR previo como contexto complementario.
 * Retorna DocumentoExtraido normalizado, o null si falla.
 */
async function doVisionFallback(params: {
  fileBuffer: Buffer;
  ocrText: string;
  firstResult: DocumentoExtraido;
  prompt: string;
  uploadId: string;
  parentUploadId?: string;
  empresaCif?: string;
}): Promise<DocumentoExtraido | null> {
  const { fileBuffer, ocrText, firstResult, prompt, uploadId } = params;
  try {
    wLog('VisionFallback', `🖼️  [1/5] Iniciando fallback visual\n  uploadId=${uploadId}\n  PDF size=${fileBuffer.length} bytes\n  OCR length=${ocrText.length} chars\n  Primer resultado → total=${(firstResult as any).importe_total ?? 'N/A'} | base=${(firstResult as any).importe_sin_iva ?? 'N/A'}\n  tipos_incidencia=${JSON.stringify((firstResult as any).tipos_incidencia ?? [])}`, 'info');

    // [2/5] Intentar conversión PDF → imágenes (requiere pdf-img-convert + canvas nativo)
    let imageBuffers: Buffer[] = [];
    try {
      wLog('VisionFallback', '🔄 [2/5] Intentando convertir PDF a imágenes (pdf-img-convert)...', 'info');
      // @ts-ignore
      const { convert } = await import('pdf-img-convert');
      const rawPages = await convert(new Uint8Array(fileBuffer), { width: 1200 });
      imageBuffers = rawPages.map((p: any) => Buffer.isBuffer(p) ? p : Buffer.from(p as Uint8Array));
      wLog('VisionFallback', `✅ [2/5] PDF convertido: ${imageBuffers.length} página(s) → ${imageBuffers.map((b, i) => `pág${i+1}:${b.length}b`).join(', ')}`, 'info');
    } catch (convErr: any) {
      wLog('VisionFallback', `⚠️  [2/5] pdf-img-convert no disponible (${convErr?.message ?? convErr}) → usando PDF nativo`, 'warn');
    }

    // [3/5] Construir prompt de visión con contexto OCR
    const ocrSummary = ocrText.substring(0, 6000) + (ocrText.length > 6000 ? `\n...[+${ocrText.length - 6000} chars truncados]` : '');
    const visionPrompt = `${prompt}

═══════════════════════════════════════════════════════════════════
FALLBACK DE VISIÓN — VERIFICACIÓN CON DOCUMENTO ORIGINAL
El OCR extrajo este documento pero el sistema detectó problemas de legibilidad
(tabla fiscal ambigua, total no localizado, o cuadre incorrecto).

USÁ EL DOCUMENTO adjunto para verificar y corregir la extracción.
El OCR es orientativo; si hay contradicción, prevalece lo que VES en el documento.

Lo que extrajo el OCR en el intento anterior:
- importe_total: ${(firstResult as any).importe_total ?? (firstResult as any).documento?.importe_total ?? 'no extraído'}
- importe_sin_iva: ${(firstResult as any).importe_sin_iva ?? (firstResult as any).documento?.importe_sin_iva ?? 'no extraído'}
- tipos_incidencia: ${JSON.stringify((firstResult as any).tipos_incidencia ?? [])}

[TEXTO OCR DEL DOCUMENTO (orientativo)]:
${ocrSummary}
═══════════════════════════════════════════════════════════════════`;

    wLog('VisionFallback', `📝 [3/5] Prompt de visión construido (${visionPrompt.length} chars | modo=${imageBuffers.length > 0 ? 'imágenes' : 'PDF nativo'})`, 'info');

    // [4/5] Llamar al LLM con visión
    await waitForTokenBudget(uploadId, params.parentUploadId);

    let text: string;
    let usage: any;

    if (imageBuffers.length > 0) {
      wLog('VisionFallback', `🚀 [4/5] Enviando ${imageBuffers.length} imagen(es) PNG al LLM...`, 'info');
      ({ text, usage } = await callAzureOpenAiChatWithImages({ prompt: visionPrompt, images: imageBuffers, json: true }));
    } else {
      wLog('VisionFallback', `🚀 [4/5] Enviando PDF nativo al LLM (${fileBuffer.length} bytes)...`, 'info');
      ({ text, usage } = await callAzureOpenAiChat({ prompt: visionPrompt, fileBuffer, mimeType: 'application/pdf', json: true }));
    }

    const totalTokens = usage?.total_tokens || 0;
    if (totalTokens > 0) await redis.incrby(TPM_REDIS_KEY, totalTokens).catch(() => {});
    wLog('VisionFallback', `✅ [4/5] LLM respondió | tokens=${totalTokens} (prompt=${usage?.prompt_tokens ?? '?'} + completion=${usage?.completion_tokens ?? '?'}) | chars=${text.length}\nRespuesta:\n${text.substring(0, 6000)}${text.length > 6000 ? `\n...[+${text.length - 6000} chars]` : ''}`, 'info');

    // [5/5] Parsear y normalizar resultado visual
    const rawParsed = parseLlmResponse(text);
    const visionNormalized = normalizeDocumento(rawParsed, params.empresaCif);
    wLog('VisionFallback', `🏁 [5/5] Resultado visual normalizado:\n  importe_total=${(visionNormalized as any).importe_total ?? 'N/A'}\n  importe_sin_iva=${(visionNormalized as any).importe_sin_iva ?? 'N/A'}\n  impuestos=${JSON.stringify((visionNormalized as any).totales_por_impuesto ?? [])}\n  incidencia=${(visionNormalized as any).incidencia} | tipos=${JSON.stringify((visionNormalized as any).tipos_incidencia ?? [])}`, 'info');

    return visionNormalized;
  } catch (err: any) {
    wLog('VisionFallback', `❌ Error en fallback visual: ${err?.message ?? err}`, 'error');
    return null;
  }
}




async function enqueueAfterFiscalGuards(params: {
  job: Job<ExtractionJobData>;
  ingestion: ExtractionJobData['ingestion'];
  normalized: DocumentoExtraido;
  pageStart?: number;
  pageEnd?: number;
  fileBuffer?: Buffer;
  ocrText?: string;
  visionDone?: boolean;
}) {
  const { job, ingestion, normalized, pageStart, pageEnd, fileBuffer, ocrText, visionDone } = params;
  const repairAttempt = job.data.repairAttempt || 0;
  const guard = runFiscalGuards(normalized, { empresaCif: ingestion.cif });

  // LOG: resultado de fiscal guards siempre (tanto OK como fallo)
  if (guard.ok) {
    wLog('FiscalGuard', `✅ Guards OK (${ingestion.fileName}) — extractor: ${(normalized as any)._extractor ?? 'llm'} | total: ${(normalized as any).importe_total ?? (normalized as any).documento?.importe_total} | base: ${(normalized as any).importe_sin_iva ?? (normalized as any).documento?.importe_sin_iva}`, 'success');
  } else {
    wLog('FiscalGuard', `⚠️ Guards FALLARON (${ingestion.fileName}) [intento ${repairAttempt}]:\n${guard.failures.map(f => `  [${f.code}] ${f.message}${f.details ? ' → ' + JSON.stringify(f.details) : ''}`).join('\n')}`, 'warn');
  }

  // ── Verificar si se necesita fallback de visión ──────────────────────────────
  const tiposIncidencia = ((normalized as any).tipos_incidencia as string[]) || [];
  const visionTriggeredByIncidencia = tiposIncidencia.some((t) => VISION_TRIGGER_TYPES.includes(t));
  const needsVision = !visionDone && fileBuffer && ocrText && (visionTriggeredByIncidencia || !guard.ok);

  if (needsVision) {
    wLog('VisionFallback', `🔀 Trigger visión: guard=${guard.ok ? 'OK' : 'FAIL'} | tipos=[${tiposIncidencia.join(',')}]`, 'info');
    await updateIngestionProgress(ingestion.uploadId, {
      status: 'procesando',
      step: 'Verificando con imagen del documento',
      progress: 72,
      mensaje: 'Enviando captura para aumentar fiabilidad...',
    });

    const recargo = ingestion.recargo === true ? 'true' : 'false';
    const basePrompt = PROMPT_EXTRACTOR_FACTURABLE
      .replace(/\{\{CIF_EMPRESA\}\}/g, ingestion.cif || '')
      .replace(/\{\{NOMBRE_EMPRESA\}\}/g, ingestion.nombreEmpresa || '')
      .replace(/\{\{RECARGO_EMPRESA\}\}/g, recargo);

    const visionResult = await doVisionFallback({
      fileBuffer,
      ocrText,
      firstResult: normalized,
      prompt: basePrompt,
      uploadId: ingestion.uploadId,
      parentUploadId: ingestion.parentUploadId,
      empresaCif: ingestion.cif,
    });

    if (visionResult) {
      await updateIngestionProgress(ingestion.uploadId, {
        status: 'procesando',
        step: 'Validación visual completada',
        progress: 85,
        mensaje: 'Extracción verificada con imagen. Validando...',
      });
      // Re-ejecutar guards con el resultado de visión (visionDone=true previene recursión)
      return enqueueAfterFiscalGuards({ job, ingestion, normalized: visionResult, pageStart, pageEnd, visionDone: true });
    }
    // Si el fallback visual falló, continuar con el resultado original
    wLog('VisionFallback', '⚠️  Fallback visual falló, continuando con resultado OCR original', 'warn');
  }

  if (guard.ok) {
    await dbWriterQueue.add(
      `db-writer-${ingestion.uploadId}`,
      {
        ingestion,
        aiResult: normalized,
        fiscalStatus: FiscalStatus.VALIDADO,
      },
      {
        jobId: `db-writer-${ingestion.uploadId}-v${repairAttempt}`,
        removeOnComplete: true,
        removeOnFail: 3,
      }
    );
    await updateIngestionProgress(ingestion.uploadId, {
      status: 'procesando',
      step: 'Normalizado y validado',
      progress: 80,
      mensaje: visionDone ? 'Extracción verificada con imagen. Guardando...' : 'Guards fiscales OK. Guardando en base de datos...',
    });
    return;
  }

  const failureSummary = formatGuardFailures(guard.failures);
  wLog('ExtractionWorker', `⚠️ Guards fallaron (attempt ${repairAttempt}): ${failureSummary}`, 'warn');

  const canRepair =
    repairAttempt < MAX_EXTRACT_REPAIRS && isRepairableGuardFailure(guard.failures);

  if (canRepair) {
    const nextAttempt = repairAttempt + 1;
    await updateIngestionProgress(ingestion.uploadId, {
      status: 'procesando',
      step: `Reintentando extracción (${nextAttempt}/${MAX_EXTRACT_REPAIRS})`,
      progress: 55,
      mensaje: `Corrigiendo extracción: ${failureSummary.substring(0, 120)}`,
    });

    await extractionQueue.add(
      `extract-repair-${ingestion.uploadId}-${nextAttempt}`,
      {
        type: 'extract-repair',
        ingestion,
        pageStart,
        pageEnd,
        repairAttempt: nextAttempt,
        previousFailures: guard.failures.map((f) => ({ code: f.code, message: f.message })),
        previousAiResult: normalized,
      },
      {
        jobId: `extract-repair-${ingestion.uploadId}-${nextAttempt}`,
        delay: 2000,
      }
    );
    return;
  }

  if (repairAttempt < MAX_EXTRACT_REPAIRS && !isRepairableGuardFailure(guard.failures)) {
    wLog(
      'ExtractionWorker',
      `↪️  Guards no repairables → REVISION directa (${failureSummary})`,
      'warn'
    );
  }

  // Agotados repairs o no repairable → persistir en REVISION
  await dbWriterQueue.add(
    `db-writer-${ingestion.uploadId}`,
    {
      ingestion,
      aiResult: normalized,
      fiscalStatus: FiscalStatus.REVISION,
      fiscalRevisionReasons: guard.failures.map((f) => ({ code: f.code, message: f.message })),
    },
    {
      jobId: `db-writer-${ingestion.uploadId}-revision`,
      removeOnComplete: true,
      removeOnFail: 3,
    }
  );

  await updateIngestionProgress(ingestion.uploadId, {
    status: 'procesando',
    step: 'Encolado en revisión',
    progress: 80,
    mensaje:
      repairAttempt < MAX_EXTRACT_REPAIRS && !isRepairableGuardFailure(guard.failures)
        ? `Guards no auto-reparables. Guardando en REVISIÓN.`
        : `Guards fallaron tras ${MAX_EXTRACT_REPAIRS} repairs. Guardando en REVISIÓN.`,
  });
}

async function handleExtractRepair(job: Job<ExtractionJobData>, fileBuffer: Buffer) {
  const { ingestion, previousFailures, previousAiResult, pageStart, pageEnd } = job.data;
  console.log(`[ExtractionWorker] 🔧 Repair #${job.data.repairAttempt} para ${ingestion.fileName}`);

  await updateIngestionProgress(ingestion.uploadId, {
    status: 'procesando',
    step: 'Reparando extracción',
    progress: 58,
    mensaje: 'Re-extracción dirigida por fallos de validación fiscal...',
  });

  const recargo = ingestion.recargo === true ? 'true' : 'false';
  const failureText = (previousFailures || [])
    .map((f) => `- ${f.code}: ${f.message}`)
    .join('\n');

  const basePrompt = PROMPT_EXTRACTOR_FACTURABLE
    .replace(/\{\{CIF_EMPRESA\}\}/g, ingestion.cif || 'NO_PROPORCIONADO')
    .replace(/\{\{NOMBRE_EMPRESA\}\}/g, ingestion.nombreEmpresa || 'NO_PROPORCIONADO')
    .replace(/\{\{RECARGO_EMPRESA\}\}/g, recargo);

  const repairPrompt = `${basePrompt}

═══════════════════════════════════════════════════════════════════
CORRECCIÓN OBLIGATORIA (extract-repair)
La extracción anterior falló estas validaciones duras:
${failureText || '(sin detalle)'}

JSON anterior (corregí SOLO lo necesario para pasar esas validaciones; no inventes importes):
${JSON.stringify(previousAiResult || {}, null, 2)}

Reglas de Reparación:
- Vuelve a leer el documento con MÁXIMA ATENCIÓN. Los errores detectados suelen ser errores tipográficos tuyos en la extracción anterior.
- Emisor y receptor NUNCA pueden compartir el mismo CIF. Revisa bien las identificaciones.
- NUNCA inventes números (descuentos, bases, totales) para forzar que las fórmulas matemáticas cuadren.
- Si las validaciones matemáticas fallaron, busca los valores REALES impresos en el documento y corrígelos. 
- Si los números impresos en el documento REALMENTE no cuadran, extráelos TAL CUAL están impresos, con el error matemático original de la factura.
- Devolvé un único objeto JSON completo del documento (mismo schema).
═══════════════════════════════════════════════════════════════════`;

  let finalBuffer = fileBuffer;
  let fileUrlForDb = ingestion.publicUrl;
  const isImage = ingestion.mimeType?.startsWith('image/');
  if (pageStart && pageEnd && !isImage) {
    try {
      const cropped = await splitPdfWithTools(
        ingestion.publicUrl,
        pageStart,
        pageEnd,
        `doc_repair_${ingestion.uploadId}`
      );
      finalBuffer = cropped.buffer;
      fileUrlForDb = cropped.croppedUrl;
    } catch (error: any) {
      console.warn(`[ExtractionWorker] Repair sin recorte pdftools: ${error.message}`);
    }
  }

  const result = await callLlm(
    repairPrompt,
    finalBuffer,
    ingestion.mimeType,
    undefined,
    ingestion.uploadId,
    ingestion.parentUploadId,
    'repair'
  );

  const rawParsed = parseLlmResponse(JSON.stringify(result));
  const normalized = normalizeDocumento(rawParsed, ingestion.cif);

  await enqueueAfterFiscalGuards({
    job,
    ingestion: { ...ingestion, publicUrl: fileUrlForDb },
    normalized,
    pageStart,
    pageEnd,
  });
}

async function handleExtractNonFacturable(job: Job<ExtractionJobData>, fileBuffer: Buffer) {
  const { ingestion } = job.data;
  console.log(`[ExtractionWorker] Extrayendo NO facturable ${ingestion.fileName}...`);

  await updateIngestionProgress(ingestion.uploadId, {
    status: 'procesando',
    step: 'Extrayendo metadatos no facturables',
    progress: 60,
    mensaje: 'Clasificando y archivando documento interno...',
  });

  let noFacturablePrompt = PROMPT_EXTRACTOR_NO_FACTURABLE
    .replace(/\{\{CIF_EMPRESA\}\}/g, ingestion.cif || 'NO_PROPORCIONADO')
    .replace(/\{\{NOMBRE_EMPRESA\}\}/g, ingestion.nombreEmpresa || 'NO_PROPORCIONADO')
    .replace(/\{\{RECARGO_EMPRESA\}\}/g, 'false');

  if (isAzureDiConfigured() && ingestion.mimeType === 'application/pdf') {
    try {
      const diResult = await analyzeInvoiceDocument(fileBuffer);
      if (diResult?.content) {
        noFacturablePrompt += `\n\n[TEXTO OCR DEL DOCUMENTO EXTRAÍDO POR AZURE DI]:\n${diResult.content}`;
      }
    } catch (err: any) {
      console.warn(`[ExtractionWorker] Azure DI falló en no facturable: ${err.message}`);
    }
  }

  const result = await callLlm(
    noFacturablePrompt,
    fileBuffer,
    ingestion.mimeType,
    undefined,
    ingestion.uploadId,
    undefined,
    'nf'
  );

  console.log(`[ExtractionWorker] ✅ Extracción NO facturable completada para ${ingestion.fileName}`);
  
  const rawParsed = parseLlmResponse<any>(JSON.stringify(result));
  const docs = Array.isArray(rawParsed) ? rawParsed : ((rawParsed as any).documentos || [rawParsed]);

  if (docs.length === 0) {
    await updateIngestionProgress(ingestion.uploadId, {
      status: 'failed',
      step: 'Sin datos',
      progress: 0,
      mensaje: 'El modelo no retornó datos válidos para este documento.',
    });
    return;
  }

  if (docs.length === 1) {
    const normalized = normalizeDocumento(docs[0], ingestion.cif);
    await dbWriterQueue.add(`db-writer-${ingestion.uploadId}`, {
      ingestion,
      aiResult: normalized
    }, {
      jobId: `db-writer-${ingestion.uploadId}`,
      removeOnComplete: true,
      removeOnFail: 3,
    });
    
    await updateIngestionProgress(ingestion.uploadId, {
      status: 'procesando',
      step: 'Encolado para DB',
      progress: 80,
      mensaje: 'Guardando registro de documento interno...',
    });
  } else {
    // Si Gemini extrajo múltiples documentos de un solo archivo no-facturable
    console.log(`[ExtractionWorker] 📦 Se extrajeron ${docs.length} documentos internos de ${ingestion.fileName}`);
    
    const dbJobs = docs.map((doc: any, idx: number) => {
      const randomHash = crypto.randomBytes(4).toString('hex');
      const subUploadId = `${ingestion.uploadId}_doc_${randomHash}`;
      const normalized = normalizeDocumento(doc, ingestion.cif);
      return {
        name: `db-writer-non-${subUploadId}`,
        data: {
          ingestion: {
            ...ingestion,
            uploadId: subUploadId,
            parentUploadId: ingestion.uploadId,
            documentoIndex: idx + 1,
            totalDocumentos: docs.length,
          },
          aiResult: normalized
        },
        opts: { jobId: `db-writer-non-${subUploadId}`, removeOnComplete: true, removeOnFail: 3 }
      };
    });

    // Registrar actividad hijo en BD para cada sub-documento
    const CHUNK_SIZE = 3;
    for (let i = 0; i < dbJobs.length; i += CHUNK_SIZE) {
      const chunk = dbJobs.slice(i, i + CHUNK_SIZE);
      await Promise.all(chunk.map((j: any) =>
        createIngestionRecord({
          uploadId:       j.data.ingestion.uploadId,
          parentUploadId: j.data.ingestion.parentUploadId!,
          empresaId:      BigInt(j.data.ingestion.empresaId),
          documentoNombre: `${ingestion.fileName} - Doc ${j.data.ingestion.documentoIndex}`,
          fileHash:       j.data.ingestion.fileHash,
          origen:         j.data.ingestion.origen as 'dashboard' | 'correo',
        }).catch(err => console.error(`[ExtractionWorker] ❌ Error creando actividad hijo non-facturable:`, err))
      ));
    }

    await dbWriterQueue.addBulk(dbJobs);

    await updateIngestionProgress(ingestion.uploadId, {
      status: 'procesando',
      step: 'Múltiples documentos internos encolados',
      progress: 80,
      mensaje: `Guardando ${docs.length} registros en la base de datos...`,
    });
  }
}

/**
 * Handler para imágenes con múltiples facturas.
 *
 * Estrategia:
 * 1. Primera llamada a Gemini con PROMPT_EXTRACTOR_FACTURABLE_MULTIPLE.
 * 2. Si finishReason === 'MAX_TOKENS' (output truncado), hacemos una segunda llamada
 *    pasando el contexto de los documentos ya extraídos para que continúe desde donde quedó.
 * 3. Repetimos hasta que finishReason === 'STOP' o se supere MAX_ITERATIONS.
 * 4. Mergeamos todos los resultados y creamos un job de DB writer por cada documento.
 */
async function handleExtractMultipleImage(job: Job<ExtractionJobData>, fileBuffer: Buffer) {
  const { ingestion } = job.data;
  console.log(`[ExtractionWorker] 🖼️  Extrayendo imagen múltiple ${ingestion.fileName}...`);

  await updateIngestionProgress(ingestion.uploadId, {
    status: 'procesando',
    step: 'Extrayendo facturas de imagen',
    progress: 50,
    mensaje: 'Analizando imagen con múltiples facturas...',
  });

  const recargo = ingestion.recargo === true ? 'true' : 'false';
  const basePrompt = PROMPT_EXTRACTOR_FACTURABLE
    .replace(/\{\{CIF_EMPRESA\}\}/g, ingestion.cif || '')
    .replace(/\{\{NOMBRE_EMPRESA\}\}/g, ingestion.nombreEmpresa || '')
    .replace(/\{\{RECARGO_EMPRESA\}\}/g, recargo)
    + '\n\nIMPORTANTE: ESTA IMAGEN CONTIENE MÚLTIPLES FACTURAS O TICKETS. DEBES EXTRAER CADA UNA POR SEPARADO Y DEVOLVER UN ARRAY DE OBJETOS EN LUGAR DE UN SOLO OBJETO. SIEMPRE DEVUELVE [ { ... }, { ... } ].';

  const MAX_ITERATIONS = 5;
  const allDocumentos: any[] = [];
  let iteration = 0;
  let continueExtracting = true;

  // ── Bucle de llamadas múltiples ───────────────────────────────────────────
  // En cada iteración, si Gemini termina con MAX_TOKENS, le mandamos otra
  // llamada con el contexto de lo ya extraído para que continúe.
  while (continueExtracting && iteration < MAX_ITERATIONS) {
    iteration++;
    console.log(`[ExtractionWorker] 🔄 Iteración ${iteration}/${MAX_ITERATIONS} — ${allDocumentos.length} documentos extraídos hasta ahora`);

    let prompt = basePrompt;
    if (allDocumentos.length > 0) {
      // Continuación: indicarle a Gemini qué documentos ya procesó para que no los repita
      const numerosYaExtraidos = allDocumentos
        .map((d: any) => d.numero_documento || d.numero || '(sin número)')
        .join(', ');
      prompt += `

IMPORTANTE — CONTINUACIÓN:
Ya extrajiste los siguientes documentos en llamadas anteriores: ${numerosYaExtraidos}.
Extrae ÚNICAMENTE los documentos que aún NO aparecen en esa lista. Si no quedan más documentos en la imagen, devuelve un array vacío [].`;
    }

    // Usa callLlm → Azure OpenAI
    const parsed = await callLlm(
      prompt +
        '\n\nIMPORTANTE: envuelve el resultado en JSON objeto {"documentos":[...]} si hace falta.',
      fileBuffer,
      ingestion.mimeType,
      undefined,
      ingestion.uploadId,
      ingestion.parentUploadId,
      'multi-img'
    );

    let iterDocs: any[] = [];
    if (Array.isArray(parsed)) {
      iterDocs = parsed;
    } else if (parsed && typeof parsed === 'object') {
      iterDocs = parsed.documentos || parsed.facturas || parsed.documents || [parsed];
      if (!Array.isArray(iterDocs)) iterDocs = [parsed];
    }

    console.log(
      `[ExtractionWorker] ✅ Iteración ${iteration}: ${iterDocs.length} documentos extraídos | LLM=azure-openai`
    );
    allDocumentos.push(...iterDocs);

    // Sin finishReason de Vertex: paramos si no hay docs nuevos o ya hay muchos
    if (iterDocs.length === 0 || allDocumentos.length >= 30) {
      continueExtracting = false;
    }
  }

  console.log(`[ExtractionWorker] 📊 Total documentos extraídos de imagen: ${allDocumentos.length} en ${iteration} iteración(es)`);

  if (allDocumentos.length === 0) {
    await updateIngestionProgress(ingestion.uploadId, {
      status: 'failed',
      step: 'Sin documentos extraídos',
      progress: 0,
      mensaje: 'No se pudo extraer ningún documento de la imagen.',
    });
    return;
  }

  // Crear un job de DB writer por cada documento extraído
  const dbJobs = allDocumentos.map((doc: any, idx: number) => {
    const randomHash = crypto.randomBytes(4).toString('hex');
    const subUploadId = `${ingestion.uploadId}_img_${randomHash}`;

    const rawParsed  = parseLlmResponse(JSON.stringify(doc));
    const normalized = normalizeDocumento(rawParsed, ingestion.cif);

    return {
      name: `db-writer-img-${subUploadId}`,
      data: {
        ingestion: {
          ...ingestion,
          uploadId:       subUploadId,
          parentUploadId: ingestion.uploadId,
          documentoIndex: idx + 1,
          totalDocumentos: allDocumentos.length,
        },
        aiResult: normalized
      },
      opts: { jobId: `db-writer-img-${subUploadId}`, removeOnComplete: true, removeOnFail: 3 }
    };
  });

  // Registrar actividad hijo en BD para cada sub-documento
  const CHUNK_SIZE = 10;
  for (let i = 0; i < dbJobs.length; i += CHUNK_SIZE) {
    const chunk = dbJobs.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(j =>
      createIngestionRecord({
        uploadId:       j.data.ingestion.uploadId,
        parentUploadId: j.data.ingestion.parentUploadId!,
        empresaId:      BigInt(j.data.ingestion.empresaId),
        documentoNombre: `${ingestion.fileName} - Doc ${j.data.ingestion.documentoIndex}`,
        fileHash:       j.data.ingestion.fileHash,
        origen:         j.data.ingestion.origen as 'dashboard' | 'correo',
      }).catch(err => console.error(`[ExtractionWorker] ❌ Error creando actividad hijo imagen:`, err))
    ));
  }

  await dbWriterQueue.addBulk(dbJobs);

  await updateIngestionProgress(ingestion.uploadId, {
    status: 'procesando',
    step: `${allDocumentos.length} documentos encolados para DB`,
    progress: 80,
    mensaje: `Se extrajeron ${allDocumentos.length} documentos de la imagen. Guardando...`,
  });
}
