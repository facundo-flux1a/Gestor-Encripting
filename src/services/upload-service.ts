'use server';

import { z } from 'zod';
// Dynamic require will be used inside the function to avoid bundling issues.

const N8N_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/bbdefd63-f86a-4590-a52a-37a891accbf3';

const UploadResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export async function uploadDocument(formData: FormData) {
  const pdf = require('pdf-parse/lib/pdf-parse.js');
  const file = formData.get('file') as File;

  if (!file) {
    throw new Error('No se ha proporcionado ningún archivo.');
  }

  if (file.type !== 'application/pdf') {
      throw new Error('El archivo debe ser un PDF.');
  }

  // Convert the file to a buffer to be processed by pdf-parse
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  
  // Extract text from the PDF buffer
  const pdfData = await pdf(fileBuffer);
  const extractedText = pdfData.text;

  try {
    const webhookFormData = new FormData();
    webhookFormData.append('extractedText', extractedText);
    webhookFormData.append('file', file);
    
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      body: webhookFormData,
    });

    if (!response.ok) {
        // Try to get more info from the response body if available
        let errorBody = 'Respuesta no válida desde el servidor.';
        try {
            const body = await response.json();
            errorBody = body.message || JSON.stringify(body);
        } catch (e) {
            // Could not parse JSON, use status text
            errorBody = response.statusText;
        }
        throw new Error(`Error del servidor: ${response.status} - ${errorBody}`);
    }

    // Assuming n8n returns a JSON response. Adjust if it returns text or something else.
    const result = await response.json();

    // You might want to validate the response from n8n
    // For now, we assume it has a `message` property on success.
    return UploadResponseSchema.parse({
      success: true,
      message: result.message || 'Archivo subido y procesado correctamente.',
    });

  } catch (error: any) {
    console.error('Failed to upload document to n8n:', error);
    // Re-throw a more user-friendly error message
    throw new Error(error.message || 'No se pudo conectar con el servicio de automatización.');
  }
}
