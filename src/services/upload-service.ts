'use server';

import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
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
 * Registra la actividad inicial en la base de datos
 */
async function createActivityRecord(
  uploadId: string,
  empresaId: string,
  fileName: string,
  fileType: string
): Promise<void> {
  try {
    await connection.query(
      `INSERT INTO erp49.actividad 
        (upload_id, id_de_empresa, documento_nombre, documento_tipo, status, step, progress, mensaje)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uploadId,
        empresaId,
        fileName,
        fileType,
        'iniciando',
        'Iniciando el flujo',
        0,
        'Archivo recibido, preparando para procesamiento'
      ]
    );
    console.log(`[${fileName}] ✅ Registro de actividad creado en BD`);
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
  const fileExtension = originalFileName.toLowerCase().split('.').pop();

  const N8N_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf33';
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
    let isCompressedFile = false;
    
    if (fileExtension === 'zip') {
      isCompressedFile = true;
      console.log(`[${originalFileName}] ⚠️ Detectado archivo ZIP. Calculando hashes individuales...`);
      
      individualFileHashes = await extractAndHashZipFiles(fileBuffer);
      console.log(`[${originalFileName}] ✅ Calculados ${Object.keys(individualFileHashes).length} hashes individuales`);
    } else {
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
      ContentType: file.type,
      ACL: 'public-read',
    }));
    
    const publicUrl = `${MINIO_ENDPOINT.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${filePath}`;
    console.log(`[${originalFileName}] ✅ Subida a MinIO completada`);

    // 🆕 REGISTRAR ACTIVIDAD INICIAL EN LA BD
    await createActivityRecord(
      uploadId,
      empresaId,
      originalFileName,
      fileExtension || 'unknown'
    );

    // PREPARAR PAYLOAD CON HASHES INDIVIDUALES Y UPLOADID
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
    };

    if (isCompressedFile && Object.keys(individualFileHashes).length > 0) {
      webhookPayload.individualFileHashes = individualFileHashes;
      console.log(`[${originalFileName}] ⚠️ Enviando ${Object.keys(individualFileHashes).length} hashes individuales al webhook`);
      console.log(`[${originalFileName}] Mapa de hashes:`, individualFileHashes);
    }

    console.log(`[${originalFileName}] Notificando a webhook...`);
    console.log(`[${originalFileName}] 🆔 Enviando uploadId: ${uploadId}`);

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