
'use server';

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { z } from 'zod';

const N8N_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf3';

const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const WebhookResponseSchema = z.object({
  path: z.string().min(1, "La ruta del archivo del webhook no puede estar vacía."),
});

const s3Client = new S3Client({
  region: "us-east-1",
  endpoint: "http://flux1a-minio-32adec-164-68-127-171.traefik.me:9000",
  credentials: {
    accessKeyId: "minioadmin",
    secretAccessKey: "b3ndrlfdlvaeoke6",
  },
  forcePathStyle: true,
});

async function uploadFileToS3(file: File, fileKey: string): Promise<string> {
  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    const params = {
      Bucket: "gestor-documental",
      Key: fileKey,
      Body: buffer,
      ContentType: file.type,
      ACL: 'public-read' as const,
    };

    const command = new PutObjectCommand(params);
    await s3Client.send(command);

    console.log(`Archivo subido correctamente a: ${fileKey}`);
    return fileKey;
  } catch (err: any) {
    console.error('Error subiendo archivo a S3:', err);
    throw new Error(`Error al subir archivo al bucket: ${err.message || err}`);
  }
}

export async function uploadDocument(formData: FormData) {
  const file = formData.get('file') as File;
  const text = formData.get('text') as string;

  if (!file) {
    throw new Error('No se ha proporcionado el archivo.');
  }
  if (!text) {
      throw new Error('No se ha proporcionado el texto extraído del documento.');
  }

  try {
    // 1. Enviar el texto extraído al webhook para obtener la ruta de guardado
    const webhookPayload = {
      text: text,
    };

    const pathResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(webhookPayload),
    });

    if (!pathResponse.ok) {
        let errorBody = 'Respuesta no válida desde el servidor de webhook.';
        try {
            const body = await pathResponse.json();
            errorBody = body.message || JSON.stringify(body);
        } catch (e) {
            errorBody = pathResponse.statusText;
        }
        throw new Error(`Error del webhook al obtener la ruta: ${pathResponse.status} - ${errorBody}`);
    }

    const pathResult = await pathResponse.json();
    const parsedPath = WebhookResponseSchema.safeParse(pathResult);

    if (!parsedPath.success) {
      throw new Error(`Respuesta inválida del webhook para la ruta: ${parsedPath.error.toString()}`);
    }

    const fileKey = parsedPath.data.path;

    // 2. Subir archivo al bucket S3/MinIO con la ruta obtenida
    await uploadFileToS3(file, fileKey);

    return UploadResponseSchema.parse({
      success: true,
      message: 'Documento subido y en cola para procesamiento.',
    });

  } catch (error: any) {
    console.error('Failed to upload document:', error);
    throw new Error(error.message || 'No se pudo conectar con el servicio de automatización.');
  }
}
