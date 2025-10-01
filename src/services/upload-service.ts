'use server';

import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import connection from '@/lib/db'; // Importar la conexión a la base de datos

const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  url: z.string().optional(),
});

/**
 * Gestiona la subida de un documento a S3 y notifica a un webhook.
 * 1. Genera un nombre de archivo único con timestamp.
 * 2. Sube el archivo al bucket S3/MinIO con permisos públicos.
 * 3. Envía la ruta del archivo en el bucket al webhook de n8n.
 *
 * @param formData El FormData que contiene el archivo ('file') y empresaId.
 * @returns Una promesa que se resuelve con un objeto indicando el éxito y el mensaje.
 */
export async function uploadDocument(formData: FormData): Promise<z.infer<typeof UploadResponseSchema>> {
  const file = formData.get('file') as File | null;
  const empresaId = formData.get('empresaId') as string | null;

  console.log('📤 [UploadService] Recibido archivo:', file?.name);
  console.log('📤 [UploadService] Recibido empresaId:', empresaId);

  if (!file) {
    throw new Error('No se ha proporcionado ningún archivo.');
  }

  if (!empresaId) {
    throw new Error('No se ha proporcionado el ID de empresa.');
  }

  const originalFileName = file.name;

  // 1. Validar variables de entorno críticas ANTES de empezar.
  const N8N_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf3';
  const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME } = process.env;

  if (!N8N_WEBHOOK_URL || !MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY || !MINIO_BUCKET_NAME) {
    console.error('Missing environment variables for upload service.');
    throw new Error('Configuración del servidor incompleta. Contacte al administrador.');
  }

  try {
    // 2. Obtener el CIF de la empresa desde la base de datos
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
    console.log(`[${originalFileName}] CIF obtenido: ${cif}`);

    // 3. Generar el nombre y la ruta del archivo con timestamp.
    const now = new Date();
    const timestamp = `${now.getFullYear()}_${(now.getMonth() + 1).toString().padStart(2, '0')}_${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}_${now.getMinutes().toString().padStart(2, '0')}_${now.getSeconds().toString().padStart(2, '0')}`;
    const fileNameWithoutExt = originalFileName.includes('.') ? originalFileName.substring(0, originalFileName.lastIndexOf('.')) : originalFileName;
    const fileExtension = originalFileName.includes('.') ? originalFileName.substring(originalFileName.lastIndexOf('.')) : '';
    
    const uniqueFileName = `${fileNameWithoutExt}_${timestamp}${fileExtension}`;
    const filePath = `archivos/${uniqueFileName}`;

    // 4. Subir el archivo original a MinIO/S3.
    const s3Client = new S3Client({
      region: process.env.MINIO_REGION || "us-east-1",
      endpoint: MINIO_ENDPOINT,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true, // Crucial para MinIO
    });

    const fileBuffer = await file.arrayBuffer();
    
    console.log(`[${originalFileName}] Subiendo a MinIO en ruta: ${filePath}`);
    await s3Client.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: filePath,
      Body: Buffer.from(fileBuffer),
      ContentType: file.type,
      ACL: 'public-read',
    }));
    
    const publicUrl = `${MINIO_ENDPOINT.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${filePath}`;
    console.log(`[${originalFileName}] Subida completada. URL pública: ${publicUrl}`);

    // 5. Enviar la RUTA del archivo, el empresaId Y el CIF al webhook de n8n.
    const webhookPayload = {
      text: filePath,
      empresaId: empresaId,
      cif: cif
    };

    console.log(`[${originalFileName}] Notificando al webhook con payload:`, webhookPayload);
    
    const webhookResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      console.warn(`[${originalFileName}] Alerta: La notificación al webhook de n8n falló (${webhookResponse.status}): ${errorText}`);
      return {
        success: true,
        message: `Archivo subido, pero la notificación al workflow falló.`,
        url: publicUrl,
      };
    }
    
    console.log(`[${originalFileName}] Webhook notificado exitosamente con empresaId: ${empresaId} y CIF: ${cif}`);
    
    return {
      success: true,
      message: `Archivo "${originalFileName}" subido y procesado para empresa ${empresaId} (CIF: ${cif}).`,
      url: publicUrl,
    };

  } catch (error: any) {
    console.error(`[${originalFileName}] Error en el proceso de subida:`, error);
    throw new Error(error.message || `Ocurrió un error inesperado al procesar ${originalFileName}.`);
  }
}