
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

  // Simulación de extracción de texto de un PDF
  const simulatedExtractedText = `
    FACTURA
    Número de Factura: INV-2024-001
    Fecha de Emisión: 2024-07-30
    Fecha de Vencimiento: 2024-08-30

    Proveedor:
    ACME Corp
    C/ Falsa 123, 28080 Madrid
    CIF: B12345678

    Cliente:
    Mi Empresa S.L.
    Av. Principal 45, 08001 Barcelona
    CIF: A87654321

    Líneas de la factura:
    - Descripción: Licencia Software Anual, Cantidad: 1, P.Unitario: 500.00, Total: 500.00
    - Descripción: Horas de Soporte, Cantidad: 10, P.Unitario: 75.00, Total: 750.00

    Base Imponible: 1250.00 EUR
    IVA (21%): 262.50 EUR
    Total: 1512.50 EUR
  `;


  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
          fileName: file.name,
          extractedText: simulatedExtractedText
      }),
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
