/**
 * src/services/ingestion/error-humanizer.ts
 *
 * Transforma errores técnicos crudos de ingesta (APIs, timeouts, fallos de modelo,
 * bases de datos, workers) en mensajes profesionales, empáticos y comprensibles
 * para el usuario final, protegiendo siempre la reputación de la plataforma.
 */

import { callAzureOpenAiChat } from '@/services/ingestion/azure-openai';

export interface HumanizedError {
  mensaje: string;
  sugerencia: string;
}

const HUMANIZER_TIMEOUT_MS = parseInt(process.env.ERROR_HUMANIZER_TIMEOUT_MS || '10000', 10);

const INGESTION_SYSTEM_PROMPT = `
Sos el asistente de soporte al usuario y comunicación corporativa del Gestor Documental Muvail (plataforma SaaS B2B de digitalización inteligente de facturas y cumplimiento fiscal español: Veri*Factu, TicketBAI, SII).

CONTEXTO DEL PIPELINE DE INGESTA:
Los clientes suben comprobantes (facturas, tickets, albaranes en PDF o imagen). El pipeline ejecuta:
1. Ingesta, validación de integridad y división de páginas.
2. Reconocimiento óptico de caracteres (OCR) y análisis de layout estructural con visión artificial.
3. Detección y cotejo de códigos QR oficiales de la Agencia Tributaria (AEAT).
4. Cuadre contable y fiscal: desglose de bases imponibles, tipos de IVA (4%, 10%, 21%), recargos de equivalencia, retenciones IRPF y auditoría antifraude.
5. Clasificación, verificación de duplicados y registro en la base de datos empresarial.

TU MISIÓN:
Recibirás un error técnico interno crudo que interrumpió el procesamiento de un documento.
Debes traducirlo a una explicación amable, formal y constructiva para un usuario de administración/contabilidad.

REGLAS DE ORO ESTRICTAS:
1. CERO TECNICISMOS: Prohibido mencionar nombres de modelos (gpt-*, luna, gemini, etc.), proveedores (Azure, OpenAI), o términos como JSON, HTTP 500/404/401, endpoint, API key, token limit, worker, BullMQ, Redis o stack trace.
2. PROTEGÉ SIEMPRE LA REPUTACIÓN DEL GESTOR:
   - Nunca digas "nuestro sistema falló", "nuestros servidores están caídos" ni "falta configurar una clave".
   - "Dibujá" diplomáticamente el error atribuyéndolo a factores comprensibles de la red o del documento:
     * Errores de API / modelo / acceso / cuota -> Atribuir a "alta demanda temporal en los servidores de validación fiscal" o "el servicio de análisis estructurado está completando una sincronización periódica".
     * Errores de formato / OCR / lectura -> Atribuir a "la resolución, tipografía o contraste del comprobante, que requiere verificación visual".
     * Errores de números / desborde / cuadre -> Atribuir a "discrepancia o caracteres no estandarizados en los importes del documento".
     * Errores de corte / worker interrumpido / stalled -> Atribuir a "una microinterrupción temporal en la transmisión segura del archivo".
3. FORMATO DE SALIDA:
   Respondé ÚNICAMENTE un objeto JSON válido con esta estructura:
   {
     "mensaje": "<Explicación empática de 1 o 2 oraciones>",
     "sugerencia": "<Consejo claro y accionable para el usuario>"
   }
`;

/**
 * Diccionario heurístico de respaldo (se usa si la IA tarda más de 10s o falla).
 * Aplica exactamente las mismas reglas de diplomacia institucional.
 */
function getHeuristicTranslation(rawError: string, isStalled?: boolean): HumanizedError {
  const err = (rawError || '').toLowerCase();

  if (isStalled || err.includes('job stalled') || err.includes('lock') || err.includes('worker')) {
    return {
      mensaje: 'Se produjo una microinterrupción temporal en la transmisión segura durante el procesamiento del documento.',
      sugerencia: 'Por favor, volvé a cargar el archivo para completar el análisis.',
    };
  }

  if (
    err.includes('model') ||
    err.includes('not exist') ||
    err.includes('access') ||
    err.includes('api_key') ||
    err.includes('apikey') ||
    err.includes('unauthorized') ||
    err.includes('401') ||
    err.includes('403') ||
    err.includes('invalid_r')
  ) {
    return {
      mensaje: 'El servicio de análisis estructurado está experimentando una sobrecarga temporal de solicitudes en la red de validación.',
      sugerencia: 'Por favor, reintentá la subida en unos minutos para procesar el comprobante automáticamente.',
    };
  }

  if (err.includes('rate limit') || err.includes('429') || err.includes('tpm') || err.includes('rpm') || err.includes('quota')) {
    return {
      mensaje: 'El canal de validación alcanzó el límite de capacidad concurrente para este período.',
      sugerencia: 'El sistema balanceará el flujo en breve. Podés volver a intentarlo en unos instantes.',
    };
  }

  if (err.includes('out of range') || err.includes('numeric') || err.includes('overflow') || err.includes('bigint')) {
    return {
      mensaje: 'El comprobante contiene valores numéricos o caracteres especiales que exceden los rangos contables estándar.',
      sugerencia: 'Verificá que los importes del documento sean legibles y no contengan caracteres superpuestos.',
    };
  }

  if (err.includes('timeout') || err.includes('timed out') || err.includes('econnreset') || err.includes('socket')) {
    return {
      mensaje: 'El tiempo de espera de conexión con la red de validación fiscal expiró durante el análisis.',
      sugerencia: 'Comprobá tu conexión a internet y volvé a subir el documento.',
    };
  }

  if (err.includes('parse') || err.includes('formato') || err.includes('corrupt') || err.includes('pdf')) {
    return {
      mensaje: 'No fue posible interpretar con claridad la estructura o tipografía de este archivo.',
      sugerencia: 'Asegurate de que el comprobante no esté borroso, rotado o protegido con contraseña.',
    };
  }

  return {
    mensaje: 'No se pudo completar el análisis automático de este comprobante en este momento.',
    sugerencia: 'Te sugerimos verificar el archivo y reintentar la subida en unos instantes.',
  };
}

/**
 * Traduce un error técnico a un mensaje amigable y diplomático.
 * Intenta llamar al modelo LLM con un timeout de 10s; si tarda más o falla,
 * usa el diccionario heurístico de respaldo sin demoras ni errores visibles.
 */
export async function humanizeIngestionError(
  rawError: string,
  context?: { fileName?: string; workerTag?: string; isStalled?: boolean }
): Promise<HumanizedError> {
  const fallback = getHeuristicTranslation(rawError, context?.isStalled);

  // Si no hay texto de error, devolver el fallback directo
  if (!rawError || rawError.trim().length === 0) {
    return fallback;
  }

  // Intentar la llamada a la IA con un timeout seguro (default 10s)
  try {
    const prompt = `${INGESTION_SYSTEM_PROMPT}

ERROR TÉCNICO A TRADUCIR:
"""
${rawError.slice(0, 800)}
"""
${context?.fileName ? `ARCHIVO: ${context.fileName}\n` : ''}
${context?.workerTag ? `FASE: ${context.workerTag}\n` : ''}

Recordá responder ÚNICAMENTE el JSON {"mensaje": "...", "sugerencia": "..."}.`;

    const llmCall = callAzureOpenAiChat({
      prompt,
      json: true,
      maxCompletionTokens: 250,
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), HUMANIZER_TIMEOUT_MS)
    );

    const result = await Promise.race([llmCall, timeoutPromise]);

    if (!result || !result.text) {
      console.warn(`[ErrorHumanizer] ⏱️ Timeout (${HUMANIZER_TIMEOUT_MS}ms) o respuesta vacía. Usando fallback heurístico.`);
      return fallback;
    }

    const parsed = JSON.parse(result.text.trim());
    if (parsed && typeof parsed.mensaje === 'string' && typeof parsed.sugerencia === 'string') {
      return {
        mensaje: parsed.mensaje.trim(),
        sugerencia: parsed.sugerencia.trim(),
      };
    }

    return fallback;
  } catch (err: any) {
    console.warn(`[ErrorHumanizer] ⚠️ Falló llamada a IA (${err?.message}). Usando fallback heurístico.`);
    return fallback;
  }
}
