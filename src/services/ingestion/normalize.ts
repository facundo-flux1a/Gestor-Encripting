/**
 * src/services/ingestion/normalize.ts
 *
 * Lógica de negocio pura extraída de los Code nodes de n8n.
 * Estas funciones son deterministas y sin efectos secundarios — 100% testeables.
 *
 * Cada función replica EXACTAMENTE el comportamiento de su nodo de origen.
 */

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface Impuesto {
  tipo_iva: string;
  porcentaje?: number;
  porcentaje_iva?: number;
  base_imponible?: number;
  cuota_iva: number;
}

export interface EmpresaDoc {
  nombre?: string;
  direccion?: string;
  cif?: string;
  telefono?: string;
  email?: string;
}

export interface DocumentoGemini {
  tipo_documento?: string;
  numero_documento?: string;
  fecha_emision?: string;
  fecha_vencimiento?: string;
  importe_total?: number;
  importe_sin_impuestos?: number;
  importe_sin_iva?: number;
  moneda?: string;
  forma_pago?: string;
  observaciones?: string;
  es_abono?: boolean;
  empresa_emisora?: EmpresaDoc;
  empresa_receptora?: EmpresaDoc;
  cliente?: EmpresaDoc;
  desglose_iva?: Impuesto[];
  totales_por_impuesto?: Impuesto[];
  [key: string]: unknown;
}

export interface ValidationResult {
  ok: boolean;
  diferencia: number;
  tolerancia: number;
}

// ─── 1. repararJSON ───────────────────────────────────────────────────────────
/**
 * Repara objetos de array que Gemini dejó sin "}" de cierre antes de la coma.
 * Patrón típico: <valor>\n    ,\n    {   (falta el "}" antes de la coma)
 *
 * Origen: Code10 (carril PDF múltiple facturable) y Code en otros carriles.
 * IMPORTANTE: chequear finishReason === 'STOP' ANTES de llamar a esta función.
 * Si el JSON está truncado por MAX_TOKENS, esta función no puede repararlo.
 */
export function repairJSON(rawText: string): string {
  return rawText.replace(
    /([^\s{}\[\],])(\s*)\n(\s*),(\s*)\n(\s*){/g,
    '$1$2\n$3},$4\n$5{'
  );
}

/**
 * Parsea la respuesta de texto de Gemini con reparación automática.
 * Retorna el objeto parseado o lanza un error tipado.
 *
 * @throws {GeminiParseError} si el JSON no se puede reparar ni parsear
 */
export function parseGeminiResponse<T = DocumentoGemini>(rawText: string): T {
  // 1. Limpiar wrappers de markdown que Gemini a veces agrega
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // 2. Intentar parsear directamente
  try {
    return JSON.parse(cleaned) as T;
  } catch (_) {
    // 3. Intentar con reparación de JSON roto
    const repaired = repairJSON(cleaned);
    try {
      return JSON.parse(repaired) as T;
    } catch (err) {
      throw new GeminiParseError(
        `No se pudo parsear la respuesta de Gemini después de reparación: ${(err as Error).message}`,
        rawText
      );
    }
  }
}

export class GeminiParseError extends Error {
  public rawResponse: string;
  constructor(message: string, rawResponse: string) {
    super(message);
    this.name = 'GeminiParseError';
    this.rawResponse = rawResponse;
  }
}

// ─── 2. validarRetenciones ────────────────────────────────────────────────────
/**
 * Fuerza las retenciones a ser SIEMPRE negativas y normaliza su tipo_iva.
 *
 * Regla de negocio: IRPF, RETENCION, RETENCIÓN, o cualquier tipo que contenga
 * "RET" se trata como retención → cuota_iva siempre negativa.
 */
export function validateRetenciones(impuestos: Impuesto[]): Impuesto[] {
  return impuestos.map((impuesto) => {
    const tipo = String(impuesto.tipo_iva ?? '').toUpperCase();
    const esRetencion =
      tipo === 'RETENCION' ||
      tipo === 'RETENCIÓN' ||
      tipo === 'IRPF' ||
      tipo.includes('RET');

    if (esRetencion) {
      return {
        ...impuesto,
        tipo_iva: 'RETENCION', // Normalizar siempre a este valor
        cuota_iva: -Math.abs(impuesto.cuota_iva), // Forzar negativo
      };
    }
    return impuesto;
  });
}

// ─── 3. toLowerCaseKeysDeep ───────────────────────────────────────────────────────
/**
 * Convierte todas las CLAVES de un objeto (de forma recursiva)
 * a minúsculas. Arrays y valores se preservan.
 * Esto asegura que tanto el JSON legacy (UPPERCASE) como el nuevo (lowercase)
 * se procesen con la misma estructura en DB Writer.
 */
export function toLowerCaseKeysDeep<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj.map(toLowerCaseKeysDeep) as unknown as T;
  }
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key.toLowerCase()] = toLowerCaseKeysDeep(value);
    }
    return result as T;
  }
  return obj;
}

// ─── 4. normalizeCIF ─────────────────────────────────────────────────────────
/**
 * Normaliza un CIF/NIF/NIE español a formato estándar (9 chars sin separadores).
 *
 * Origen: queries SQL de n8n (SET @cif_emisor_limpio = ...).
 * Pasos: eliminar espacios/guiones/puntos/barras → quitar prefijo "ES" → UPPERCASE.
 *
 * Ejemplos:
 *   "ES-B 12.345.678"  →  "B12345678"
 *   "es b12345678"     →  "B12345678"
 *   "Y6192986C"        →  "Y6192986C"  (NIE — sin cambio si ya está limpio)
 *   null / ""          →  null
 */
export function normalizeCIF(raw: string | null | undefined): string | null {
  if (!raw || raw.trim() === '') return null;

  let cif = raw
    .toUpperCase()
    .replace(/[\s\-./]/g, ''); // quitar espacios, guiones, puntos, barras

  // Quitar prefijo "ES" (identificadores fiscales europeos)
  if (cif.startsWith('ES')) {
    cif = cif.substring(2);
  }

  return cif || null;
}

// ─── 5. detectTipoDocumento ───────────────────────────────────────────────────
/**
 * Determina si el documento es EMITIDO, RECIBIDO o INDETERMINADO.
 *
 * Origen: queries SQL de n8n (SET @es_emitida / @es_recibida / @tipo_indeterminado).
 *
 * Regla de negocio:
 *   - EMITIDAS: validación de duplicados solo por NÚMERO de documento.
 *   - RECIBIDAS: validación por NÚMERO + CIF del proveedor.
 *   - INDETERMINADAS: se insertan con incidencia automática.
 */
export function detectTipoDocumento(tipoRaw: string | null | undefined): {
  esEmitida: boolean;
  esRecibida: boolean;
  esIndeterminado: boolean;
} {
  const tipo = String(tipoRaw ?? '').toUpperCase();

  const esEmitida =
    tipo.includes('EMITIDA') || tipo.includes('EMITIDO');

  const esRecibida =
    tipo.includes('RECIBIDA') || tipo.includes('RECIBIDO');

  return {
    esEmitida,
    esRecibida,
    esIndeterminado: !esEmitida && !esRecibida,
  };
}

// ─── 6. validateMathBalance ───────────────────────────────────────────────────
/**
 * Valida que los totales del documento cuadren matemáticamente.
 *
 * Fórmula: importe_sin_impuestos + suma(cuotas) ≈ importe_total
 * Tolerancia: 2€ (por redondeos de Gemini o del documento original).
 *
 * Origen: lógica implícita en las queries SQL de n8n y en el sistema de
 * incidencias del proyecto (tax-validation-service.ts).
 */
export function validateMathBalance(
  importeTotal: number,
  importeSinImpuestos: number,
  impuestos: Impuesto[],
  tolerancia = 2
): ValidationResult {
  const sumaCuotas = impuestos.reduce((acc, i) => acc + (i.cuota_iva ?? 0), 0);
  const totalCalculado = importeSinImpuestos + sumaCuotas;
  const diferencia = Math.abs(importeTotal - totalCalculado);

  return {
    ok: diferencia <= tolerancia,
    diferencia: Math.round(diferencia * 100) / 100,
    tolerancia,
  };
}

// ─── 7. computeProgressForMultiple ───────────────────────────────────────────
/**
 * Calcula el progreso porcentual para un documento dentro de un lote múltiple.
 *
 * Origen: Code11 (paginador) — la fórmula exacta que n8n usaba:
 *   PROGRESO_INICIAL = 35
 *   PROGRESO_DISPONIBLE = 65
 *   progreso = INICIAL + (DISPONIBLE / totalDocs * índice)
 */
export function computeProgressForMultiple(
  documentoIndex: number,  // 1-based
  totalDocumentos: number
): number {
  const PROGRESO_INICIAL = 35;
  const PROGRESO_DISPONIBLE = 65;
  const incremento = PROGRESO_DISPONIBLE / totalDocumentos;
  return Math.round(PROGRESO_INICIAL + incremento * documentoIndex);
}

// ─── 8. normalizeDocumentoFromGemini ─────────────────────────────────────────
/**
 * Orquesta todas las normalizaciones sobre el objeto de Gemini.
 * Aplica en orden:
 *   1. toLowerCaseKeysDeep (todo en minúsculas en las CLAVES para estandarizar)
 *   2. validateRetenciones (forzar negativas)
 *
 * No modifica el objeto original.
 */
export function normalizeDocumentoFromGemini(doc: DocumentoGemini): DocumentoGemini {
  // Primero convertimos todas las CLAVES a minúsculas
  let normalized = toLowerCaseKeysDeep(doc);

  // Normalizar retenciones en DESGLOSE_IVA (legacy) o totales_por_impuesto (nuevo)
  if (normalized.desglose_iva && Array.isArray(normalized.desglose_iva)) {
    normalized.desglose_iva = validateRetenciones(normalized.desglose_iva as Impuesto[]);
  }
  if (normalized.totales_por_impuesto && Array.isArray(normalized.totales_por_impuesto)) {
    normalized.totales_por_impuesto = validateRetenciones(normalized.totales_por_impuesto as Impuesto[]);
  }

  // Soporte para campos de No Facturables (valor_referencia_no_fiscal, concepto_valor_referencia)
  // Aseguramos que si están presentes a nivel raíz, permanezcan en el objeto para ser mapeados en datos_extra
  
  return normalized;
}
