
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

  // Simulación de extracción de texto COMPLETA del PDF proporcionado
  const simulatedExtractedText = `
    TIPO_DOCUMENTO: Factura
    NUMERO_FACTURA: 2024/FM-24603717
    FECHA_EMISION: 2025-06-30
    FECHA_VENCIMIENTO: 2025-07-28
    MONEDA: EUR

    PROVEEDOR_NOMBRE: HECMED
    PROVEEDOR_DIRECCION: Polanx, Valencia, España
    PROVEEDOR_CIF: B4691566
    PROVEEDOR_TELEFONO: 961340715
    PROVEEDOR_EMAIL: hecmed@example.com

    CLIENTE_NOMBRE: ESPAIS DE DUNES, S.L.
    CLIENTE_DIRECCION: C/SANT JOAN, 14, 40133 - MELIANA
    CLIENTE_CIF: ESB97376321
    
    OBSERVACIONES: FORMA DE PAGO: 28 dias - C-RECIBO_OK. Comercial: VICKY.

    LINEAS:
    - [COD: 37986, DESC: CORNE XXL 16 U., CANT: 1.00, UNIDAD: Cajas, P_UNIT: 31.61, DTO: 10, IMPORTE: 28.45]
    - [COD: 37413, DESC: B/J 400ML STRAWBERRY CHEESECAKE, CANT: 1.00, UNIDAD: Cajas, P_UNIT: 59.44, DTO: 10, IMPORTE: 53.50]
    - [COD: 53943, DESC: FILIPINOS SANDWICH XXL, CANT: 1.00, UNIDAD: Cajas, P_UNIT: 37.38, DTO: 10, IMPORTE: 33.64]
    - [COD: 45104, DESC: CALIPPO LIMA LIMON 24 U, CANT: 2.00, UNIDAD: Cajas, P_UNIT: 30.45, DTO: 10, IMPORTE: 54.81]
    - [COD: 45101, DESC: CALIPPO FRESA 24 U, CANT: 1.00, UNIDAD: Cajas, P_UNIT: 30.45, DTO: 10, IMPORTE: 27.41]
    - [COD: 43281, DESC: CHOCN BALL 20 U. (negriton), CANT: 1.00, UNIDAD: Cajas, P_UNIT: 40.83, DTO: 10, IMPORTE: 36.75]
    - [COD: 52637, DESC: DRACULA 40 UD, CANT: 1.00, UNIDAD: Cajas, P_UNIT: 31.75, DTO: 10, IMPORTE: 28.58]
    - [COD: 70480, DESC: FRIGO PIE 25U, CANT: 1.00, UNIDAD: Cajas, P_UNIT: 41.68, DTO: 10, IMPORTE: 37.51]
    
    BASE_IMPONIBLE: 976.14
    
    IMPUESTOS:
    - [TIPO: IVA, PORC: 10, BASE: 976.14, CUOTA: 97.61]
    - [TIPO: RE, PORC: 1.4, BASE: 976.14, CUOTA: 0.00]

    TOTAL_IMPUESTOS: 97.61
    TOTAL: 1073.75
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
