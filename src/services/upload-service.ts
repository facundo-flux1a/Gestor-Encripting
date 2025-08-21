
'use server';

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from 'zod';

const N8N_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf3';

const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
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

async function uploadFileToS3(file: File): Promise<string> {
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Generate a unique file key
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const fileKey = `uploads/${uniqueSuffix}-${file.name}`;

    const params = {
        Bucket: process.env.MINIO_BUCKET_NAME!,
        Key: fileKey,
        Body: buffer,
        ContentType: file.type,
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
    const fileKey = await uploadFileToS3(file);

    const webhookPayload = {
        fileKey: fileKey,
        originalName: file.name,
        contentType: file.type,
        size: file.size,
    };

    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    if (!response.ok) {
        let errorBody = 'Respuesta no válida desde el servidor de webhook.';
        try {
            const body = await response.json();
            errorBody = body.message || JSON.stringify(body);
        } catch (e) {
            errorBody = response.statusText;
        }
        throw new Error(`Error del webhook: ${response.status} - ${errorBody}`);
    }

    const result = await response.json();

    return UploadResponseSchema.parse({
      success: true,
      message: result.message || 'Documento subido y procesado correctamente.',
    });

  } catch (error: any) {
    console.error('Failed to upload document:', error);
    throw new Error(error.message || 'No se pudo conectar con el servicio de automatización.');
  }
}
