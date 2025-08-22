
'use server';

import { z } from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Define el schema de la respuesta que tu función debería devolver al frontend.
const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  url: z.string().optional(),
  path: z.string().optional(),
});

// Schema para validar la respuesta del webhook de n8n
const WebhookResponseSchema = z.object({
  path: z.string(),
});

/**
 * Gestiona la subida de un documento.
 * 1. Envía el texto extraído al webhook de n8n
 * 2. Recibe la ruta donde guardar el archivo
 * 3. Sube el archivo al bucket S3/MinIO con permisos públicos
 *
 * @param formData El FormData que contiene el archivo ('file'), el texto ('text') y el nombre ('fileName').
 * @returns Una promesa que se resuelve con un objeto que indica el éxito, mensaje y URL pública.
 */
export async function uploadDocument(formData: FormData): Promise<z.infer<typeof UploadResponseSchema>> {
  const file = formData.get('file') as File | null;
  const text = formData.get('text') as string | null;
  const fileName = formData.get('fileName') as string | null;

  if (!file || !text || !fileName) {
    throw new Error('Argumentos inválidos. Se requiere archivo, texto y nombre de archivo.');
  }

  // 1. Validar variables de entorno críticas ANTES de empezar.
  const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
  const { MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET_NAME } = process.env;

  if (!N8N_WEBHOOK_URL || !MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY || !MINIO_BUCKET_NAME) {
    throw new Error('Configuración del servidor incompleta. Faltan variables de entorno para la subida de archivos.');
  }

  try {
    // 2. Enviar el texto extraído al webhook de n8n
    console.log(`[${fileName}] Enviando texto a n8n...`);
    const webhookResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      throw new Error(`Error en webhook n8n (${webhookResponse.status}): ${errorText}`);
    }

    const webhookData = await webhookResponse.json();
    const validatedResponse = WebhookResponseSchema.parse(webhookData);
    const filePath = validatedResponse.path;
    console.log(`[${fileName}] Ruta recibida de n8n: ${filePath}`);

    // 3. Subir el archivo original a MinIO/S3 en la ruta obtenida
    const s3Client = new S3Client({
      region: process.env.MINIO_REGION || "us-east-1",
      endpoint: MINIO_ENDPOINT,
      credentials: {
        accessKeyId: MINIO_ACCESS_KEY,
        secretAccessKey: MINIO_SECRET_KEY,
      },
      forcePathStyle: true,
    });

    const fileBuffer = await file.arrayBuffer();
    
    console.log(`[${fileName}] Subiendo a MinIO en ruta: ${filePath}`);
    await s3Client.send(new PutObjectCommand({
      Bucket: MINIO_BUCKET_NAME,
      Key: filePath,
      Body: Buffer.from(fileBuffer),
      ContentType: file.type,
      ACL: 'public-read',
    }));
    
    const publicUrl = `${MINIO_ENDPOINT.replace(/\/$/, '')}/${MINIO_BUCKET_NAME}/${filePath}`;
    console.log(`[${fileName}] Subida completada. URL pública: ${publicUrl}`);
    
    return {
      success: true,
      message: `Archivo "${fileName}" subido correctamente.`,
      url: publicUrl,
      path: filePath,
    };

  } catch (error: any) {
    console.error(`[${fileName}] Error en el proceso de subida:`, error);
    // Propagar un mensaje de error claro al frontend
    throw new Error(error.message || `Ocurrió un error inesperado al procesar ${fileName}.`);
  }
}
