
'use server';

import { z } from 'zod';

const N8N_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf3';

const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export async function uploadDocument(formData: FormData) {
  const file = formData.get('file') as File;

  if (!file) {
    throw new Error('No se ha proporcionado ningún archivo.');
  }

  if (file.type !== 'application/pdf') {
      throw new Error('El archivo debe ser un PDF.');
  }

  try {
    // Directamente usamos el formData que ya contiene el archivo binario.
    // n8n se encargará de procesar el archivo.
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: formData, // Enviamos el FormData original directamente
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
      message: result.message || 'Archivo subido y procesado correctamente.',
    });

  } catch (error: any) {
    console.error('Failed to upload document to n8n:', error);
    throw new Error(error.message || 'No se pudo conectar con el servicio de automatización.');
  }
}
