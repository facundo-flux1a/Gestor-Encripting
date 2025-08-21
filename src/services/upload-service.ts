
'use server';

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from 'zod';

const N8N_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf3';

const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const WebhookResponseSchema = z.object({
    filePath: z.string().min(1, "La ruta del archivo no puede estar vacía."),
});

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.MINIO_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY!,
    secretAccessKey: process.env.MINIO_SECRET_KEY!,
  },
  forcePathStyle: true, 
});

async function uploadFileToS3(file: File, fileKey: string): Promise<string> {
    const buffer = Buffer.from(await file.arrayBuffer());

    const params = {
        Bucket: process.env.MINIO_BUCKET_NAME!,
        Key: fileKey,
        Body: buffer,
        ContentType: file.type,
        ACL: 'public-read' as const,
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    return fileKey;
}

export async function uploadDocument(formData: FormData) {
  const file = formData.get('file') as File;

  if (!file) {
    throw new Error('No se ha proporcionado el archivo.');
  }

  try {
    // Step 1: Call the webhook to get the designated file path
    const initialWebhookPayload = {
      action: 'get_path',
      originalName: file.name,
      contentType: file.type,
      size: file.size,
    };

    const pathResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(initialWebhookPayload),
    });

    if (!pathResponse.ok) {
        throw new Error(`Error al obtener la ruta del archivo: ${pathResponse.statusText}`);
    }

    const pathResult = await pathResponse.json();
    const parsedPath = WebhookResponseSchema.safeParse(pathResult);

    if (!parsedPath.success) {
      throw new Error(`Respuesta inválida del webhook para la ruta: ${parsedPath.error.toString()}`);
    }
    
    const fileKey = parsedPath.data.filePath;

    // Step 2: Upload the file to the received S3 path
    await uploadFileToS3(file, fileKey);

    // Step 3: Call the webhook again to notify of successful upload and trigger processing
    const finalWebhookPayload = {
      action: 'process_file',
      fileKey: fileKey,
      originalName: file.name,
      contentType: file.type,
      size: file.size,
    };

    const processResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(finalWebhookPayload),
    });

    if (!processResponse.ok) {
        let errorBody = 'Respuesta no válida desde el servidor de webhook.';
        try {
            const body = await processResponse.json();
            errorBody = body.message || JSON.stringify(body);
        } catch (e) {
            errorBody = processResponse.statusText;
        }
        throw new Error(`Error del webhook de procesamiento: ${processResponse.status} - ${errorBody}`);
    }

    const result = await processResponse.json();

    return UploadResponseSchema.parse({
      success: true,
      message: result.message || 'Documento subido y procesado correctamente.',
    });

  } catch (error: any) {
    console.error('Failed to upload document:', error);
    throw new Error(error.message || 'No se pudo conectar con el servicio de automatización.');
  }
}
