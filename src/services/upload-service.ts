
'use server';

import { z } from 'zod';

const N8N_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf3';

const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export async function uploadDocument(formData: FormData) {

  if (!formData.has('file')) {
    throw new Error('No se ha proporcionado ningún archivo para procesar.');
  }

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
        let errorBody = 'Respuesta no válida desde el servidor.';
        try {
            const body = await response.json();
            errorBody = body.message || JSON.stringify(body);
        } catch (e) {
            errorBody = response.statusText;
        }
        throw new Error(`Error del servidor: ${response.status} - ${errorBody}`);
    }

    const result = await response.json();

    return UploadResponseSchema.parse({
      success: true,
      message: result.message || 'Documento enviado para procesar.',
    });

  } catch (error: any) {
    console.error('Failed to upload document to n8n:', error);
    throw new Error(error.message || 'No se pudo conectar con el servicio de automatización.');
  }
}
