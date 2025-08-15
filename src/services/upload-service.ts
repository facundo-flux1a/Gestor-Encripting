
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
  const randomInvoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
  const today = new Date();
  const dueDate = new Date(today);
  dueDate.setDate(today.getDate() + 30);

  const formatDate = (date: Date) => date.toISOString().split('T')[0];

  const simulatedExtractedText = `
    TIPO_DOCUMENTO: Factura
    NUMERO_FACTURA: ${randomInvoiceNumber}
    FECHA_EMISION: ${formatDate(today)}
    FECHA_VENCIMIENTO: ${formatDate(dueDate)}
    MONEDA: EUR

    PROVEEDOR_NOMBRE: ACME Corp S.L.
    PROVEEDOR_DIRECCION: C/ Falsa 123, Polígono Industrial, 28080 Madrid, España
    PROVEEDOR_CIF: B12345678
    PROVEEDOR_TELEFONO: +34 912 345 678
    PROVEEDOR_EMAIL: facturacion@acmecorp.example.com

    CLIENTE_NOMBRE: Mi Empresa de Proyectos S.A.
    CLIENTE_DIRECCION: Av. Principal 45, Planta 2, 08001 Barcelona, España
    CLIENTE_CIF: A87654321
    CLIENTE_TELEFONO: +34 934 567 890
    CLIENTE_EMAIL: administracion@miempresa.example.com

    LINEAS:
    - [COD: SW-001, DESC: Licencia Anual de Software 'FluxiApp', CANT: 2, UNIDAD: ud, P_UNIT: 450.00, DTO: 10%, IMPORTE: 810.00]
    - [COD: HW-005, DESC: Servidor Dedicado Modelo T-800, CANT: 1, UNIDAD: ud, P_UNIT: 1200.00, DTO: 0%, IMPORTE: 1200.00]
    - [COD: SRV-002, DESC: Horas de Soporte Técnico (Bolsa de 20h), CANT: 20, UNIDAD: hora, P_UNIT: 65.00, DTO: 0%, IMPORTE: 1300.00]
    - [COD: CNS-001, DESC: Consultoría y Análisis de Datos (Q3), CANT: 1, UNIDAD: servicio, P_UNIT: 750.00, DTO: 5%, IMPORTE: 712.50]
    
    BASE_IMPONIBLE: 4022.50
    
    IMPUESTOS:
    - [TIPO: IVA, PORC: 21, BASE: 3310.00, CUOTA: 695.10]
    - [TIPO: IVA, PORC: 10, BASE: 712.50, CUOTA: 71.25]
    - [TIPO: RE, PORC: 5.2, BASE: 2010.00, CUOTA: 104.52]

    TOTAL_IMPUESTOS: 870.87
    TOTAL: 4893.37

    OBSERVACIONES: El pago debe realizarse mediante transferencia bancaria a la cuenta ES80 0049 1234 5678 9012 3456.
    DATOS_EXTRA: {"numero_pedido": "PO-2024-789", "centro_coste": "I+D"}
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
