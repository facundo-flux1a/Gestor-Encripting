'use server';

import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import crypto from 'crypto';
import connection, { dbName } from '@/lib/db';
import { prisma } from '@/lib/prisma';
import JSZip from 'jszip';

import { ingestionQueue, IngestionJobData } from '@/lib/queue';

const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  url: z.string().optional(),
  isDuplicate: z.boolean().optional(),
  fileHash: z.string().optional(),
  duplicateInfo: z.object({
    fileName: z.string(),
    uploadedAt: z.string(),
    empresaId: z.string(),
  }).optional(),
});

// ─── Helpers de nombre y tipo ──────────────────────────────────────────────────

/**
 * Normaliza el nombre del archivo: reemplaza espacios por guiones.
 * Garantiza URLs limpias sin codificación %20.
 */
function normalizeFileName(fileName: string): string {
  return fileName.replace(/ /g, '-');
}

/**
 * Normaliza el tipo de archivo basándose en el MIME type y la extensión.
 */
function getNormalizedFileType(mimeType: string, extension?: string): string {
  const mime = mimeType.toLowerCase();
  const ext = extension?.toLowerCase() || '';

  if (mime === 'application/zip' || mime === 'application/x-zip-compressed' || mime === 'multipart/x-zip' || ext === 'zip') return 'zip';
  if (mime === 'application/x-rar-compressed' || mime === 'application/vnd.rar' || mime === 'application/x-rar' || ext === 'rar') return 'rar';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime === 'image/jpeg' || mime === 'image/jpg' || ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (mime === 'image/png' || ext === 'png') return 'png';
  if (mime === 'image/webp' || ext === 'webp') return 'webp';
  if (mime === 'image/tiff' || ext === 'tif' || ext === 'tiff') return 'tiff';
  if (mime === 'image/bmp' || ext === 'bmp') return 'bmp';
  if (mime === 'application/msword' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'doc' || ext === 'docx') return 'word';
  if (mime === 'application/vnd.ms-excel' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === 'xls' || ext === 'xlsx') return 'excel';

  return ext || 'unknown';
}

function getMimeTypeFromFileName(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
    tif: 'image/tiff',
    tiff: 'image/tiff',
    bmp: 'image/bmp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  return map[ext] || 'application/octet-stream';
}

function resolveFileMimeType(mimeType: string | null | undefined, fileName: string): string {
  const mime = (mimeType || '').split(';')[0].trim().toLowerCase();
  return !mime || mime === 'application/octet-stream' ? getMimeTypeFromFileName(fileName) : mime;
}

function maxUploadBytes(): number {
  const configuredMb = Number.parseInt(process.env.MAX_UPLOAD_MB || process.env.NEXT_PUBLIC_MAX_UPLOAD_MB || '', 10);
  const megabytes = Number.isFinite(configuredMb) && configuredMb > 0 ? configuredMb : 100;
  return megabytes * 1024 * 1024;
}

// ─── Hash y duplicados ─────────────────────────────────────────────────────────

async function calculateFileHash(fileBuffer: ArrayBuffer): Promise<string> {
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from(fileBuffer));
  return hash.digest('hex');
}

export type DuplicateFileRecord = {
  file_hash: string;
  file_name: string;
  uploaded_at: Date | string;
};

async function checkDuplicate(fileHash: string, empresaId: string): Promise<DuplicateFileRecord | null> {
  try {
    const [rows] = await connection.query(
      `SELECT file_hash, numero_documento as file_name, fecha_creacion as uploaded_at 
       FROM documentos 
       WHERE file_hash = ? AND id_de_empresa = ?
       ORDER BY fecha_creacion DESC
       LIMIT 1`,
      [fileHash, empresaId]
    );
    const results = rows as DuplicateFileRecord[];
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error(`[checkDuplicate] Error al verificar hash (empresa ${empresaId}):`, error);
    return null;
  }
}

/**
 * Consulta duplicados por hash en bloques. La expansión de un ZIP/RAR usa esta
 * función para que un hijo repetido sea rechazado de forma visible, sin frenar
 * todas las demás facturas del lote.
 */
export async function findDuplicateFilesByHash(
  fileHashes: string[],
  empresaId: string
): Promise<Map<string, DuplicateFileRecord>> {
  const uniqueHashes = [...new Set(fileHashes.filter(Boolean))];
  const found = new Map<string, DuplicateFileRecord>();
  const chunkSize = 500;

  try {
    for (let start = 0; start < uniqueHashes.length; start += chunkSize) {
      const chunk = uniqueHashes.slice(start, start + chunkSize);
      const placeholders = chunk.map(() => '?').join(', ');
      const [rows] = await connection.query(
        `SELECT file_hash, file_name, uploaded_at
         FROM (
           SELECT file_hash, numero_documento as file_name, fecha_creacion as uploaded_at
           FROM documentos
           WHERE id_de_empresa = ? AND file_hash IN (${placeholders})

           UNION ALL

           SELECT file_hash, documento_nombre as file_name, created_at as uploaded_at
           FROM ${dbName}.actividad
           WHERE id_de_empresa = ?
             AND file_hash IN (${placeholders})
             AND COALESCE(status, '') NOT IN ('Fallido', 'failed', 'Duplicado')
         ) AS hashes_en_uso`,
        [empresaId, ...chunk, empresaId, ...chunk]
      );
      for (const row of rows as DuplicateFileRecord[]) {
        if (row.file_hash) found.set(row.file_hash, row);
      }
    }
  } catch (error) {
    // La escritura conserva su propia barrera de integridad; no volvemos
    // invisible un lote entero porque esta comprobación preventiva falle.
    console.error(`[findDuplicateFilesByHash] Error verificando empresa ${empresaId}:`, error);
  }

  return found;
}

// ─── Extracción ZIP/RAR con subida individual a MinIO ─────────────────────────

/**
 * Descomprime un ZIP, calcula el hash de cada hijo, lo sube individualmente
 * a MinIO y retorna toda la info necesaria para encolar cada hijo.
 * Replica el comportamiento que tenía n8n: descomprimir → subir hijo → usar URL del hijo.
 */
export async function extractAndUploadZipChildren(
  fileBuffer: ArrayBuffer,
  parentUploadId: string,
  s3Client: S3Client,
  bucketName: string,
  minioEndpoint: string
): Promise<{
  fileHashes: Record<string, string>;
  uploadIds: Record<string, string>;
  filePaths: Record<string, string>;
  publicUrls: Record<string, string>;
}> {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(Buffer.from(fileBuffer));

  const fileHashes: Record<string, string> = {};
  const uploadIds: Record<string, string> = {};
  const filePaths: Record<string, string> = {};
  const publicUrls: Record<string, string> = {};

  for (const [originalFileName, zipEntry] of Object.entries(zipContent.files)) {
    if (zipEntry.dir) continue;

    const normalizedFileName = normalizeFileName(originalFileName);
    const fileData = await zipEntry.async('nodebuffer');

    // Hash SHA-256
    const hash = crypto.createHash('sha256').update(fileData).digest('hex');
    fileHashes[normalizedFileName] = hash;

    // Upload ID único para este hijo
    const childUploadId = `${parentUploadId}_file_${crypto.randomBytes(4).toString('hex')}`;
    uploadIds[normalizedFileName] = childUploadId;

    // Subir el hijo individualmente a MinIO
    const ext = normalizedFileName.includes('.') ? normalizedFileName.substring(normalizedFileName.lastIndexOf('.')) : '';
    const baseName = normalizedFileName.includes('.') ? normalizedFileName.substring(0, normalizedFileName.lastIndexOf('.')) : normalizedFileName;
    const childPath = `archivos/zip-children/${parentUploadId}/${baseName}${ext}`;
    const childMimeType = getMimeTypeFromFileName(normalizedFileName);

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: childPath,
      Body: fileData,
      ContentType: childMimeType,
      ACL: 'public-read',
    }));

    const childPublicUrl = `${minioEndpoint.replace(/\/$/, '')}/${bucketName}/${childPath}`;
    filePaths[normalizedFileName] = childPath;
    publicUrls[normalizedFileName] = childPublicUrl;

    console.log(`  [ZIP] "${normalizedFileName}" → subido: ${childPath}`);
  }

  return { fileHashes, uploadIds, filePaths, publicUrls };
}

/**
 * Descomprime un RAR usando unrar-js (local, sin microservicio externo),
 * calcula el hash de cada hijo, lo sube individualmente a MinIO
 * y retorna toda la info necesaria para encolar cada hijo.
 */
export async function extractAndUploadRarChildren(
  fileBuffer: ArrayBuffer,
  parentUploadId: string,
  s3Client: S3Client,
  bucketName: string,
  minioEndpoint: string
): Promise<{
  fileHashes: Record<string, string>;
  uploadIds: Record<string, string>;
  filePaths: Record<string, string>;
  publicUrls: Record<string, string>;
}> {
  const buffer = Buffer.from(fileBuffer);
  
  // Usar node-unrar-js dinámicamente para evitar errores de Turbopack
  const unrar = await import('node-unrar-js');
  const extractor = await unrar.createExtractorFromData({ 
    data: new Uint8Array(buffer) as unknown as ArrayBuffer 
  });

  const extracted = extractor.extract();

  const fileHashes: Record<string, string> = {};
  const uploadIds: Record<string, string> = {};
  const filePaths: Record<string, string> = {};
  const publicUrls: Record<string, string> = {};

  for (const file of extracted.files) {
    if (!file.extraction || file.fileHeader.flags.directory) continue;

    const originalFileName = file.fileHeader.name;
    const normalizedFileName = normalizeFileName(originalFileName);
    const fileData = Buffer.from(file.extraction);

    // Hash SHA-256
    const hash = crypto.createHash('sha256').update(fileData).digest('hex');
    fileHashes[normalizedFileName] = hash;

    // Upload ID único para este hijo
    const childUploadId = `${parentUploadId}_file_${crypto.randomBytes(4).toString('hex')}`;
    uploadIds[normalizedFileName] = childUploadId;

    // Subir el hijo individualmente a MinIO
    const ext = normalizedFileName.includes('.') ? normalizedFileName.substring(normalizedFileName.lastIndexOf('.')) : '';
    const baseName = normalizedFileName.includes('.') ? normalizedFileName.substring(0, normalizedFileName.lastIndexOf('.')) : normalizedFileName;
    const childPath = `archivos/rar-children/${parentUploadId}/${baseName}${ext}`;
    const childMimeType = getMimeTypeFromFileName(normalizedFileName);

    await s3Client.send(new PutObjectCommand({
      Bucket: bucketName,
      Key: childPath,
      Body: fileData,
      ContentType: childMimeType,
      ACL: 'public-read',
    }));

    const childPublicUrl = `${minioEndpoint.replace(/\/$/, '')}/${bucketName}/${childPath}`;
    filePaths[normalizedFileName] = childPath;
    publicUrls[normalizedFileName] = childPublicUrl;

    console.log(`  [RAR] "${normalizedFileName}" → subido: ${childPath}`);
  }

  return { fileHashes, uploadIds, filePaths, publicUrls };
}

// ─── Actividad y errores ───────────────────────────────────────────────────────

async function activityExists(uploadId: string): Promise<boolean> {
  const [rows] = await connection.query(
    `SELECT id FROM ${dbName}.actividad WHERE upload_id = ? LIMIT 1`,
    [uploadId]
  ) as any;
  return Array.isArray(rows) && rows.length > 0;
}

/**
 * Crea fila de actividad si no existe. Si ya existe (lote pre-registrado), no re-INSERT.
 */
async function createActivityRecord(
  uploadId: string,
  empresaId: string,
  fileName: string,
  fileType: string,
  parentUploadId?: string,
  batchId?: string | null,
  opts?: { status?: string; step?: string; mensaje?: string }
): Promise<void> {
  try {
    if (await activityExists(uploadId)) {
      console.log(`[${fileName}] ℹ️ Actividad ya existía (uploadId: ${uploadId}) — skip INSERT`);
      if (opts?.status || opts?.step || opts?.mensaje) {
        await connection.query(
          `UPDATE ${dbName}.actividad
           SET status = COALESCE(?, status),
               step = COALESCE(?, step),
               mensaje = COALESCE(?, mensaje),
               documento_tipo = COALESCE(?, documento_tipo),
               updated_at = NOW()
           WHERE upload_id = ?`,
          [
            opts?.status ?? null,
            opts?.step ?? null,
            opts?.mensaje ?? null,
            fileType || null,
            uploadId,
          ]
        );
      }
      return;
    }

    await connection.query(
      `INSERT INTO ${dbName}.actividad 
        (upload_id, parent_upload_id, batch_id, id_de_empresa, documento_nombre, documento_tipo, status, step, progress, mensaje)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uploadId,
        parentUploadId || null,
        batchId || null,
        empresaId,
        fileName,
        fileType,
        opts?.status ?? 'iniciando',
        opts?.step ?? 'Iniciando el flujo',
        0,
        opts?.mensaje ?? 'Archivo recibido, preparando para procesamiento',
      ]
    );
    console.log(`[${fileName}] ✅ Registro de actividad creado (uploadId: ${uploadId}${parentUploadId ? `, parent: ${parentUploadId}` : ''}${batchId ? `, batch: ${batchId}` : ''})`);
  } catch (error) {
    console.error(`[${fileName}] ❌ Error al crear registro de actividad:`, error);
  }
}

export type BatchFileInput = {
  fileName: string;
  size?: number;
  mimeType?: string;
};

export type BatchItemResult = {
  uploadId: string;
  fileName: string;
};

/**
 * Reserva uploadIds + batchId SIN crear filas de actividad.
 * La actividad se crea en /api/uploads/file cuando ya llegaron los bytes (MinIO).
 * Así un refresh no deja fantasmas "Esperando bytes".
 */
export async function createActivityBatch(
  empresaId: string,
  files: BatchFileInput[]
): Promise<{ batchId: string; items: BatchItemResult[] }> {
  if (!empresaId) throw new Error('empresaId requerido');
  if (!files?.length) throw new Error('Se requiere al menos un archivo');

  // Limpiar fantasmas viejos (queued sin archivo) de lotes anteriores
  const { invalidateQueuedGhostsForEmpresa } = await import('@/services/actividad-reconcile');
  const invalidated = await invalidateQueuedGhostsForEmpresa(empresaId);
  if (invalidated > 0) {
    console.log(`🧹 [createActivityBatch] Invalidated ${invalidated} queued-without-file rows`);
  }

  const batchId = `batch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const items: BatchItemResult[] = [];

  for (const file of files) {
    const fileName = (file.fileName || '').trim();
    if (!fileName) continue;

    const uploadId = `upload_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
    items.push({ uploadId, fileName: normalizeFileName(fileName) });
    // Pequeño jitter para no colisionar timestamps en el mismo ms
    await new Promise((r) => setTimeout(r, 1));
  }

  if (items.length === 0) throw new Error('Ningún nombre de archivo válido');

  console.log(
    `📦 [createActivityBatch] batch=${batchId} items=${items.length} empresa=${empresaId} (sin INSERT actividad)`
  );
  return { batchId, items };
}

async function markUploadAsFailed(
  uploadId: string,
  errorMessage: string,
  errorNode?: string
): Promise<void> {
  try {
    console.log(`❌ [Upload] Marcando como fallido: ${uploadId}`);
    await connection.query(
      `UPDATE ${dbName}.actividad 
       SET status = 'Fallido', step = ?, progress = 0, mensaje = ?, updated_at = NOW()
       WHERE upload_id = ?`,
      [errorNode || 'Error', errorMessage, uploadId]
    );

    const [childRows] = await connection.query(
      `SELECT upload_id FROM ${dbName}.actividad WHERE parent_upload_id = ?`,
      [uploadId]
    ) as any;

    if (childRows.length > 0) {
      await connection.query(
        `UPDATE ${dbName}.actividad 
         SET status = 'Fallido', step = 'Error en archivo padre', progress = 0,
             mensaje = 'El archivo comprimido padre falló', updated_at = NOW()
         WHERE parent_upload_id = ?`,
        [uploadId]
      );
    }
  } catch (error) {
    console.error(`❌ [Upload] Error al marcar como fallido:`, error);
  }
}

async function notifyFrontendError(
  uploadId: string,
  errorMessage: string,
  errorNode?: string
): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:9002';
    await fetch(`${baseUrl}/api/upload-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId,
        status: 'Fallido',
        step: errorNode || 'Error',
        progress: 0,
        message: errorMessage,
      }),
    });
  } catch (error) {
    console.error(`❌ [Upload] Error en notifyFrontendError:`, error);
  }
}

// ─── Upload desde Dashboard ────────────────────────────────────────────────────

/**
 * Gestiona la subida de un documento a S3 con validación de duplicados.
 * Soporta PDF, imágenes (JPG/PNG), ZIP y RAR.
 * Los ZIP/RAR se guardan como padre y el worker los expande desde MinIO con
 * credenciales internas; así el request HTTP nunca pierde hijos por timeout.
 */
export async function uploadDocument(
  formData: FormData
): Promise<z.infer<typeof UploadResponseSchema>> {
  const file = formData.get('file') as File | null;
  const empresaId = formData.get('empresaId') as string | null;
  const uploadId = formData.get('uploadId') as string | null;
  const batchIdRaw = formData.get('batchId') as string | null;
  const batchId = batchIdRaw?.trim() || null;

  console.log('📤 [UploadService] Recibido archivo:', file?.name);
  console.log('📤 [UploadService] EmpresaId:', empresaId);
  console.log('📤 [UploadService] UploadId:', uploadId);
  console.log('📤 [UploadService] BatchId:', batchId);

  if (!file)      throw new Error('No se ha proporcionado ningún archivo.');
  if (!empresaId) throw new Error('No se ha proporcionado el ID de empresa.');
  if (!uploadId)  throw new Error('No se ha proporcionado el Upload ID.');

  if (file.size > maxUploadBytes()) {
    throw new Error(`El archivo supera el límite de ${Math.round(maxUploadBytes() / 1024 / 1024)} MB.`);
  }

  const originalFileName  = file.name;
  const normalizedFileName = normalizeFileName(originalFileName);

  if (normalizedFileName !== originalFileName) {
    console.log(`📤 [UploadService] Nombre normalizado: "${originalFileName}" → "${normalizedFileName}"`);
  }

  const fileSize          = file.size;
  const fileMimeType      = resolveFileMimeType(file.type, normalizedFileName);
  const fileExtension     = normalizedFileName.toLowerCase().split('.').pop() || '';
  const normalizedFileType = getNormalizedFileType(fileMimeType, fileExtension);


  console.log(`📤 [UploadService] MIME Type: ${fileMimeType}, Extensión: ${fileExtension}, Tipo: ${normalizedFileType}`);

  const { MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME } = process.env;
  // Las operaciones S3 usan la red interna; la URL pública solo se guarda para
  // previsualización. Así una ACL/CDN pública no corta la ingesta en workers.
  const MINIO_ENDPOINT = process.env.MINIO_INTERNAL_ENDPOINT || process.env.MINIO_ENDPOINT || process.env.MINIO_PUBLIC_ENDPOINT || 'https://minio.allbase.com.ar';
  const MINIO_PUBLIC_URL = process.env.MINIO_PUBLIC_ENDPOINT || MINIO_ENDPOINT;

  if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY || !MINIO_BUCKET_NAME) {
    console.error('Missing environment variables for upload service.');
    throw new Error('Configuración del servidor incompleta. Contacte al administrador.');
  }

  try {
    console.log(`[${normalizedFileName}] Leyendo archivo (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);
    const fileBuffer = await file.arrayBuffer();

    const mainFileHash = await calculateFileHash(fileBuffer);
    console.log(`[${normalizedFileName}] Hash: ${mainFileHash}`);

    const empresaPrisma = await prisma.empresas.findUnique({
      where: { id: BigInt(empresaId) },
      select: { CIF: true, recargo: true, nombre_de_empresa: true },
    });
    if (!empresaPrisma) throw new Error(`No se encontró la empresa con ID: ${empresaId}`);

    const cif         = empresaPrisma.CIF || '';
    const recargo     = !!empresaPrisma.recargo;
    const nombreEmpresa = empresaPrisma.nombre_de_empresa || '';
    console.log(`[${normalizedFileName}] Empresa: ${nombreEmpresa}, CIF: ${cif}, Recargo: ${recargo}`);

    let isCompressedFile = false;

    // Crear el cliente S3 una sola vez (reutilizado para el padre y los hijos)
    const now = new Date();
    const timestamp = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}_${now.getSeconds().toString().padStart(2, '0')}`;
    const s3Client = new S3Client({
      region: process.env.MINIO_REGION || 'us-east-1',
      endpoint: MINIO_ENDPOINT,
      credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
      forcePathStyle: true,
    });

    // ── ZIP / RAR: Crear actividad de inmediato y dejar la extracción al worker ──
    if (normalizedFileType === 'zip' || normalizedFileType === 'rar') {
      isCompressedFile = true;
      console.log(`[${normalizedFileName}] 📦 Archivo comprimido (${normalizedFileType.toUpperCase()}) — la extracción se hará en background por el worker.`);
      await createActivityRecord(uploadId, empresaId, normalizedFileName, normalizedFileType, undefined, batchId, {
        status: 'iniciando',
        step: 'Iniciando el flujo',
        mensaje: 'Archivo recibido, preparando para procesamiento',
      });

    // ── PDF / Imagen / Otros: Verificar duplicados antes de encolar ───────────
    } else {
      console.log(`[${normalizedFileName}] Verificando duplicados...`);
      const duplicateRecord = await checkDuplicate(mainFileHash, empresaId);
      if (duplicateRecord) {
        console.warn(`❌ DUPLICADO DETECTADO: ${normalizedFileName}`);
        await createActivityRecord(uploadId, empresaId, normalizedFileName, normalizedFileType, undefined, batchId, {
          status: 'iniciando',
          step: 'Verificación de duplicados',
          mensaje: 'Comprobando hash de archivo',
        });
        await markUploadAsFailed(
          uploadId,
          `❌ Este archivo ya fue subido anteriormente a esta empresa el ${new Date(duplicateRecord.uploaded_at).toLocaleString('es-AR')}`,
          'Duplicado detectado'
        );
        await notifyFrontendError(
          uploadId,
          `❌ Archivo duplicado (subido el ${new Date(duplicateRecord.uploaded_at).toLocaleString('es-AR')})`,
          'Duplicado detectado'
        );
        return {
          success: false,
          isDuplicate: true,
          message: `❌ Este archivo ya fue subido anteriormente a esta empresa.`,
          fileHash: mainFileHash,
          duplicateInfo: {
            fileName: duplicateRecord.file_name,
            uploadedAt: new Date(duplicateRecord.uploaded_at).toLocaleString('es-AR'),
            empresaId,
          },
        };
      }
      console.log(`[${normalizedFileName}] ✓ No hay duplicados`);
      await createActivityRecord(uploadId, empresaId, normalizedFileName, normalizedFileType, undefined, batchId, {
        status: 'iniciando',
        step: 'Iniciando el flujo',
        mensaje: 'Archivo recibido, preparando para procesamiento',
      });
    }

    // ── Subir archivo padre a MinIO ───────────────────────────────────────────
    const fileNameWithoutExt = normalizedFileName.includes('.')
      ? normalizedFileName.substring(0, normalizedFileName.lastIndexOf('.'))
      : normalizedFileName;
    const fileExt = normalizedFileName.includes('.')
      ? normalizedFileName.substring(normalizedFileName.lastIndexOf('.'))
      : '';

    const uniqueFileName = `${fileNameWithoutExt}_${timestamp}${fileExt}`;
    // uploadId es reservado por archivo: evita que dos facturas con el mismo
    // nombre recibidas en el mismo segundo se sobrescriban en MinIO.
    const filePath = `archivos/${empresaId}/${uploadId}/${uniqueFileName}`;

    console.log(`[${normalizedFileName}] Subiendo a MinIO: ${filePath}`);
    await s3Client.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: filePath,
      Body: Buffer.from(fileBuffer),
      ContentType: fileMimeType,
      ACL: 'public-read',
    }));

    const publicUrl = `${MINIO_PUBLIC_URL.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${filePath}`;
    console.log(`[${normalizedFileName}] ✅ Subida completada → ${publicUrl}`);

    // Guardar datos de reintento
    try {
      await connection.query(
        `UPDATE ${dbName}.actividad SET file_path = ?, file_hash = ?, cif = ? WHERE upload_id = ?`,
        [filePath, mainFileHash, cif || null, uploadId]
      );
    } catch (updateErr) {
      console.warn(`[${normalizedFileName}] ⚠️ No se pudieron guardar datos de reintento:`, updateErr);
    }

    // ── Armar y encolar job en BullMQ ─────────────────────────────────────────
    const jobData: IngestionJobData = {
      text: filePath,
      empresaId,
      cif,
      nombreEmpresa,
      recargo,
      fileHash: mainFileHash,
      uploadId,
      parentUploadId: uploadId,
      fileName: normalizedFileName,
      originalFileName,
      fileSize,
      publicUrl,
      isCompressedFile,
      mimeType: fileMimeType,
      normalizedFileType,
      fileExtension,
      fechaSubida: now.toISOString(),
      origen: 'dashboard',
    };

    if (isCompressedFile) {
      console.log(`[${normalizedFileName}] 📦 Comprimido — el worker extraerá los hijos desde MinIO.`);
    }

    console.log(`[${normalizedFileName}] 📡 Encolando en BullMQ...`);
    try {
      await ingestionQueue.add(`ingest-${uploadId}`, jobData, { jobId: `ingest-${uploadId}` });
      console.log(`✅ [${normalizedFileName}] Job encolado exitosamente.`);
    } catch (queueError: any) {
      console.error(`❌ [${normalizedFileName}] Error al encolar:`, queueError.message);
      const msg = '❌ Ocurrió un error inesperado al procesar el archivo. Por favor, inténtalo nuevamente en unos minutos.';
      await markUploadAsFailed(uploadId, msg, 'Procesamiento del archivo');
      await notifyFrontendError(uploadId, msg, 'Procesamiento del archivo');
      throw new Error(msg);
    }

    try {
      const { logAuditAction } = await import('./audit-service');
      const { getCurrentUser } = await import('./user-service');
      const user = await getCurrentUser();
      await logAuditAction({
        empresaId: parseInt(empresaId, 10),
        accion: 'SUBIDA',
        usuarioEmail: user?.email || 'API/Desconocido',
        userId: user?.id,
        detalle: { fileName: normalizedFileName, fileHash: mainFileHash, uploadId },
      });
    } catch (auditErr) {
      console.warn('⚠️ Error registrando auditoría SUBIDA:', auditErr);
    }

    return {
      success: true,
      isDuplicate: false,
      message: `✅ Archivo "${normalizedFileName}" subido exitosamente. Analizando...`,
      url: publicUrl,
      fileHash: mainFileHash,
    };

  } catch (error: any) {
    console.error(`❌ [${normalizedFileName}] Error general:`, error.message);
    const msg = '❌ Ocurrió un error inesperado al procesar el archivo. Por favor, inténtalo nuevamente en unos minutos.';
    if (uploadId) {
      await markUploadAsFailed(uploadId, msg, 'Procesamiento del archivo');
      await notifyFrontendError(uploadId, msg, 'Procesamiento del archivo');
    }
    throw new Error(msg);
  }
}

// ─── Upload desde API externa ──────────────────────────────────────────────────

/**
 * Función exclusiva para la API externa (n8n / webhook).
 * Es asíncrona y no interfiere con la UI.
 */
export async function uploadDocumentFromApi(
  fileUrl: string,
  empresaId: string,
  uploadId: string,
  apiKeyName?: string,
  apiUsuarioId?: number
): Promise<void> {
  const MICROSERVICE_WEBHOOK_URL = process.env.MICROSERVICE_WEBHOOK_URL;
  const { MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME } = process.env;
  const MINIO_ENDPOINT = process.env.MINIO_INTERNAL_ENDPOINT || process.env.MINIO_ENDPOINT || process.env.MINIO_PUBLIC_ENDPOINT || 'https://minio.allbase.com.ar';
  const MINIO_PUBLIC_URL = process.env.MINIO_PUBLIC_ENDPOINT || MINIO_ENDPOINT;

  if (!MICROSERVICE_WEBHOOK_URL || !MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY || !MINIO_BUCKET_NAME) {
    console.error('❌ [UploadAPI] Configuración incompleta.');
    await markUploadAsFailed(uploadId, 'Configuración del servidor incompleta.', 'Validación inicial');
    return;
  }

  let normalizedFileName = `api_upload_${Date.now()}.pdf`;
  let fileBuffer: ArrayBuffer;
  let fileMimeType = 'application/pdf';

  try {
    console.log(`📡 [UploadAPI] Descargando desde: ${fileUrl}`);
    const response = await fetch(fileUrl);
    if (!response.ok) throw new Error(`Error HTTP al descargar: ${response.status}`);

    fileBuffer = await response.arrayBuffer();

    const contentDisposition = response.headers.get('content-disposition');
    if (contentDisposition && contentDisposition.includes('filename=')) {
      let extracted = contentDisposition.split('filename=')[1];
      if (extracted.includes(';')) extracted = extracted.split(';')[0];
      normalizedFileName = normalizeFileName(extracted.replace(/["']/g, ''));
    } else {
      const urlObj = new URL(fileUrl);
      const parts = urlObj.pathname.split('/');
      const lastPart = parts[parts.length - 1];
      if (lastPart && lastPart.includes('.')) {
        normalizedFileName = normalizeFileName(decodeURIComponent(lastPart));
      }
    }

    fileMimeType = response.headers.get('content-type') || 'application/pdf';
  } catch (err: any) {
    console.error(`❌ [UploadAPI] Error al descargar:`, err.message);
    await markUploadAsFailed(uploadId, 'No se pudo descargar el archivo desde la URL proporcionada.', 'Descarga de archivo');
    return;
  }

  fileMimeType = resolveFileMimeType(fileMimeType, normalizedFileName);
  const fileSize          = fileBuffer.byteLength;
  const fileExtension     = normalizedFileName.toLowerCase().split('.').pop() || '';
  const normalizedFileType = getNormalizedFileType(fileMimeType, fileExtension);

  if (fileSize > maxUploadBytes()) {
    await markUploadAsFailed(
      uploadId,
      `El archivo supera el límite de ${Math.round(maxUploadBytes() / 1024 / 1024)} MB.`,
      'Validación de tamaño'
    );
    return;
  }


  try {
    const mainFileHash = await calculateFileHash(fileBuffer);

    const empresaPrisma = await prisma.empresas.findUnique({
      where: { id: BigInt(empresaId) },
      select: { CIF: true, recargo: true, nombre_de_empresa: true },
    });
    if (!empresaPrisma) throw new Error(`Empresa no encontrada: ${empresaId}`);

    const cif         = empresaPrisma.CIF || '';
    const recargo     = !!empresaPrisma.recargo;
    const nombreEmpresa = empresaPrisma.nombre_de_empresa || '';

    const duplicateRecord = await checkDuplicate(mainFileHash, empresaId);
    if (duplicateRecord) {
      console.warn(`❌ [UploadAPI] DUPLICADO: ${normalizedFileName}`);
      await createActivityRecord(uploadId, empresaId, normalizedFileName, normalizedFileType);
      await markUploadAsFailed(
        uploadId,
        `❌ Este archivo ya fue subido anteriormente a esta empresa el ${new Date(duplicateRecord.uploaded_at).toLocaleString('es-AR')}`,
        'Verificación de duplicados'
      );
      return;
    }

    await createActivityRecord(uploadId, empresaId, normalizedFileName, normalizedFileType);

    const now = new Date();
    const timestamp = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}_${now.getSeconds().toString().padStart(2, '0')}`;

    const fileNameWithoutExt = normalizedFileName.includes('.') ? normalizedFileName.substring(0, normalizedFileName.lastIndexOf('.')) : normalizedFileName;
    const fileExt = normalizedFileName.includes('.') ? normalizedFileName.substring(normalizedFileName.lastIndexOf('.')) : '';
    const uniqueFileName = `${fileNameWithoutExt}_${timestamp}${fileExt}`;
    // La API externa también puede recibir cargas concurrentes con el mismo
    // filename; aislar por empresa/uploadId mantiene el objeto inmutable.
    const filePath = `archivos/${empresaId}/${uploadId}/${uniqueFileName}`;

    const s3Client = new S3Client({
      region: process.env.MINIO_REGION || 'us-east-1',
      endpoint: MINIO_ENDPOINT,
      credentials: { accessKeyId: MINIO_ACCESS_KEY, secretAccessKey: MINIO_SECRET_KEY },
      forcePathStyle: true,
    });

    await s3Client.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: filePath,
      Body: Buffer.from(fileBuffer),
      ContentType: fileMimeType,
      ACL: 'public-read',
    }));

    const publicUrl = `${MINIO_PUBLIC_URL.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${filePath}`;

    await connection.query(
      `UPDATE ${dbName}.actividad SET file_path = ?, file_hash = ?, cif = ? WHERE upload_id = ?`,
      [filePath, mainFileHash, cif || null, uploadId]
    );

    const jobData: IngestionJobData = {
      text: filePath,
      empresaId,
      cif,
      nombreEmpresa,
      recargo,
      fileHash: mainFileHash,
      uploadId,
      parentUploadId: uploadId,
      fileName: normalizedFileName,
      originalFileName: normalizedFileName,
      fileSize,
      publicUrl,
      isCompressedFile: normalizedFileType === 'zip' || normalizedFileType === 'rar',
      mimeType: fileMimeType,
      normalizedFileType,
      fileExtension,
      fechaSubida: now.toISOString(),
      origen: 'correo',
    };

    console.log(`📡 [UploadAPI] Encolando ${normalizedFileName}...`);
    ingestionQueue.add(`ingest-${uploadId}`, jobData, { jobId: `ingest-${uploadId}` }).catch((err) => {
      console.error(`❌ [UploadAPI] Error al encolar ${normalizedFileName}:`, err);
    });
  } catch (error: any) {
    console.error(`❌ [UploadAPI] Error general procesando ${normalizedFileName}:`, error.message);
    await markUploadAsFailed(uploadId, 'Error interno procesando archivo desde API', 'Procesamiento general');
  }
}
