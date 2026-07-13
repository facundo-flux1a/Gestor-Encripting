/**
 * src/workers/gemini.worker.ts
 *
 * Worker para procesamiento rate-limited con Gemini (Vertex AI).
 * Maneja clasificación, paginación y extracción de datos fiscales.
 */

import { Worker, Job } from 'bullmq';
import { redis } from '@/lib/redis';
import { geminiQueue, GeminiJobData, ingestionQueue, dbWriterQueue, GEMINI_QUEUE_NAME } from '@/lib/queue';
import { updateIngestionProgress, createIngestionRecord, updateParentProgress } from '@/lib/ingestion-progress';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { VertexAI, Part } from '@google-cloud/vertexai';
import * as crypto from 'crypto';
import {
  PROMPT_CLASIFICADOR,
  PROMPT_PAGINADOR,
  PROMPT_PAGINADOR_NO_FACTURABLE,
  PROMPT_EXTRACTOR_FACTURABLE,
  PROMPT_EXTRACTOR_NO_FACTURABLE
} from '@/services/ingestion/prompts_v2';
import { parseGeminiResponse, normalizeDocumentoFromGemini } from '@/services/ingestion/normalize';
import { wLog } from '@/lib/worker-logger';

// 15 RPM es el límite seguro para la capa gratuita de Vertex AI Gemini 2.5 Flash
const GEMINI_CONCURRENCY = parseInt(process.env.GEMINI_CONCURRENCY || '1', 10);

export function startGeminiWorker() {
  const worker = new Worker<GeminiJobData>(
    GEMINI_QUEUE_NAME,
    async (job: Job<GeminiJobData>) => {
      const { type, ingestion } = job.data;
      const { uploadId, fileName, text: s3Path } = ingestion;

      wLog('GeminiWorker', `🧠 Job ${job.id} | ${type} | ${fileName}`);

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
          default:
            throw new Error(`Tipo de job Gemini no soportado: ${type}`);
        }

      } catch (error: any) {
        const is429 = error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED');
        
        if (is429) {
          // BACKOFF EXPONENCIAL PARA SOFT-BANS
          // Si Vertex nos banea, no insistimos cada minuto porque eso puede extender el ban.
          // Incrementamos el castigo exponencialmente: 1m, 5m, 15m, 30m.
          const consecutive = await redis.incr(CONSECUTIVE_429_KEY).catch(() => 1);
          if (consecutive === 1) await redis.expire(CONSECUTIVE_429_KEY, 3600); // limpiar en 1h

          let blockSeconds = 60;
          if (consecutive === 2) blockSeconds = 300;       // 5 min
          else if (consecutive === 3) blockSeconds = 900;  // 15 min
          else if (consecutive >= 4) blockSeconds = 1800;  // 30 min

          wLog('GeminiWorker', `⏳ Rate limit 429 consecutivo #${consecutive}. Bloqueando ${blockSeconds}s → ${fileName}`, 'rate');
          await redis.setex(RPM_REDIS_KEY, blockSeconds, String(RPM_LIMIT + 1)).catch(() => {});

          await updateIngestionProgress(uploadId, {
            status: 'processing',
            step: 'Esperando cupo de API',
            progress: 50,
            mensaje: `Soft-ban detectado. Enfriando API por ${Math.ceil(blockSeconds/60)} minutos...`,
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
          wLog('GeminiWorker', `❌ Error final en job ${job.id} (${fileName}) tras ${maxAttempts} intentos: ${error.message}`, 'error');
          await updateIngestionProgress(uploadId, {
            status: 'Fallido',
            step: `Error IA (${type})`,
            progress: 0,
            mensaje: `Fallo definitivo tras ${maxAttempts} intentos: ${error.message}`,
          }).catch(() => {});
        } else {
          // Aún hay intentos disponibles en BullMQ
          wLog('GeminiWorker', `⚠️ Error en job ${job.id} (intento ${job.attemptsMade + 1}/${maxAttempts}): ${error.message}`, 'warn');
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
      concurrency: GEMINI_CONCURRENCY,
      // Limitar a nivel de worker (Rate limit interno de BullMQ)
      // NOTA: defaultJobOptions no existe en WorkerOptions, va en la Queue (ver lib/queue.ts)
      limiter: {
        max: parseInt(process.env.GEMINI_RPM_LIMIT || '6', 10),
        duration: 60000,
      },
    }
  );

  worker.on('completed', (job) => {
    console.log(`[GeminiWorker] ✅ Job completado: ${job.id}`);
    wLog('GeminiWorker', `✅ Job completado: ${job.id}`, 'success');
  });
  worker.on('failed', (job, err) => {
    console.error(`[GeminiWorker] ❌ Job fallido: ${job?.id} | ${err.message}`);
    wLog('GeminiWorker', `❌ Job fallido: ${job?.id} — ${err.message}`, 'error');
  });
  
  console.log(`[GeminiWorker] 🚀 Arrancado con concurrency=${GEMINI_CONCURRENCY}`);
  return worker;
}

// ─── Helpers Vertex AI ────────────────────────────────────────────────────────

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
// Vertex AI Express limita por tokens/minuto (TPM), no solo por requests (RPM).
// Como el consumo es completamente dinámico (depende del documento), leemos el
// usage real de cada respuesta y lo acumulamos en Redis con TTL de 60s.
// Antes de cada llamada verificamos si hay presupuesto disponible; si no, esperamos.

const TPM_REDIS_KEY = 'vertex:tpm:window';
const RPM_REDIS_KEY = 'vertex:rpm:window';
const CONSECUTIVE_429_KEY = 'vertex:429:consecutive';
const TPM_LIMIT = parseInt(process.env.GEMINI_TPM_LIMIT || '30000', 10);
const RPM_LIMIT = parseInt(process.env.GEMINI_RPM_LIMIT || '6', 10);
const TPM_SAFETY_MARGIN = 0.85; // usar solo el 85% del límite como techo proactivo
// Tokens estimados por documento (para calcular delays proactivos)
const TOKENS_PER_DOC_ESTIMATE = parseInt(process.env.GEMINI_TOKENS_PER_DOC_ESTIMATE || '12000', 10);

/**
 * Suma tokens y requests al contador de la ventana actual (60s).
 * CRÍTICO: el TTL solo se setea en la PRIMERA escritura de la ventana.
 */
async function recordTokenUsage(tokens: number): Promise<void> {
  try {
    const newTpm = await redis.incrby(TPM_REDIS_KEY, tokens);
    if (newTpm === tokens) await redis.expire(TPM_REDIS_KEY, 61);

    const newRpm = await redis.incr(RPM_REDIS_KEY);
    if (newRpm === 1) await redis.expire(RPM_REDIS_KEY, 61);

    console.log(`[RateLimit] ✅ +${tokens} tokens | TPM: ${newTpm}/${TPM_LIMIT} | RPM: ${newRpm}/${RPM_LIMIT}`);
  } catch (err) {
    console.warn('[RateLimit] ⚠️ No se pudo registrar uso:', err);
  }
}

/**
 * Espera hasta que haya suficiente presupuesto de TPM y RPM disponible.
 * Este es el escudo proactivo: frena el procesamiento ANTES de pegarle a Vertex.
 */
async function waitForTokenBudget(uploadId?: string, parentUploadId?: string): Promise<void> {
  const tpmBudget = Math.floor(TPM_LIMIT * TPM_SAFETY_MARGIN);

  for (let attempt = 0; attempt < 500; attempt++) { // Bucle largo: puede esperar horas si es necesario
    try {
      const currentTpm = parseInt(await redis.get(TPM_REDIS_KEY) || '0', 10);
      const currentRpm = parseInt(await redis.get(RPM_REDIS_KEY) || '0', 10);

      // Si ambos contadores están por debajo del límite, damos luz verde
      if (currentTpm < tpmBudget && currentRpm < RPM_LIMIT) {
        if (attempt > 0) {
          console.log(`[RateLimit] ✅ Cuota disponible (TPM: ${currentTpm}, RPM: ${currentRpm}). Reanudando...`);
          if (uploadId) {
            await updateIngestionProgress(uploadId, {
              status: 'processing',
              step: 'Analizando con IA',
              progress: 60,
              mensaje: 'Cuota disponible, retomando análisis...',
            }).catch(() => {});
          }
        }
        return; 
      }

      // Averiguar qué límite nos frenó para saber cuánto esperar
      let waitMs = 5000;
      let causa = '';
      if (currentRpm >= RPM_LIMIT) {
        waitMs = Math.max(((await redis.ttl(RPM_REDIS_KEY)) + 1) * 1000, 5000);
        causa = 'RPM';
      } else {
        waitMs = Math.max(((await redis.ttl(TPM_REDIS_KEY)) + 1) * 1000, 5000);
        causa = 'TPM';
      }

      const waitSec = Math.ceil(waitMs / 1000);
      console.warn(`[RateLimit] ⏳ Límite ${causa} alcanzado. Esperando ${waitSec}s...`);

      // Avisar en la UI
      if (uploadId) {
        await updateIngestionProgress(uploadId, {
          status: 'processing',
          step: 'Esperando cuota de IA',
          progress: 50,
          mensaje: `Pausado por límite ${causa} Vertex AI. Retomando en ${waitSec}s...`,
        }).catch(() => {});
      }
      if (parentUploadId) {
        await updateParentProgress(parentUploadId).catch(() => {});
      }

      await new Promise(resolve => setTimeout(resolve, waitMs));
    } catch (err) {
      console.warn('[RateLimit] ⚠️ Error leyendo contadores, esperando 10s por seguridad...', err);
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
}

async function callGemini(
  prompt: string,
  fileBuffer: Buffer,
  mimeType: string,
  jsonSchema?: any,
  uploadId?: string,
  parentUploadId?: string
): Promise<any> {
  const projectId = process.env.VERTEX_AI_PROJECT_ID;
  const location = process.env.VERTEX_AI_LOCATION || 'us-central1';
  const modelName = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';

  console.log(`[Gemini] 🔧 Config → project: ${projectId} | location: ${location} | model: ${modelName}`);
  console.log(`[Gemini] 📄 Archivo → mimeType: ${mimeType} | buffer: ${fileBuffer.length} bytes`);

  let credentials;
  try {
      let rawCreds = process.env.VERTEX_AI_CREDENTIALS?.trim() || '';
      if (rawCreds && !rawCreds.startsWith('{')) {
          rawCreds = rawCreds.replace(/^['"]|['"]$/g, '').trim();
      }
      credentials = rawCreds ? JSON.parse(rawCreds) : undefined;
      if (credentials) {
        console.log(`[Gemini] 🔑 Credenciales → client_email: ${credentials.client_email} | project_id: ${credentials.project_id}`);
      } else {
        console.warn(`[Gemini] ⚠️ Sin VERTEX_AI_CREDENTIALS — usando Application Default Credentials`);
      }
  } catch (e) {
      console.error(`[Gemini] ❌ Error parseando VERTEX_AI_CREDENTIALS:`, e);
      throw new Error('Error parseando VERTEX_AI_CREDENTIALS');
  }

  const vertexAI = new VertexAI({
      project: projectId!,
      location: location,
      googleAuthOptions: credentials ? { credentials } : undefined,
      // Fix para que "global" no rompa el SDK y use la URL correcta que usabas en n8n
      ...(location === 'global' ? { apiEndpoint: 'aiplatform.googleapis.com' } : {})
  });

  const generativeModel = vertexAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
          maxOutputTokens: 65536, // Máximo del modelo — necesario para lotes grandes (ej: 200 facturas)
          temperature: 0.1, // Baja temp para mayor determinismo
          responseMimeType: 'application/json',
          ...(jsonSchema && { responseSchema: jsonSchema })
      },
  });

  const filePart: Part = {
      inlineData: {
          data: fileBuffer.toString("base64"),
          mimeType
      }
  };
  const textPart: Part = { text: prompt };

  const request = {
      contents: [{ role: 'user', parts: [textPart, filePart] }],
  };

  // Verificar presupuesto de TPM antes de llamar — proactivo, evita el 429
  await waitForTokenBudget(uploadId, parentUploadId);

  console.log(`[Gemini] 🚀 Enviando request a Vertex AI...`);
  const result = await generativeModel.generateContent(request);
  
  const candidate = result.response.candidates?.[0];
  const finishReason = candidate?.finishReason;
  console.log(`[Gemini] 📬 Respuesta → finishReason: ${finishReason} | candidatos: ${result.response.candidates?.length ?? 0}`);

  // Registrar tokens reales consumidos en Redis (ventana de 60s)
  const usage = (result.response as any).usageMetadata;
  if (usage?.totalTokenCount) {
    console.log(`[Gemini] 📊 Tokens → input: ${usage.promptTokenCount ?? '?'} | output: ${usage.candidatesTokenCount ?? '?'} | total: ${usage.totalTokenCount}`);
    await recordTokenUsage(usage.totalTokenCount);
  }

  if (finishReason && finishReason !== 'STOP' && finishReason !== 'MAX_TOKENS') {
    console.error(`[Gemini] ⛔ Finish reason inesperado: ${finishReason}`);
    if (finishReason === 'SAFETY') console.error(`[Gemini] 🔞 El modelo bloqueó la respuesta por políticas de seguridad`);
    if (finishReason === 'RECITATION') console.error(`[Gemini] 📖 El modelo bloqueó por recitación de contenido protegido`);
    throw new Error(`Gemini finalizó con razón inesperada: ${finishReason}`);
  }

  // La petición fue exitosa, Google nos quitó cualquier soft-ban. Reseteamos el contador de 429s.
  await redis.del(CONSECUTIVE_429_KEY).catch(() => {});

  let text = candidate?.content?.parts?.[0]?.text || '{}';
  console.log(`[Gemini] 📝 Texto RAW (primeros 500 chars):\n${text.substring(0, 500)}`);

  if (text.includes('```')) {
      text = text.replace(/```json\n?|```/g, '').trim();
      console.log(`[Gemini] 🧹 Markdown limpiado. Resultado (primeros 300 chars):\n${text.substring(0, 300)}`);
  }

  try {
    const parsed = JSON.parse(text);
    console.log(`[Gemini] ✅ JSON parseado correctamente`);
    return parsed;
  } catch (parseErr: any) {
    console.error(`[Gemini] ❌ ERROR al parsear JSON: ${parseErr.message}`);
    console.error(`[Gemini] 📋 Texto completo que causó el error:\n${text}`);
    throw parseErr;
  }
}

async function splitPdfWithTools(pdfUrl: string, pageStart: number, pageEnd: number, filename: string): Promise<{ buffer: Buffer; croppedUrl: string }> {
  const pdftoolsUrl = process.env.PDFTOOLS_URL || 'https://pdftools.allbase.com.ar/split';
  const apiKey = process.env.PDFTOOLS_API_KEY || 'pdf_tools_secret';
  
  console.log(`[GeminiWorker] ✂️  Recortando PDF con pdftools (${pageStart}-${pageEnd}) para ${filename}`);
  
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
  
  console.log(`[GeminiWorker] ✅ PDF recortado en MinIO: ${s3Path} → ${croppedUrl}`);
  
  const buffer = await getFileBufferFromS3(s3Path);
  return { buffer, croppedUrl };
}

// ─── Handlers por Tipo ────────────────────────────────────────────────────────

async function handleClassify(job: Job<GeminiJobData>, fileBuffer: Buffer) {
  const { ingestion } = job.data;
  
  console.log(`[GeminiWorker] Clasificando ${ingestion.fileName}...`);
  const schema = {
    type: 'OBJECT',
    properties: {
      es_facturable: { type: 'BOOLEAN' },
      es_multiple: { type: 'BOOLEAN' },
      cantidad: { type: 'INTEGER' },
      categoria_documento: { type: 'STRING' }
    },
    required: ['es_facturable', 'es_multiple', 'cantidad', 'categoria_documento']
  };

  const aiResult = await callGemini(
    PROMPT_CLASIFICADOR,
    fileBuffer, 
    ingestion.mimeType,
    schema,
    ingestion.uploadId
  );
  
  console.log(`[GeminiWorker] 📊 Resultado clasificación: ${JSON.stringify(aiResult)}`);

  const esFacturable = aiResult.es_facturable !== false;
  const esMultiple   = aiResult.es_multiple === true;

  // Detectar si el archivo es una imagen (JPG, PNG, WEBP, etc.)
  const isImage = ingestion.mimeType?.startsWith('image/');

  if (!esFacturable) {
    await geminiQueue.add(`extract-non-${ingestion.uploadId}`, {
      type: 'extract-non-facturable',
      ingestion
    });
  } else if (esMultiple && isImage) {
    // Imagen con múltiples facturas: no se puede paginar como PDF.
    // Usamos el handler especial que hace múltiples llamadas a Gemini si es necesario.
    console.log(`[GeminiWorker] 🖼️  Imagen múltiple detectada → usando extract-multiple-image`);
    await geminiQueue.add(`extract-multi-img-${ingestion.uploadId}`, {
      type: 'extract-multiple-image',
      ingestion
    });
  } else if (esMultiple && !isImage) {
    // PDF/Word con múltiples documentos → paginación normal
    await geminiQueue.add(`paginate-${ingestion.uploadId}`, {
      type: 'paginate',
      ingestion
    });
  } else {
    // Documento único (PDF o imagen)
    await geminiQueue.add(`extract-facturable-${ingestion.uploadId}`, {
      type: 'extract-facturable',
      ingestion
    });
  }
}

async function handlePaginate(job: Job<GeminiJobData>, fileBuffer: Buffer) {
  const { ingestion } = job.data;
  console.log(`[GeminiWorker] Paginando ${ingestion.fileName}...`);

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

  const pages = await callGemini(
    PROMPT_PAGINADOR,
    fileBuffer,
    ingestion.mimeType,
    schema,
    ingestion.uploadId
  );

  console.log(`[GeminiWorker] 📑 Paginación completada: ${pages.length} documentos encontrados.`);

  // Calcular delay entre hijos de forma dinámica y segura:
  // - Máximo de documentos que entran en la ventana = floor(TPM / TOKENS_PER_DOC)
  // - Delay necesario para espaciarlos uniformemente en >60s
  // Ej: 30000 TPM / 12000 = 2 docs por minuto máximo.
  // Delay = 62000ms / 2 = 31000ms (31 segundos entre cada doc)
  const maxDocsPerMinute = Math.max(1, Math.floor(TPM_LIMIT / TOKENS_PER_DOC_ESTIMATE));
  const calculatedDelay = Math.ceil(62000 / maxDocsPerMinute); 
  const INTER_JOB_DELAY_MS = parseInt(
    process.env.GEMINI_INTER_JOB_DELAY_MS || String(calculatedDelay),
    10
  );
  console.log(`[GeminiWorker] ⏱️ Delay entre hijos: ${INTER_JOB_DELAY_MS}ms (calculado: ${calculatedDelay}ms | tokens/doc: ${TOKENS_PER_DOC_ESTIMATE} | TPM: ${TPM_LIMIT})`);

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

  console.log(`[GeminiWorker] 📦 Creando registros DB para ${childJobs.length} hijos...`);
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
        console.error(`[GeminiWorker] ❌ Error creando actividad hijo ${job.data.ingestion.uploadId}:`, err);
      })
    ));
  }

  console.log(`[GeminiWorker] 📦 Encolando ${childJobs.length} jobs con delay escalonado de ${INTER_JOB_DELAY_MS}ms...`);
  await geminiQueue.addBulk(childJobs);
}

async function handleExtractFacturable(job: Job<GeminiJobData>, fileBuffer: Buffer) {
  const { ingestion, pageStart, pageEnd } = job.data;
  console.log(`[GeminiWorker] Extrayendo facturable ${ingestion.fileName}...`);

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
    .replace(/\{\{CIF_EMPRESA\}\}/g, ingestion.cif || '')
    .replace(/\{\{NOMBRE_EMPRESA\}\}/g, ingestion.nombreEmpresa || '')
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
      console.log(`[GeminiWorker] ✂️  Usando PDF recortado de ${pageStart} a ${pageEnd} → ${croppedUrl}`);
    } catch (error: any) {
      console.error(`[GeminiWorker] ❌ Error crítico al recortar PDF con pdftools. Error: ${error.message}`);
      throw new Error(`Fallo en recorte de PDF (${pageStart}-${pageEnd}): ${error.message}`);
    }
  } else if (pageStart && pageEnd && isImage) {
    console.log(`[GeminiWorker] 🖼️  Imagen con rango de páginas indicado — ignorando recorte (no aplica a imágenes).`);
  }

  const result = await callGemini(
    prompt,
    finalBuffer,
    ingestion.mimeType,
    undefined,
    ingestion.uploadId,
    ingestion.parentUploadId  // para propagar pausa de cuota al padre también
  );

  console.log(`[GeminiWorker] ✅ Respuesta cruda de Gemini recibida para ${ingestion.fileName}`);
  
  // Normalizar los datos
  console.log(`[GeminiWorker] 🔄 Validando y normalizando JSON estructurado...`);
  const rawParsed = parseGeminiResponse(JSON.stringify(result));
  const normalized = normalizeDocumentoFromGemini(rawParsed);
  console.log(`[GeminiWorker] ✅ Validación matemática completada exitosamente.`);
  
  await dbWriterQueue.add(`db-writer-${ingestion.uploadId}`, {
    // Pasar la URL del recorte como publicUrl para que el DbWriter la guarde en archivos_documento
    ingestion: { ...ingestion, publicUrl: fileUrlForDb },
    aiResult: normalized
  }, {
    jobId: `db-writer-${ingestion.uploadId}`,
    removeOnComplete: true,   // No dejar jobs completados acumulados en Redis
    removeOnFail: 3,          // Conservar los últimos 3 fallidos para debug, luego eliminar
  });
  
  await updateIngestionProgress(ingestion.uploadId, {
    status: 'procesando',
    step: 'Normalizado y encolado para DB',
    progress: 80,
    mensaje: 'Validación matemática completada. Guardando en base de datos...',
  });
}

async function handleExtractNonFacturable(job: Job<GeminiJobData>, fileBuffer: Buffer) {
  const { ingestion } = job.data;
  console.log(`[GeminiWorker] Extrayendo NO facturable ${ingestion.fileName}...`);

  await updateIngestionProgress(ingestion.uploadId, {
    status: 'procesando',
    step: 'Extrayendo metadatos no facturables',
    progress: 60,
    mensaje: 'Clasificando y archivando documento interno...',
  });

  const noFacturablePrompt = PROMPT_EXTRACTOR_NO_FACTURABLE
    .replace(/\{\{CIF_EMPRESA\}\}/g, ingestion.cif || '')
    .replace(/\{\{NOMBRE_EMPRESA\}\}/g, ingestion.nombreEmpresa || '')
    .replace(/\{\{RECARGO_EMPRESA\}\}/g, 'false');

  const result = await callGemini(
    noFacturablePrompt,
    fileBuffer,
    ingestion.mimeType,
    undefined,
    ingestion.uploadId
  );

  console.log(`[GeminiWorker] ✅ Extracción NO facturable completada para ${ingestion.fileName}`);
  
  const rawParsed = parseGeminiResponse<any>(JSON.stringify(result));
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
    const normalized = normalizeDocumentoFromGemini(docs[0]);
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
    console.log(`[GeminiWorker] 📦 Se extrajeron ${docs.length} documentos internos de ${ingestion.fileName}`);
    
    const dbJobs = docs.map((doc: any, idx: number) => {
      const randomHash = crypto.randomBytes(4).toString('hex');
      const subUploadId = `${ingestion.uploadId}_doc_${randomHash}`;
      const normalized = normalizeDocumentoFromGemini(doc);
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
        }).catch(err => console.error(`[GeminiWorker] ❌ Error creando actividad hijo non-facturable:`, err))
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
async function handleExtractMultipleImage(job: Job<GeminiJobData>, fileBuffer: Buffer) {
  const { ingestion } = job.data;
  console.log(`[GeminiWorker] 🖼️  Extrayendo imagen múltiple ${ingestion.fileName}...`);

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
    console.log(`[GeminiWorker] 🔄 Iteración ${iteration}/${MAX_ITERATIONS} — ${allDocumentos.length} documentos extraídos hasta ahora`);

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

    // Acceder a finishReason directamente desde la respuesta raw
    const projectId   = process.env.VERTEX_AI_PROJECT_ID;
    const location    = process.env.VERTEX_AI_LOCATION || 'us-central1';
    const modelName   = process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash';

    let credentials;
    try {
      let rawCreds = process.env.VERTEX_AI_CREDENTIALS?.trim() || '';
      if (rawCreds && !rawCreds.startsWith('{')) rawCreds = rawCreds.replace(/^['"]/,'').replace(/['"]$/,'').trim();
      credentials = rawCreds ? JSON.parse(rawCreds) : undefined;
    } catch (e) {
      throw new Error('Error parseando VERTEX_AI_CREDENTIALS');
    }

    const { VertexAI: VtxAI } = await import('@google-cloud/vertexai');

    const vertexAI = new VtxAI({
      project: projectId!,
      location,
      googleAuthOptions: credentials ? { credentials } : undefined,
      ...(location === 'global' ? { apiEndpoint: 'aiplatform.googleapis.com' } : {})
    });
    const model = vertexAI.getGenerativeModel({
      model: modelName,
      generationConfig: { maxOutputTokens: 65536, temperature: 0.1, responseMimeType: 'application/json' }
    });

    await waitForTokenBudget(ingestion.uploadId, ingestion.parentUploadId);

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [
        { text: prompt } as any,
        { inlineData: { data: fileBuffer.toString('base64'), mimeType: ingestion.mimeType } } as any
      ]}]
    });

    const candidate    = result.response.candidates?.[0];
    const finishReason = candidate?.finishReason;
    const usage        = (result.response as any).usageMetadata;
    if (usage?.totalTokenCount) await recordTokenUsage(usage.totalTokenCount);
    await redis.del(CONSECUTIVE_429_KEY).catch(() => {});

    let rawText = candidate?.content?.parts?.[0]?.text || '[]';
    if (rawText.includes('```')) rawText = rawText.replace(/```json\n?|```/g, '').trim();

    let iterDocs: any[] = [];
    try {
      const parsed = JSON.parse(rawText);
      iterDocs = Array.isArray(parsed) ? parsed : (parsed.documentos || parsed.facturas || [parsed]);
    } catch (e) {
      console.error(`[GeminiWorker] ❌ Error parseando JSON en iteración ${iteration}:`, e);
    }

    console.log(`[GeminiWorker] ✅ Iteración ${iteration}: ${iterDocs.length} documentos extraídos | finishReason: ${finishReason}`);
    allDocumentos.push(...iterDocs);

    // Si terminó normalmente, o si no extrajo nada nuevo, paramos
    if (finishReason === 'STOP' || iterDocs.length === 0) {
      continueExtracting = false;
    } else if (finishReason !== 'MAX_TOKENS') {
      continueExtracting = false;
    }
    // Si finishReason === 'MAX_TOKENS' → continúa el bucle
  }

  console.log(`[GeminiWorker] 📊 Total documentos extraídos de imagen: ${allDocumentos.length} en ${iteration} iteración(es)`);

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

    const rawParsed  = parseGeminiResponse(JSON.stringify(doc));
    const normalized = normalizeDocumentoFromGemini(rawParsed);

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
      }).catch(err => console.error(`[GeminiWorker] ❌ Error creando actividad hijo imagen:`, err))
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
