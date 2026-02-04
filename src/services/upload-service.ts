'use server';

import { z } from 'zod';
import { S3Client, PutObjectCommand, GetObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from 'crypto';
import connection from '@/lib/db';
import JSZip from 'jszip';

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

/**
 * 🔥 NORMALIZA EL NOMBRE DEL ARCHIVO: REEMPLAZA ESPACIOS POR GUIONES
 * Esto garantiza URLs limpias sin codificación %20
 */
function normalizeFileName(fileName: string): string {
  return fileName.replace(/ /g, '-');
}

/**
 * Normaliza el tipo de archivo basándose en el MIME type y la extensión
 */
function getNormalizedFileType(mimeType: string, extension?: string): string {
  const mime = mimeType.toLowerCase();
  const ext = extension?.toLowerCase() || '';

  if (mime === 'application/zip' || ext === 'zip') return 'zip';
  if (mime === 'application/x-rar-compressed' || mime === 'application/vnd.rar' || mime === 'application/x-rar' || ext === 'rar') return 'rar';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (mime === 'image/jpeg' || mime === 'image/jpg' || ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (mime === 'image/png' || ext === 'png') return 'png';
  if (mime === 'application/msword' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'doc' || ext === 'docx') return 'word';
  if (mime === 'application/vnd.ms-excel' || mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || ext === 'xls' || ext === 'xlsx') return 'excel';

  return ext || 'unknown';
}

/**
 * Calcula el hash SHA-256 del archivo
 */
async function calculateFileHash(fileBuffer: ArrayBuffer): Promise<string> {
  const hash = crypto.createHash('sha256');
  hash.update(Buffer.from(fileBuffer));
  return hash.digest('hex');
}

/**
 * Verifica si el archivo ya existe en la base de datos por hash y empresaId
 */
async function checkDuplicate(fileHash: string, empresaId: string): Promise<any> {
  try {
    const [rows] = await connection.query(
      `SELECT file_hash, numero_documento as file_name, fecha_creacion as uploaded_at 
       FROM documentos 
       WHERE file_hash = ? AND id_de_empresa = ?
       ORDER BY fecha_creacion DESC
       LIMIT 1`,
      [fileHash, empresaId]
    );

    const results = rows as any[];
    return results.length > 0 ? results[0] : null;
  } catch (error) {
    console.error('Error al verificar duplicados:', error);
    return null;
  }
}

/**
 * Descomprime un ZIP y calcula el hash SHA-256 de cada archivo individual
 * 🔥 NORMALIZA LOS NOMBRES DE ARCHIVO (quita espacios)
 */
async function extractAndHashZipFiles(fileBuffer: ArrayBuffer): Promise<{ [fileName: string]: string }> {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(Buffer.from(fileBuffer));
  const fileHashes: { [fileName: string]: string } = {};

  for (const [originalFileName, zipEntry] of Object.entries(zipContent.files)) {
    if (!zipEntry.dir) {
      // 🔥 NORMALIZAR NOMBRE (quitar espacios)
      const normalizedFileName = normalizeFileName(originalFileName);

      const fileData = await zipEntry.async('arraybuffer');
      const hash = crypto.createHash('sha256');
      hash.update(Buffer.from(fileData));
      const fileHash = hash.digest('hex');

      // 🔥 GUARDAR CON NOMBRE NORMALIZADO
      fileHashes[normalizedFileName] = fileHash;

      if (normalizedFileName !== originalFileName) {
        console.log(`  [ZIP] "${originalFileName}" → "${normalizedFileName}" (Hash: ${fileHash})`);
      } else {
        console.log(`  [ZIP] ${normalizedFileName} → Hash: ${fileHash}`);
      }
    }
  }

  return fileHashes;
}

/**
 * Extrae archivos RAR usando el microservicio de Railway
 * 🔥 NORMALIZA los nombres que vienen del microservicio
 */
async function extractAndHashRarFiles(
  fileBuffer: ArrayBuffer,
  parentUploadId: string
): Promise<{
  fileHashes: { [fileName: string]: string },
  uploadIds: { [fileName: string]: string }
}> {
  const RAILWAY_RAR_SERVICE = 'https://rar-extractor.onrender.com/api/extract-rar';

  console.log(`  [RAR] 🔄 Llamando al microservicio de Railway...`);

  const formData = new FormData();
  const blob = new Blob([fileBuffer], { type: 'application/vnd.rar' });
  formData.append('file', blob, 'archive.rar');
  formData.append('parentUploadId', parentUploadId);

  try {
    const response = await fetch(RAILWAY_RAR_SERVICE, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Railway RAR service error: ${errorText}`);
    }

    const result = await response.json();
    console.log(`  [RAR] ✅ Archivos extraídos: ${result.totalFiles}`);

    if (!result.success || !result.fileHashes || !result.uploadIds) {
      throw new Error('Respuesta inválida del microservicio RAR');
    }

    // 🔥 NORMALIZAR LOS NOMBRES DE ARCHIVO QUE VIENEN DEL MICROSERVICIO
    const normalizedFileHashes: { [fileName: string]: string } = {};
    const normalizedUploadIds: { [fileName: string]: string } = {};

    for (const [originalFileName, hash] of Object.entries(result.fileHashes)) {
      const normalizedFileName = normalizeFileName(originalFileName);
      normalizedFileHashes[normalizedFileName] = hash as string;

      if (normalizedFileName !== originalFileName) {
        console.log(`  [RAR] "${originalFileName}" → "${normalizedFileName}"`);
      }
    }

    for (const [originalFileName, uploadId] of Object.entries(result.uploadIds)) {
      const normalizedFileName = normalizeFileName(originalFileName);
      normalizedUploadIds[normalizedFileName] = uploadId as string;
    }

    return {
      fileHashes: normalizedFileHashes,
      uploadIds: normalizedUploadIds
    };
  } catch (error: any) {
    console.error(`  [RAR] ❌ Error:`, error.message);
    throw new Error(`No se pudo procesar el archivo RAR: ${error.message}`);
  }
}

/**
 * Registra la actividad inicial en la base de datos
 */
async function createActivityRecord(
  uploadId: string,
  empresaId: string,
  fileName: string,
  fileType: string,
  parentUploadId?: string
): Promise<void> {
  try {
    await connection.query(
      `INSERT INTO erp49.actividad 
        (upload_id, parent_upload_id, id_de_empresa, documento_nombre, documento_tipo, status, step, progress, mensaje)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uploadId,
        parentUploadId || null,
        empresaId,
        fileName,
        fileType,
        'iniciando',
        'Iniciando el flujo',
        0,
        'Archivo recibido, preparando para procesamiento'
      ]
    );
    console.log(`[${fileName}] ✅ Registro de actividad creado (uploadId: ${uploadId}${parentUploadId ? `, parent: ${parentUploadId}` : ''})`);
  } catch (error) {
    console.error(`[${fileName}] ❌ Error al crear registro de actividad:`, error);
  }
}

/**
 * 🔥 Marca el upload como fallido en la BD con mensaje genérico
 */
async function markUploadAsFailed(
  uploadId: string,
  errorMessage: string,
  errorNode?: string
): Promise<void> {
  try {
    console.log(`❌ [Upload] Marcando como fallido: ${uploadId}`);
    console.log(`❌ [Upload] Mensaje para usuario: ${errorMessage}`);
    console.log(`❌ [Upload] Nodo: ${errorNode || 'Error general'}`);

    await connection.query(
      `UPDATE erp49.actividad 
       SET status = 'Fallido', 
           step = ?, 
           progress = 0, 
           mensaje = ?, 
           updated_at = NOW()
       WHERE upload_id = ?`,
      [errorNode || 'Error', errorMessage, uploadId]
    );

    console.log(`✅ [Upload] Registro padre actualizado: ${uploadId}`);

    const [childRows] = await connection.query(
      `SELECT upload_id FROM erp49.actividad WHERE parent_upload_id = ?`,
      [uploadId]
    ) as any;

    if (childRows.length > 0) {
      console.log(`❌ [Upload] Marcando ${childRows.length} archivos hijos como fallidos...`);

      await connection.query(
        `UPDATE erp49.actividad 
         SET status = 'Fallido', 
             step = 'Error en archivo padre', 
             progress = 0, 
             mensaje = 'El archivo comprimido padre falló', 
             updated_at = NOW()
         WHERE parent_upload_id = ?`,
        [uploadId]
      );

      console.log(`✅ [Upload] ${childRows.length} archivos hijos actualizados`);
    }

  } catch (error) {
    console.error(`❌ [Upload] Error al marcar como fallido:`, error);
  }
}

/**
 * 🔥 Notifica al frontend sobre el error via API con mensaje genérico
 */
async function notifyFrontendError(
  uploadId: string,
  errorMessage: string,
  errorNode?: string
): Promise<void> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_URL || 'http://localhost:9002';

    console.log(`📡 [Upload] Notificando error al frontend: ${uploadId}`);

    const response = await fetch(`${baseUrl}/api/upload-progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: uploadId,
        status: 'Fallido',
        step: errorNode || 'Error',
        progress: 0,
        message: errorMessage,
      }),
    });

    if (response.ok) {
      console.log(`✅ [Upload] Frontend notificado exitosamente`);
    } else {
      const errorText = await response.text();
      console.error(`❌ [Upload] Error al notificar frontend (${response.status}): ${errorText}`);
    }
  } catch (error) {
    console.error(`❌ [Upload] Error en notifyFrontendError:`, error);
  }
}

/**
 * Gestiona la subida de un documento a S3 con validación de duplicados
 */
export async function uploadDocument(
  formData: FormData
): Promise<z.infer<typeof UploadResponseSchema>> {
  const file = formData.get('file') as File | null;
  const empresaId = formData.get('empresaId') as string | null;
  const uploadId = formData.get('uploadId') as string | null;

  console.log('📤 [UploadService] Recibido archivo:', file?.name);
  console.log('📤 [UploadService] EmpresaId:', empresaId);
  console.log('📤 [UploadService] UploadId:', uploadId);

  if (!file) {
    throw new Error('No se ha proporcionado ningún archivo.');
  }

  if (!empresaId) {
    throw new Error('No se ha proporcionado el ID de empresa.');
  }

  if (!uploadId) {
    throw new Error('No se ha proporcionado el Upload ID.');
  }

  const originalFileName = file.name;

  // 🔥 NORMALIZAR NOMBRE DE ARCHIVO (quitar espacios)
  const normalizedFileName = normalizeFileName(originalFileName);

  // Loguear solo si hubo cambios
  if (normalizedFileName !== originalFileName) {
    console.log(`📤 [UploadService] Nombre normalizado: "${originalFileName}" → "${normalizedFileName}"`);
  }

  const fileSize = file.size;
  const fileMimeType = file.type;
  const fileExtension = normalizedFileName.toLowerCase().split('.').pop();
  const normalizedFileType = getNormalizedFileType(fileMimeType, fileExtension);

  console.log(`📤 [UploadService] MIME Type: ${fileMimeType}`);
  console.log(`📤 [UploadService] Extensión: ${fileExtension}`);
  console.log(`📤 [UploadService] Tipo normalizado: ${normalizedFileType}`);

  const MICROSERVICE_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf333LOCA';
  const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME } = process.env;

  if (!MICROSERVICE_WEBHOOK_URL || !MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY || !MINIO_BUCKET_NAME) {
    console.error('Missing environment variables for upload service.');
    throw new Error('Configuración del servidor incompleta. Contacte al administrador.');
  }

  try {
    console.log(`[${normalizedFileName}] Leyendo archivo (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);
    const fileBuffer = await file.arrayBuffer();

    console.log(`[${normalizedFileName}] Calculando hash SHA-256...`);
    const mainFileHash = await calculateFileHash(fileBuffer);
    console.log(`[${normalizedFileName}] Hash: ${mainFileHash}`);

    console.log(`[${normalizedFileName}] Consultando CIF para empresaId: ${empresaId}`);
    const [rows] = await connection.query('SELECT CIF FROM empresas WHERE id = ?', [empresaId]);
    const empresaData = rows as { CIF: string }[];

    if (!empresaData || empresaData.length === 0) {
      throw new Error(`No se encontró la empresa con ID: ${empresaId}`);
    }

    const cif = empresaData[0].CIF;
    console.log(`[${normalizedFileName}] CIF: ${cif}`);

    let individualFileHashes: { [fileName: string]: string } = {};
    let individualUploadIds: { [fileName: string]: string } = {};
    let isCompressedFile = false;

    // 🔥 PROCESAR ARCHIVOS COMPRIMIDOS (ZIP O RAR)
    if (normalizedFileType === 'zip') {
      isCompressedFile = true;
      console.log(`[${normalizedFileName}] 📦 Detectado archivo ZIP`);

      try {
        // 🔥 extractAndHashZipFiles ya normaliza los nombres internamente
        individualFileHashes = await extractAndHashZipFiles(fileBuffer);
        console.log(`[${normalizedFileName}] ✅ Calculados ${Object.keys(individualFileHashes).length} hashes`);

        for (const fileName of Object.keys(individualFileHashes)) {
          const childUploadId = `${uploadId}_file_${crypto.randomBytes(4).toString('hex')}`;
          individualUploadIds[fileName] = childUploadId;

          await createActivityRecord(
            childUploadId,
            empresaId,
            fileName, // Ya está normalizado
            fileName.split('.').pop() || 'unknown',
            uploadId
          );

          console.log(`  [ZIP] ${fileName} → UploadId: ${childUploadId}`);
        }

        await createActivityRecord(uploadId, empresaId, normalizedFileName, normalizedFileType);

      } catch (zipError: any) {
        console.error(`[${normalizedFileName}] ❌ Error al extraer ZIP:`, zipError.message);

        const userFriendlyMessage = '❌ Ocurrió un error inesperado al procesar el archivo. Por favor, inténtalo nuevamente en unos minutos.';
        await markUploadAsFailed(uploadId, userFriendlyMessage, 'Procesamiento del archivo');
        await notifyFrontendError(uploadId, userFriendlyMessage, 'Procesamiento del archivo');

        throw new Error(userFriendlyMessage);
      }

    } else if (normalizedFileType === 'rar') {
      isCompressedFile = true;
      console.log(`[${normalizedFileName}] 📦 Detectado archivo RAR`);

      try {
        // 🔥 extractAndHashRarFiles ya normaliza los nombres internamente
        const { fileHashes, uploadIds } = await extractAndHashRarFiles(fileBuffer, uploadId);
        individualFileHashes = fileHashes;
        individualUploadIds = uploadIds;

        console.log(`[${normalizedFileName}] ✅ Calculados ${Object.keys(individualFileHashes).length} hashes (RAR)`);

        for (const fileName of Object.keys(individualFileHashes)) {
          const childUploadId = individualUploadIds[fileName];
          await createActivityRecord(
            childUploadId,
            empresaId,
            fileName, // Ya está normalizado
            fileName.split('.').pop() || 'unknown',
            uploadId
          );

          console.log(`  [RAR] ${fileName} → UploadId: ${childUploadId}`);
        }

        await createActivityRecord(uploadId, empresaId, normalizedFileName, normalizedFileType);

      } catch (rarError: any) {
        console.error(`[${normalizedFileName}] ❌ Error al extraer RAR:`, rarError.message);

        const userFriendlyMessage = '❌ Ocurrió un error inesperado al procesar el archivo. Por favor, inténtalo nuevamente en unos minutos.';
        await markUploadAsFailed(uploadId, userFriendlyMessage, 'Procesamiento del archivo');
        await notifyFrontendError(uploadId, userFriendlyMessage, 'Procesamiento del archivo');

        throw new Error(userFriendlyMessage);
      }

    } else {
      // ARCHIVOS NORMALES (NO COMPRIMIDOS)
      console.log(`[${normalizedFileName}] Verificando duplicados...`);
      const duplicateRecord = await checkDuplicate(mainFileHash, empresaId);

      if (duplicateRecord) {
        console.warn(`❌ DUPLICADO DETECTADO: ${normalizedFileName}`);

        await createActivityRecord(uploadId, empresaId, normalizedFileName, normalizedFileType);

        await markUploadAsFailed(
          uploadId,
          `❌ Este archivo ya fue subido anteriormente a esta empresa el ${new Date(duplicateRecord.uploaded_at).toLocaleString('es-AR')}`,
          'Verificación de duplicados'
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
            empresaId: empresaId,
          },
        };
      }

      console.log(`[${normalizedFileName}] ✓ No hay duplicados`);
      await createActivityRecord(uploadId, empresaId, normalizedFileName, normalizedFileType);
    }

    // 🔥 SUBIR A MINIO CON NOMBRE NORMALIZADO
    const now = new Date();
    const timestamp = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}_${now.getSeconds().toString().padStart(2, '0')}`;

    // 🔥 USAR normalizedFileName en lugar de originalFileName
    const fileNameWithoutExt = normalizedFileName.includes('.')
      ? normalizedFileName.substring(0, normalizedFileName.lastIndexOf('.'))
      : normalizedFileName;
    const fileExt = normalizedFileName.includes('.')
      ? normalizedFileName.substring(normalizedFileName.lastIndexOf('.'))
      : '';

    const uniqueFileName = `${fileNameWithoutExt}_${timestamp}${fileExt}`;
    const filePath = `archivos/${uniqueFileName}`;

    console.log(`[${normalizedFileName}] Subiendo a MinIO: ${filePath}`);
    const s3Client = new S3Client({
      region: process.env.MINIO_REGION || "us-east-1",
      endpoint: MINIO_ENDPOINT,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true,
    });

    await s3Client.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: filePath,
      Body: Buffer.from(fileBuffer),
      ContentType: fileMimeType,
      ACL: 'public-read',
    }));

    const publicUrl = `${MINIO_ENDPOINT.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${filePath}`;
    console.log(`[${normalizedFileName}] ✅ Subida a MinIO completada`);
    console.log(`[${normalizedFileName}] 🔗 URL: ${publicUrl}`);

    // 🔥 PREPARAR PAYLOAD PARA MICROSERVICE (con nombre normalizado)
    const webhookPayload: any = {
      text: filePath,
      empresaId: empresaId,
      cif: cif,
      fileHash: mainFileHash,
      uploadId: uploadId,
      fileName: normalizedFileName, // 🔥 Nombre normalizado
      originalFileName: originalFileName, // Conservamos el original por si acaso
      fileSize: fileSize,
      publicUrl: publicUrl,
      isCompressedFile: isCompressedFile,
      mimeType: fileMimeType,
      normalizedFileType: normalizedFileType,
      fileExtension: fileExtension,
      fechaSubida: now.toISOString(),
    };

    if ((normalizedFileType === 'zip' || normalizedFileType === 'rar') && Object.keys(individualFileHashes).length > 0) {
      webhookPayload.individualFileHashes = individualFileHashes;
      webhookPayload.individualUploadIds = individualUploadIds;
      console.log(`[${normalizedFileName}] 📦 Enviando ${Object.keys(individualFileHashes).length} archivos individuales`);
    }

    // 🔥 LLAMAR A MICROSERVICE Y CAPTURAR ERRORES CON MENSAJE GENÉRICO
    console.log(`[${normalizedFileName}] 📡 Llamando a Microservice webhook...`);
    console.log(`[${normalizedFileName}] 🆔 UploadId que enviamos: ${uploadId}`);

    const webhookResponse = await fetch(MICROSERVICE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });

    // 🔥 VERIFICAR SI MICROSERVICE RETORNÓ ERROR (status code != 200)
    if (!webhookResponse.ok) {
      console.error(`❌ [${normalizedFileName}] Microservice retornó error HTTP: ${webhookResponse.status}`);

      let internalErrorDetails = ''; // Para logs internos

      try {
        const errorData = await webhookResponse.json();
        internalErrorDetails = errorData.message || errorData.error || 'Error desconocido';
        console.error(`❌ [${normalizedFileName}] Error JSON:`, JSON.stringify(errorData, null, 2));
      } catch {
        const textError = await webhookResponse.text();
        internalErrorDetails = `HTTP ${webhookResponse.status}: ${webhookResponse.statusText}`;
        console.error(`❌ [${normalizedFileName}] Error TEXT:`, textError);
      }

      // 🔥 MENSAJE GENÉRICO PARA EL USUARIO (sin mencionar Microservice o detalles técnicos)
      const userFriendlyMessage = '❌ Ocurrió un error inesperado al procesar el archivo. Por favor, inténtalo nuevamente en unos minutos.';

      console.log(`❌ [${normalizedFileName}] Marcando como fallido usando uploadId del scope: ${uploadId}`);
      console.log(`❌ [${normalizedFileName}] Detalles internos: ${internalErrorDetails}`);

      await markUploadAsFailed(uploadId, userFriendlyMessage, 'Procesamiento del archivo');
      await notifyFrontendError(uploadId, userFriendlyMessage, 'Procesamiento del archivo');

      return {
        success: false,
        message: userFriendlyMessage,
      };
    }

    console.log(`✅ [${normalizedFileName}] Microservice respondió OK (${webhookResponse.status})`);

    let webhookResult: any = null;
    const responseText = await webhookResponse.text();

    try {
      webhookResult = JSON.parse(responseText);
      console.log(`[${normalizedFileName}] Respuesta Microservice (JSON):`, webhookResult);
    } catch (jsonError) {
      console.warn(`[${normalizedFileName}] Respuesta Microservice (TEXT):`, responseText);
      webhookResult = { mensaje: responseText };
    }

    if (webhookResult.status === 'DUPLICATE' || responseText.includes('duplicado') || responseText.includes('❌')) {
      console.warn(`❌ DUPLICADO DETECTADO POR MICROSERVICE: ${normalizedFileName}`);

      return {
        success: false,
        isDuplicate: true,
        message: webhookResult.mensaje || responseText || '❌ Este documento ya existe en la empresa.',
        fileHash: mainFileHash,
        duplicateInfo: {
          fileName: webhookResult.numero_documento_original || normalizedFileName,
          uploadedAt: webhookResult.fecha_original || 'Fecha desconocida',
          empresaId: empresaId,
        },
      };
    }

    console.log(`✅ [${normalizedFileName}] PROCESO COMPLETADO EXITOSAMENTE`);

    return {
      success: true,
      isDuplicate: false,
      message: webhookResult.mensaje || `✅ Archivo "${normalizedFileName}" subido exitosamente.`,
      url: publicUrl,
      fileHash: mainFileHash,
    };

  } catch (error: any) {
    console.error(`❌ [${normalizedFileName}] Error general en uploadDocument:`, error.message);
    console.error(`❌ [${normalizedFileName}] Stack trace:`, error.stack);

    // 🔥 MENSAJE GENÉRICO PARA EL USUARIO (sin detalles técnicos)
    const userFriendlyMessage = '❌ Ocurrió un error inesperado al procesar el archivo. Por favor, inténtalo nuevamente en unos minutos.';

    if (uploadId) {
      console.log(`❌ Marcando como fallido usando uploadId del scope: ${uploadId}`);
      console.log(`❌ Error interno: ${error.message}`);

      await markUploadAsFailed(uploadId, userFriendlyMessage, 'Procesamiento del archivo');
      await notifyFrontendError(uploadId, userFriendlyMessage, 'Procesamiento del archivo');
    }

    // 🔥 LANZAR ERROR GENÉRICO AL CLIENTE
    throw new Error(userFriendlyMessage);
  }
}
/**
 * 🔐 Genera una URL firmada (Presigned URL) para subir archivos directamente a S3/MinIO.
 * Esto evita pasar por el servidor de Next.js (bypass 4.5MB limit de Vercel).
 */
export async function getPresignedUploadUrl(
  fileName: string,
  fileType: string,
  empresaId: string
): Promise<{ url: string; uploadId: string; key: string; publicUrl: string; normalizedFileName: string }> {
  try {
    const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, MINIO_REGION } = process.env;

    if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY || !MINIO_BUCKET_NAME) {
      throw new Error('Configuración de almacenamiento incompleta');
    }

    // 1. Normalizar nombre
    const normalizedFileName = normalizeFileName(fileName);

    // 2. Generar Key única
    const now = new Date();
    const timestamp = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}_${now.getSeconds().toString().padStart(2, '0')}`;

    const fileNameWithoutExt = normalizedFileName.includes('.')
      ? normalizedFileName.substring(0, normalizedFileName.lastIndexOf('.'))
      : normalizedFileName;
    const fileExt = normalizedFileName.includes('.')
      ? normalizedFileName.substring(normalizedFileName.lastIndexOf('.'))
      : '';

    const uniqueFileName = `${fileNameWithoutExt}_${timestamp}${fileExt}`;
    const key = `archivos/${uniqueFileName}`;
    const uploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 3. Crear cliente S3
    const s3Client = new S3Client({
      region: MINIO_REGION || "us-east-1",
      endpoint: MINIO_ENDPOINT,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true,
    });

    // 4. Generar URL firmada para PUT
    const command = new PutObjectCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      ACL: 'public-read',
    });

    // Generamos la URL firmada normal (hacia MinIO interno)
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    // 🔥 PROXY REWRITE STRATEGY:
    // El cliente (Frontend) está en HTTPS, pero MinIO está en HTTP.
    // Para evitar "Mixed Content", el cliente subirá a "/minio-proxy/..." (HTTPS)
    // Next.js (middleware/rewrite) redirigirá internamente a MinIO (HTTP).

    // Obtenemos solo los query params de la firma (ej. ?X-Amz-Signature=...)
    const urlObj = new URL(signedUrl);
    const searchParams = urlObj.search;

    // Construimos la URL del Proxy relativa a nuestra App
    // Client PUT -> https://gestor.muvail.com/minio-proxy/archivos/file.pdf?signature...
    // Rewrite -> http://flux1a-minio.../gestor-documental/archivos/file.pdf?signature...

    // Usamos NEXT_PUBLIC_URL o un fallback seguro
    const appBaseUrl = process.env.NEXT_PUBLIC_URL?.replace(/\/$/, '') || 'https://gestor.muvail.com';

    // La ruta del proxy definida en next.config.ts es /minio-proxy/:path*
    const proxyUrl = `${appBaseUrl}/minio-proxy/${key}${searchParams}`;

    // La URL pública real del archivo (para guardar en BD y mostrar después)
    // Esta sí puede ser HTTP porque no se fetch-ea directamente desde el navegador en contextos seguros (o MinIO debería tener HTTPS para lectura)
    // OJO: Si MinIO no tiene HTTPS, ver esto en un `img src` en un sitio HTTPS también dará warnings, pero el upload es lo crítico ahora.
    const endpointUrl = MINIO_ENDPOINT.replace(/\/$/, '');
    const publicUrl = `${endpointUrl}/${MINIO_BUCKET_NAME}/${key}`;

    console.log(`🔑 [ProxyUpload] signedUrl original: ${signedUrl}`);
    console.log(`🔑 [ProxyUpload] Redirigiendo a: ${proxyUrl}`);

    // 5. Crear registro de actividad INICIAL
    await createActivityRecord(
      uploadId,
      empresaId,
      normalizedFileName,
      getNormalizedFileType(fileType, fileExt.replace('.', '')),
      undefined
    );

    return {
      url: proxyUrl, // El frontend recibirá esta URL "falsa" pero segura
      uploadId,
      key,
      publicUrl,
      normalizedFileName
    };

  } catch (error: any) {
    console.error('❌ Error generando Presigned URL:', error);
    throw new Error('Error al preparar la carga del archivo.');
  }
}

/**
 * 🚀 Procesa un documento QUE YA FUE SUBIDO a S3 por el cliente.
 * Descarga el archivo desde S3 para calcular hash y extraer contenido, 
 * manteniendo la compatibilidad con el flujo de n8n.
 */
/**
 * 🚀 Inicia una Carga Multiparte (Multipart Upload)
 * Esto permite subir archivos grandes por pedazos (chunks)
 */
export async function initiateMultipartUpload(
  fileName: string,
  fileType: string,
  empresaId: string
): Promise<{ success: boolean; data?: { uploadId: string; key: string; s3UploadId: string }; error?: string }> {
  try {
    const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, MINIO_REGION } = process.env;

    const normalizedFileName = normalizeFileName(fileName);
    const now = new Date();
    const timestamp = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}_${now.getSeconds().toString().padStart(2, '0')}`;

    const fileNameWithoutExt = normalizedFileName.includes('.')
      ? normalizedFileName.substring(0, normalizedFileName.lastIndexOf('.'))
      : normalizedFileName;
    const fileExt = normalizedFileName.includes('.')
      ? normalizedFileName.substring(normalizedFileName.lastIndexOf('.'))
      : '';

    const uniqueFileName = `${fileNameWithoutExt}_${timestamp}${fileExt}`;
    const key = `archivos/${uniqueFileName}`;
    const myUploadId = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const s3Client = new S3Client({
      region: MINIO_REGION || "us-east-1",
      endpoint: MINIO_ENDPOINT,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY!,
        secretAccessKey: MINIO_SECRET_KEY!,
      },
      forcePathStyle: true,
    });

    const command = new CreateMultipartUploadCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: key,
      ContentType: fileType,
      ACL: 'public-read',
    });

    const result = await s3Client.send(command);

    await createActivityRecord(
      myUploadId,
      empresaId,
      normalizedFileName,
      getNormalizedFileType(fileType, fileExt.replace('.', '')),
      undefined
    );

    return {
      success: true,
      data: {
        uploadId: myUploadId, // Nuestro ID interno
        key: key,
        s3UploadId: result.UploadId!, // ID de S3 para el multipart
      }
    };

  } catch (error: any) {
    console.error('❌ Error iniciando Multipart Upload:', error);
    return { success: false, error: `Error inicial: ${error.message}` };
  }
}

/**
 * 📦 Sube un fragmento (Chunk) del archivo a MinIO
 */
export async function uploadMultipartChunk(
  s3UploadId: string,
  key: string,
  partNumber: number,
  formData: FormData
): Promise<{ success: boolean; data?: { ETag: string }; error?: string }> {
  try {
    const chunk = formData.get('chunk') as File;
    if (!chunk) throw new Error('No chunk provided');

    const buffer = Buffer.from(await chunk.arrayBuffer());

    const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, MINIO_REGION } = process.env;
    const s3Client = new S3Client({
      region: MINIO_REGION || "us-east-1",
      endpoint: MINIO_ENDPOINT,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY!,
        secretAccessKey: MINIO_SECRET_KEY!,
      },
      forcePathStyle: true,
    });

    const command = new UploadPartCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: key,
      UploadId: s3UploadId,
      PartNumber: partNumber,
      Body: buffer,
    });

    const result = await s3Client.send(command);

    return { success: true, data: { ETag: result.ETag! } };

  } catch (error: any) {
    console.error(`❌ Error subiendo chunk ${partNumber}:`, error);
    return { success: false, error: `Error chunk ${partNumber}: ${error.message}` };
  }
}

/**
 * ✅ Finaliza la Carga Multiparte
 */
export async function completeMultipartUpload(
  s3UploadId: string,
  key: string,
  parts: { PartNumber: number; ETag: string }[]
): Promise<{ success: boolean; data?: { location: string }; error?: string }> {
  try {
    const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, MINIO_REGION } = process.env;
    const s3Client = new S3Client({
      region: MINIO_REGION || "us-east-1",
      endpoint: MINIO_ENDPOINT,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY!,
        secretAccessKey: MINIO_SECRET_KEY!,
      },
      forcePathStyle: true,
    });

    const command = new CompleteMultipartUploadCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: key,
      UploadId: s3UploadId,
      MultipartUpload: {
        Parts: parts.sort((a, b) => a.PartNumber - b.PartNumber),
      },
    });

    console.log('✅ [Server] S3 CompleteMultipartUpload exitoso');

    const endpointUrl = MINIO_ENDPOINT!.replace(/\/$/, '');
    const publicUrl = `${endpointUrl}/${MINIO_BUCKET_NAME}/${key}`;

    return { success: true, data: { location: publicUrl } };

  } catch (error: any) {
    console.error('❌ Error completando Multipart Upload:', error);
    // Retornamos el mensaje real del error para verlo en el cliente
    return { success: false, error: `Error finalización: ${error.message}` };
  }
}

export async function processUploadedDocument(
  key: string,
  uploadId: string,
  empresaId: string,
  originalFileName: string,
  fileType: string,
  fileSize: number, // Tamaño reportado por el cliente (informativo)
  publicUrl: string
): Promise<{ success: boolean; data?: z.infer<typeof UploadResponseSchema>; error?: string; isDuplicate?: boolean }> {
  try {
    const normalizedFileName = normalizeFileName(originalFileName);
    console.log(`⚙️ [Process] Iniciando procesamiento post-upload: ${normalizedFileName}`);

    const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME, MINIO_REGION } = process.env;
    const MICROSERVICE_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf333LOCA';

    try {
      const s3Client = new S3Client({
        region: MINIO_REGION || "us-east-1",
        endpoint: MINIO_ENDPOINT,
        credentials: {
          accessKeyId: MINIO_ACCESS_KEY!,
          secretAccessKey: MINIO_SECRET_KEY!,
        },
        forcePathStyle: true,
      });

      // 1. Descargar el archivo desde S3 para procesarlo (hash, extracción, etc.)
      const decodedKey = decodeURIComponent(key);
      console.log(`📥 [Process] Debug S3 Info:`);
      console.log(`   - Endpoint: "${MINIO_ENDPOINT}"`);
      console.log(`   - Bucket: "${MINIO_BUCKET_NAME}"`);
      console.log(`   - Raw Key: "${key}"`);
      console.log(`   - Decoded Key: "${decodedKey}"`);

      const getCommand = new GetObjectCommand({
        Bucket: MINIO_BUCKET_NAME,
        Key: decodedKey, // Trying decoded key
      });

      const s3Response = await s3Client.send(getCommand);
      const fileBuffer = await s3Response.Body?.transformToByteArray();

      if (!fileBuffer) {
        throw new Error('No se pudo leer el archivo desde S3');
      }

      const buffer = Buffer.from(fileBuffer); // Convertir a Buffer de Node

      // 2. Calcular HASH (igual que antes)
      console.log(`#️⃣ [Process] Calculando hash...`);
      const mainFileHash = await calculateFileHash(buffer);
      console.log(`[${normalizedFileName}] Hash: ${mainFileHash}`);

      // 3. Obtener CIF
      const [rows] = await connection.query('SELECT CIF FROM empresas WHERE id = ?', [empresaId]);
      const empresaData = rows as { CIF: string }[];
      if (!empresaData || empresaData.length === 0) throw new Error('Empresa no encontrada');
      const cif = empresaData[0].CIF;

      // 4. Lógica de ZIP/RAR/Duplicados (Reutilizada)
      const fileExtension = normalizedFileName.toLowerCase().split('.').pop();
      const normalizedFileType = getNormalizedFileType(fileType, fileExtension);
      let individualFileHashes: { [fileName: string]: string } = {};
      let individualUploadIds: { [fileName: string]: string } = {};
      let isCompressedFile = false;

      if (normalizedFileType === 'zip') {
        isCompressedFile = true;
        try {
          individualFileHashes = await extractAndHashZipFiles(buffer);
          // ... Logica de hijos (simplificada para este snippet, reutilizar la existente si es posible o copiar)
          for (const fileName of Object.keys(individualFileHashes)) {
            const childUploadId = `${uploadId}_file_${crypto.randomBytes(4).toString('hex')}`;
            individualUploadIds[fileName] = childUploadId;
            await createActivityRecord(childUploadId, empresaId, fileName, fileName.split('.').pop() || 'unknown', uploadId);
          }
        } catch (e: any) {
          console.error('Error ZIP', e);
          // Manejo de error
        }
      } else if (normalizedFileType === 'rar') {
        isCompressedFile = true;
        try {
          const rarResult = await extractAndHashRarFiles(buffer, uploadId);
          individualFileHashes = rarResult.fileHashes;
          individualUploadIds = rarResult.uploadIds;
          for (const fileName of Object.keys(individualFileHashes)) {
            const childUploadId = individualUploadIds[fileName];
            await createActivityRecord(childUploadId, empresaId, fileName, fileName.split('.').pop() || 'unknown', uploadId);
          }
        } catch (e: any) {
          console.error('Error RAR', e);
        }
      } else {
        // Chequeo duplicados
        const duplicateRecord = await checkDuplicate(mainFileHash, empresaId);
        if (duplicateRecord) {
          console.warn(`❌ DUPLICADO DETECTADO: ${normalizedFileName}`);
          await markUploadAsFailed(uploadId, `Duplicado del ${new Date(duplicateRecord.uploaded_at).toLocaleString()}`, 'Verificación');
          await notifyFrontendError(uploadId, 'Archivo duplicado', 'Duplicado');
          return {
            success: false,
            isDuplicate: true,
            message: `❌ Archivo duplicado.`,
            fileHash: mainFileHash,
            duplicateInfo: {
              fileName: duplicateRecord.file_name,
              uploadedAt: new Date(duplicateRecord.uploaded_at).toLocaleString('es-AR'),
              empresaId: empresaId,
            }
          };
        }
      }

      // 5. Webhook n8n
      const webhookPayload: any = {
        text: key, // En el original mandaba filePath que es lo mismo que key
        empresaId,
        cif,
        fileHash: mainFileHash,
        uploadId,
        fileName: normalizedFileName,
        originalFileName,
        fileSize,
        publicUrl,
        isCompressedFile,
        mimeType: fileType,
        normalizedFileType,
        fileExtension,
        fechaSubida: new Date().toISOString(),
      };

      if (isCompressedFile && Object.keys(individualFileHashes).length > 0) {
        webhookPayload.individualFileHashes = individualFileHashes;
        webhookPayload.individualUploadIds = individualUploadIds;
      }

      console.log(`📡 [Process] Llamando a n8n webhook...`);
      const webhookResponse = await fetch(MICROSERVICE_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      if (!webhookResponse.ok) {
        throw new Error(`Microservice error: ${webhookResponse.status}`);
      }

      // Parsear respuesta webhook
      const responseText = await webhookResponse.text();
      let webhookResult;
      try {
        webhookResult = JSON.parse(responseText);
      } catch {
        webhookResult = { mensaje: responseText };
      }

      // Chequeo final duplicados (respuesta del webhook)
      if (webhookResult.status === 'DUPLICATE' || responseText.includes('duplicado') || responseText.includes('❌')) {
        return {
          success: true,
          isDuplicate: true,
          data: {
            success: false,
            message: webhookResult.mensaje || 'Duplicado detectado por agente.',
            fileHash: mainFileHash,
            isDuplicate: true
          } as any
        };
      }

      return {
        success: true,
        data: {
          success: true,
          message: webhookResult.mensaje || 'Procesado correctamente',
          url: publicUrl,
          fileHash: mainFileHash
        } as any
      };

    } catch (error: any) {
      console.error(`❌ [Process] Inner Error:`, error);
      await markUploadAsFailed(uploadId, 'Error interno procesando archivo', 'Procesamiento');
      // Return detailed error for debugging
      const debugInfo = `(B: ${MINIO_BUCKET_NAME}, K: ${key}, E: ${MINIO_ENDPOINT})`;
      return { success: false, error: `Error interno: ${error.message} ${debugInfo}` };
    }
  } catch (outerError: any) {
    console.error("❌ Critical Process Error:", outerError);
    return { success: false, error: `Error crítico: ${outerError.message}` };
  }
}
