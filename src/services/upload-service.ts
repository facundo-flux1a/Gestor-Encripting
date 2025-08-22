
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
  success: z.boolean().optional(),
  message: z.string().optional(),
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
export async function uploadDocument(formData: FormData) {
  const file = formData.get('file') as File | null;
  const text = formData.get('text') as string | null;
  const fileName = formData.get('fileName') as string | null;

  if (!file || !text) {
    throw new Error('El archivo y el texto son obligatorios.');
  }

  const originalFileName = fileName || file.name;

  try {
    console.log(`📄 Procesando archivo: ${originalFileName}`);
    console.log(`📝 Texto extraído: ${text.length} caracteres`);

    // 1. Define la URL de tu webhook de n8n
    const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf3';
    
    // 2. Envía SOLO el texto extraído al webhook de n8n
    console.log('🔄 Enviando texto al webhook de n8n...');
    const webhookResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: text, // Solo el texto como un string único
        fileName: originalFileName, // Información adicional opcional
        fileSize: file.size,
        timestamp: new Date().toISOString(),
      })
    });

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text();
      throw new Error(`Error en webhook (${webhookResponse.status}): ${errorText}`);
    }

    // 3. Recibe la respuesta del webhook con la ruta del archivo
    const webhookData = await webhookResponse.json();
    console.log('🔗 Respuesta del webhook:', webhookData);
    
    const validatedResponse = WebhookResponseSchema.parse(webhookData);
    const filePath = validatedResponse.path;

    console.log('📁 Ruta recibida del webhook:', filePath);

    // 4. Validar variables de entorno para MinIO
    const requiredEnvVars = ['MINIO_ENDPOINT', 'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_BUCKET_NAME'];
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        throw new Error(`Variable de entorno faltante: ${envVar}`);
      }
    }

    // 5. Configura tu cliente de S3/MinIO
    const s3Client = new S3Client({
      region: process.env.MINIO_REGION || "us-east-1",
      endpoint: process.env.MINIO_ENDPOINT, // ej: "http://localhost:9000" o "https://tu-minio.com"
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY!,
        secretAccessKey: process.env.MINIO_SECRET_KEY!,
      },
      forcePathStyle: true, // Necesario para MinIO
    });

    // 6. Convierte el archivo a buffer para subirlo
    console.log('📤 Preparando archivo para subida...');
    const fileBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(fileBuffer);

    // 7. Sube el archivo al bucket de S3/MinIO usando la ruta obtenida
    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME!,
      Key: filePath, // usa la ruta devuelta por el webhook: [factura]/[archivo_name]
      Body: buffer,
      ContentType: file.type || 'application/pdf',
      // Configurar permisos públicos
      ACL: 'public-read',
      // Headers adicionales para asegurar acceso público
      CacheControl: 'max-age=31536000', // 1 año
      Metadata: {
        'original-name': originalFileName,
        'upload-date': new Date().toISOString(),
        'text-length': text.length.toString(),
        'processed-by': 'upload-service',
      }
    });

    console.log('☁️ Subiendo archivo a MinIO/S3...');
    const uploadResult = await s3Client.send(uploadCommand);
    console.log('✅ Archivo subido exitosamente:', uploadResult);

    // 8. Construir la URL pública del archivo
    const endpoint = process.env.MINIO_ENDPOINT!.replace(/\/$/, ''); // Remover barra final si existe
    const bucket = process.env.MINIO_BUCKET_NAME!;
    const publicUrl = `${endpoint}/${bucket}/${filePath}`;

    console.log('🌐 URL pública generada:', publicUrl);

    // 9. Opcional: Verificar que el archivo sea accesible públicamente
    try {
      const verifyResponse = await fetch(publicUrl, { method: 'HEAD' });
      if (!verifyResponse.ok) {
        console.warn('⚠️ Advertencia: El archivo puede no ser accesible públicamente');
      } else {
        console.log('✅ Archivo verificado como accesible públicamente');
      }
    } catch (verifyError) {
      console.warn('⚠️ No se pudo verificar el acceso público del archivo:', verifyError);
    }

    // 10. Devolver respuesta exitosa
    return UploadResponseSchema.parse({
      success: true,
      message: `Documento "${originalFileName}" procesado y subido exitosamente.`,
      url: publicUrl,
      path: filePath,
    });

  } catch (error: any) {
    console.error('❌ Error en el procesamiento del documento:', error);
    
    // Manejo específico de errores
    if (error.name === 'ZodError') {
      console.error('Detalles del error de validación:', error.issues);
      throw new Error('Respuesta inválida del webhook de n8n');
    }
    
    if (error.code === 'ECONNREFUSED') {
      throw new Error('No se pudo conectar al servicio de almacenamiento MinIO');
    }

    if (error.code === 'ENOTFOUND') {
      throw new Error('No se pudo conectar al webhook de n8n');
    }

    if (error.message?.includes('webhook')) {
      throw new Error(`Error del webhook: ${error.message}`);
    }

    if (error.message?.includes('S3') || error.message?.includes('MinIO')) {
      throw new Error(`Error de almacenamiento: ${error.message}`);
    }

    // Error genérico
    throw new Error(error.message || 'Ocurrió un error inesperado en el servidor.');
  }
}
