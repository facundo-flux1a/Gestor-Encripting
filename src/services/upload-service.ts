'use server';

import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
// Los imports de trimestre ya no son necesarios - el cálculo se hace en n8n
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
 * Normaliza el tipo de archivo basándose en el MIME type y la extensión
 * Retorna un valor consistente independientemente de las variaciones
 */
function getNormalizedFileType(mimeType: string, extension?: string): string {
  const mime = mimeType.toLowerCase();
  const ext = extension?.toLowerCase() || '';

  // Archivos comprimidos
  if (mime === 'application/zip' || ext === 'zip') {
    return 'zip';
  }
  if (
    mime === 'application/x-rar-compressed' ||
    mime === 'application/vnd.rar' ||
    mime === 'application/x-rar' ||
    ext === 'rar'
  ) {
    return 'rar';
  }

  // PDF
  if (mime === 'application/pdf' || ext === 'pdf') {
    return 'pdf';
  }

  // Imágenes
  if (mime === 'image/jpeg' || mime === 'image/jpg' || ext === 'jpg' || ext === 'jpeg') {
    return 'jpeg';
  }
  if (mime === 'image/png' || ext === 'png') {
    return 'png';
  }

  // Word
  if (
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'doc' ||
    ext === 'docx'
  ) {
    return 'word';
  }

  // Excel
  if (
    mime === 'application/vnd.ms-excel' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    ext === 'xls' ||
    ext === 'xlsx'
  ) {
    return 'excel';
  }

  // Default: retornar la extensión o "unknown"
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
      `SELECT file_hash, file_name, uploaded_at 
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
 * ⚠️ SOLO FUNCIONA CON ARCHIVOS ZIP (JSZip no soporta RAR)
 */
async function extractAndHashZipFiles(fileBuffer: ArrayBuffer): Promise<{ [fileName: string]: string }> {
  const zip = new JSZip();
  const zipContent = await zip.loadAsync(Buffer.from(fileBuffer));
  const fileHashes: { [fileName: string]: string } = {};

  for (const [fileName, zipEntry] of Object.entries(zipContent.files)) {
    if (!zipEntry.dir) {
      const fileData = await zipEntry.async('arraybuffer');
      
      const hash = crypto.createHash('sha256');
      hash.update(Buffer.from(fileData));
      const fileHash = hash.digest('hex');
      
      fileHashes[fileName] = fileHash;
      console.log(`  [ZIP] ${fileName} → Hash: ${fileHash}`);
    }
  }

  return fileHashes;
}

/**
 * 🆕 Extrae archivos RAR usando el microservicio de Railway
 * Retorna los hashes y uploadIds individuales de cada archivo
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
  console.log(`  [RAR] 🆔 parentUploadId: ${parentUploadId}`);

  // Crear FormData con el archivo RAR y el parentUploadId
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
    
    console.log(`  [RAR] ✅ Respuesta del microservicio:`, result);
    console.log(`  [RAR] 📋 Archivos extraídos: ${result.totalFiles}`);

    if (!result.success || !result.fileHashes || !result.uploadIds) {
      throw new Error('Respuesta inválida del microservicio RAR');
    }

    // Devolver los hashes y uploadIds generados por el microservicio
    return {
      fileHashes: result.fileHashes,
      uploadIds: result.uploadIds
    };

  } catch (error: any) {
    console.error(`  [RAR] ❌ Error al extraer RAR:`, error.message);
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
    console.log(`[${fileName}] ✅ Registro de actividad creado en BD (uploadId: ${uploadId}${parentUploadId ? `, parent: ${parentUploadId}` : ''})`);
  } catch (error) {
    console.error(`[${fileName}] ❌ Error al crear registro de actividad:`, error);
    // No lanzamos error para no interrumpir el flujo principal
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
  const fileSize = file.size;
  const fileMimeType = file.type;
  const fileExtension = originalFileName.toLowerCase().split('.').pop();
  const normalizedFileType = getNormalizedFileType(fileMimeType, fileExtension);

  console.log(`📤 [UploadService] MIME Type: ${fileMimeType}`);
  console.log(`📤 [UploadService] Extensión: ${fileExtension}`);
  console.log(`📤 [UploadService] Tipo normalizado: ${normalizedFileType}`);

  const N8N_WEBHOOK_URL = 'https://n8n-05uy.onrender.com/webhook/bbdefd63-f86a-4590-a52a-37a891accbf333';
  const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME } = process.env;

  if (!N8N_WEBHOOK_URL || !MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY || !MINIO_BUCKET_NAME) {
    console.error('Missing environment variables for upload service.');
    throw new Error('Configuración del servidor incompleta. Contacte al administrador.');
  }

  try {
    console.log(`[${originalFileName}] Leyendo archivo (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);
    const fileBuffer = await file.arrayBuffer();

    console.log(`[${originalFileName}] Calculando hash SHA-256...`);
    const mainFileHash = await calculateFileHash(fileBuffer);
    console.log(`[${originalFileName}] Hash del archivo: ${mainFileHash}`);

    console.log(`[${originalFileName}] Consultando CIF para empresaId: ${empresaId}`);
    
    const [rows] = await connection.query(
      'SELECT CIF FROM empresas WHERE id = ?',
      [empresaId]
    );

    const empresaData = rows as { CIF: string }[];
    
    if (!empresaData || empresaData.length === 0) {
      throw new Error(`No se encontró la empresa con ID: ${empresaId}`);
    }

    const cif = empresaData[0].CIF;
    console.log(`[${originalFileName}] CIF: ${cif}`);

    let individualFileHashes: { [fileName: string]: string } = {};
    let individualUploadIds: { [fileName: string]: string } = {};
    let isCompressedFile = false;
    
    // 🔥 PROCESAR ARCHIVOS COMPRIMIDOS (ZIP O RAR)
    if (normalizedFileType === 'zip') {
      isCompressedFile = true;
      console.log(`[${originalFileName}] 📦 Detectado archivo ZIP. Calculando hashes individuales...`);
      
      try {
        individualFileHashes = await extractAndHashZipFiles(fileBuffer);
        console.log(`[${originalFileName}] ✅ Calculados ${Object.keys(individualFileHashes).length} hashes individuales`);
        
        // GENERAR UPLOAD IDS INDIVIDUALES PARA ARCHIVOS DEL ZIP
        console.log(`[${originalFileName}] 🆔 Generando uploadIds individuales para archivos del ZIP...`);
        for (const fileName of Object.keys(individualFileHashes)) {
          const childUploadId = `${uploadId}_file_${crypto.randomBytes(4).toString('hex')}`;
          individualUploadIds[fileName] = childUploadId;
          
          // REGISTRAR ACTIVIDAD INDIVIDUAL PARA CADA ARCHIVO HIJO
          await createActivityRecord(
            childUploadId,
            empresaId,
            fileName,
            fileName.split('.').pop() || 'unknown',
            uploadId  // parentUploadId
          );
          
          console.log(`  [ZIP] ${fileName} → UploadId: ${childUploadId}`);
        }
        
        console.log(`[${originalFileName}] ✅ Generados ${Object.keys(individualUploadIds).length} uploadIds individuales`);
        
        // REGISTRAR EL ZIP PADRE
        await createActivityRecord(
          uploadId,
          empresaId,
          originalFileName,
          normalizedFileType
        );
        
      } catch (zipError: any) {
        console.error(`[${originalFileName}] ❌ Error al extraer ZIP:`, zipError.message);
        throw new Error(`No se pudo procesar el archivo ZIP: ${zipError.message}`);
      }
      
    } else if (normalizedFileType === 'rar') {
      // 🆕 ARCHIVOS RAR - EXTRAER CON MICROSERVICIO DE RAILWAY
      isCompressedFile = true;
      console.log(`[${originalFileName}] 📦 Detectado archivo RAR. Llamando al microservicio...`);
      
      try {
        // 🔥 LLAMAR AL MICROSERVICIO DE RAILWAY
        const { fileHashes, uploadIds } = await extractAndHashRarFiles(fileBuffer, uploadId);
        
        individualFileHashes = fileHashes;
        individualUploadIds = uploadIds;
        
        console.log(`[${originalFileName}] ✅ Calculados ${Object.keys(individualFileHashes).length} hashes individuales (RAR)`);
        console.log(`[${originalFileName}] ✅ Generados ${Object.keys(individualUploadIds).length} uploadIds individuales (RAR)`);
        
        // REGISTRAR ACTIVIDAD INDIVIDUAL PARA CADA ARCHIVO HIJO
        for (const fileName of Object.keys(individualFileHashes)) {
          const childUploadId = individualUploadIds[fileName];
          
          await createActivityRecord(
            childUploadId,
            empresaId,
            fileName,
            fileName.split('.').pop() || 'unknown',
            uploadId  // parentUploadId
          );
          
          console.log(`  [RAR] ${fileName} → UploadId: ${childUploadId}`);
        }
        
        // REGISTRAR EL RAR PADRE
        await createActivityRecord(
          uploadId,
          empresaId,
          originalFileName,
          normalizedFileType
        );
        
      } catch (rarError: any) {
        console.error(`[${originalFileName}] ❌ Error al extraer RAR:`, rarError.message);
        throw new Error(`No se pudo procesar el archivo RAR: ${rarError.message}`);
      }
      
    } else {
      // ARCHIVOS NORMALES (NO COMPRIMIDOS)
      console.log(`[${originalFileName}] Verificando si ya existe este archivo...`);
      const duplicateRecord = await checkDuplicate(mainFileHash, empresaId);

      if (duplicateRecord) {
        console.warn(`\n❌ DUPLICADO DETECTADO:\n`);
        console.warn(`   Archivo nuevo: ${originalFileName}`);
        console.warn(`   Archivo existente: ${duplicateRecord.file_name}`);
        console.warn(`   Fecha de carga: ${duplicateRecord.uploaded_at}`);
        console.warn(`   Hash: ${duplicateRecord.file_hash.substring(0, 8)}...\n`);
        
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

      console.log(`[${originalFileName}] ✓ No se encontraron duplicados. Procediendo con la subida...`);
      
      // REGISTRAR ARCHIVO NORMAL
      await createActivityRecord(
        uploadId,
        empresaId,
        originalFileName,
        normalizedFileType
      );
    }

    const now = new Date();
    const timestamp = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}_${now.getSeconds().toString().padStart(2, '0')}`;
    const fileNameWithoutExt = originalFileName.includes('.') 
      ? originalFileName.substring(0, originalFileName.lastIndexOf('.')) 
      : originalFileName;
    const fileExt = originalFileName.includes('.') 
      ? originalFileName.substring(originalFileName.lastIndexOf('.')) 
      : '';
    
    const uniqueFileName = `${fileNameWithoutExt}_${timestamp}${fileExt}`;
    const filePath = `archivos/${uniqueFileName}`;

    console.log(`[${originalFileName}] Subiendo a MinIO: ${filePath}`);
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
    console.log(`[${originalFileName}] ✅ Subida a MinIO completada`);

    const fechaSubida = now;
    console.log(`[${originalFileName}] ⏰ Fecha de subida: ${fechaSubida.toISOString()}`);
    console.log(`[${originalFileName}] ℹ️ El trimestre será calculado por n8n usando la fecha de emisión del documento`);

    // PREPARAR PAYLOAD
    const webhookPayload: any = {
      text: filePath,
      empresaId: empresaId,
      cif: cif,
      fileHash: mainFileHash,
      uploadId: uploadId,
      fileName: originalFileName,
      fileSize: fileSize,
      publicUrl: publicUrl,
      isCompressedFile: isCompressedFile,
      mimeType: fileMimeType,
      normalizedFileType: normalizedFileType,
      fileExtension: fileExtension,
      fechaSubida: fechaSubida.toISOString(),
    };

    // 🔥 AGREGAR HASHES INDIVIDUALES SI ES ZIP O RAR
    if ((normalizedFileType === 'zip' || normalizedFileType === 'rar') && Object.keys(individualFileHashes).length > 0) {
      webhookPayload.individualFileHashes = individualFileHashes;
      webhookPayload.individualUploadIds = individualUploadIds;
      
      console.log(`[${originalFileName}] 📦 Enviando ${Object.keys(individualFileHashes).length} archivos individuales del ${normalizedFileType.toUpperCase()} al webhook`);
      console.log(`[${originalFileName}] 📋 Mapa de hashes:`, individualFileHashes);
      console.log(`[${originalFileName}] 🆔 Mapa de uploadIds:`, individualUploadIds);
    }

    console.log(`[${originalFileName}] Notificando a webhook...`);
    console.log(`[${originalFileName}] 🆔 Enviando uploadId padre: ${uploadId}`);
    console.log(`[${originalFileName}] 📦 Tipo normalizado: ${normalizedFileType}`);

    const webhookResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.warn(`[${originalFileName}] ⚠️ Webhook respondió con error (${webhookResponse.status}): ${errorText}`);
      throw new Error(`Error al procesar el documento`);
    }

    let webhookResult: any = null;
    const responseText = await webhookResponse.text();

    try {
      webhookResult = JSON.parse(responseText);
      console.log(`[${originalFileName}] Respuesta del webhook (JSON):`, webhookResult);
    } catch (jsonError) {
      console.warn(`[${originalFileName}] Respuesta del webhook (TEXT):`, responseText);
      webhookResult = { mensaje: responseText };
    }

    if (webhookResult.status === 'DUPLICATE' || responseText.includes('duplicado') || responseText.includes('❌')) {
      console.warn(`\n❌ DUPLICADO DETECTADO POR N8N:\n`);
      console.warn(`   ${webhookResult.mensaje || responseText}\n`);
      
      return {
        success: false,
        isDuplicate: true,
        message: webhookResult.mensaje || responseText || '❌ Este documento ya existe en la empresa.',
        fileHash: mainFileHash,
        duplicateInfo: {
          fileName: webhookResult.numero_documento_original || originalFileName,
          uploadedAt: webhookResult.fecha_original || 'Fecha desconocida',
          empresaId: empresaId,
        },
      };
    }

    console.log(`[${originalFileName}] ✅ PROCESO COMPLETADO EXITOSAMENTE\n`);

    return {
      success: true,
      isDuplicate: false,
      message: webhookResult.mensaje || `✅ Archivo "${originalFileName}" subido exitosamente.`,
      url: publicUrl,
      fileHash: mainFileHash,
    };

  } catch (error: any) {
    console.error(`[${originalFileName}] ❌ Error:`, error.message);
    throw new Error(error.message || `Ocurrió un error inesperado al procesar ${originalFileName}.`);
  }
}