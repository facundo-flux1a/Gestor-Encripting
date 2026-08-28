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

/** Shape del documento extraído por Azure DI / Azure OpenAI */
export interface DocumentoExtraido {
  tipo_documento?: string;
  numero_documento?: string;
  fecha_emision?: string;
  fecha_vencimiento?: string;
  importe_total?: number;
  importe_sin_impuestos?: number;
  importe_sin_iva?: number;
  descuento_global?: number;
  base_no_sujeta?: number;
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

/** @deprecated usar DocumentoExtraido */
export type DocumentoGemini = DocumentoExtraido;

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
 * Parsea la respuesta de texto del LLM con reparación automática.
 * @throws {LlmParseError} si el JSON no se puede reparar ni parsear
 */
export function parseLlmResponse<T = DocumentoExtraido>(rawText: string): T {
  const cleaned = rawText
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned) as T;
  } catch (_) {
    const repaired = repairJSON(cleaned);
    try {
      return JSON.parse(repaired) as T;
    } catch (err) {
      throw new LlmParseError(
        `No se pudo parsear la respuesta del LLM después de reparación: ${(err as Error).message}`,
        rawText
      );
    }
  }
}

/** @deprecated usar parseLlmResponse */
export const parseGeminiResponse = parseLlmResponse;

export class LlmParseError extends Error {
  public rawResponse: string;
  constructor(message: string, rawResponse: string) {
    super(message);
    this.name = 'LlmParseError';
    this.rawResponse = rawResponse;
  }
}

/** @deprecated usar LlmParseError */
export const GeminiParseError = LlmParseError;

// ─── 2. validarRetenciones ────────────────────────────────────────────────────
/**
 * Fuerza las retenciones a ser SIEMPRE negativas y normaliza su tipo_iva.
 *
 * Regla de negocio: IRPF, RETENCION, RETENCIÓN, o cualquier tipo que contenga
 * "RET" se trata como retención → cuota_iva siempre negativa.
 */
export function validateRetenciones(impuestos: Impuesto[], esAbono: boolean = false): Impuesto[] {
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
        cuota_iva: esAbono ? Math.abs(impuesto.cuota_iva) : impuesto.cuota_iva, // Si es abono fuerza positivo, si es normal no se toca
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
 * Pasos: eliminar espacios/guiones/puntos/barras/paréntesis → quitar prefijo "ES" → UPPERCASE.
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
    .replace(/[\s\-./()]/g, ''); // quitar espacios, guiones, puntos, barras, paréntesis

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
  tolerancia = 2,
  baseNoSujeta = 0
): ValidationResult {
  const esAbono = importeTotal < 0 || importeSinImpuestos < 0;

  const sumaCuotas = impuestos.reduce((acc, i) => {
    const tipo = String(i.tipo_iva ?? (i as any).tipo_impuesto ?? '').toUpperCase();
    const esRetencion =
      tipo === 'RETENCION' ||
      tipo === 'RETENCIÓN' ||
      tipo === 'IRPF' ||
      tipo.includes('RET');

    const cuota = Number(i.cuota_iva ?? (i as any).cuota ?? 0);

    if (esRetencion) {
      const cuotaAjustada = esAbono ? Math.abs(cuota) : -Math.abs(cuota);
      return acc + cuotaAjustada;
    }

    return acc + cuota;
  }, 0);

  const totalCalculado = importeSinImpuestos + sumaCuotas + baseNoSujeta;
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
 * Orquesta normalizaciones sobre el documento extraído.
 */
export function normalizeDocumento(doc: DocumentoExtraido, empresaCif?: string): DocumentoExtraido {
  let normalized = toLowerCaseKeysDeep(doc);

  const rawTipo = String(normalized.tipo_documento || (normalized.documento as any)?.tipo_documento || '').toUpperCase();
  const rawTotal = Number(normalized.importe_total ?? (normalized.documento as any)?.importe_total ?? 0);
  const esAbono = Boolean(normalized.es_abono) || rawTipo.includes('ABONO') || rawTipo.includes('RECTIFICATIVA') || rawTotal < 0;

  if (normalized.desglose_iva && Array.isArray(normalized.desglose_iva)) {
    normalized.desglose_iva = validateRetenciones(normalized.desglose_iva as Impuesto[], esAbono);
  }
  if (normalized.totales_por_impuesto && Array.isArray(normalized.totales_por_impuesto)) {
    normalized.totales_por_impuesto = validateRetenciones(normalized.totales_por_impuesto as Impuesto[], esAbono);
  }

  // Auditar consistencia de CIFs y enriquecer el motivo en descripcion_incidencia
  const emisor = (normalized.empresa_emisora || {}) as EmpresaDoc;
  const cliente = (normalized.cliente || normalized.empresa_receptora || {}) as EmpresaDoc;

  const rawEmisorCif = emisor.cif;
  const rawClienteCif = cliente.cif;

  const emisorCif = normalizeCIF(rawEmisorCif);
  const clienteCif = normalizeCIF(rawClienteCif);
  const systemCif = normalizeCIF(empresaCif);

  // CASO 1: Emisor y Cliente tienen el MISMO CIF (conflicto directo)
  if (emisorCif && clienteCif && emisorCif === clienteCif) {
    normalized.incidencia = true;
    const conflictMsg = `Conflicto de CIF: El CIF del emisor (${emisorCif}) es exactamente idéntico al CIF del cliente (${clienteCif}).`;
    const currDesc = String(normalized.descripcion_incidencia || '').trim();
    if (!currDesc.includes(emisorCif) || !currDesc.toLowerCase().includes('idéntico')) {
      normalized.descripcion_incidencia = currDesc ? `${currDesc} | ${conflictMsg}` : conflictMsg;
    }
  }
  // CASO 2a: Emisor sin CIF y el único NIF encontrado es el de la empresa del sistema/cliente
  // → siempre enriquecer con la explicación específica, incluso si el LLM ya puso algo genérico
  else if (!emisorCif && systemCif && clienteCif === systemCif) {
    normalized.incidencia = true;
    const specificMsg = `El CIF del emisor se omitió porque el NIF detectado (${systemCif}) coincide con el CIF de la empresa del sistema.`;
    const currDesc = String(normalized.descripcion_incidencia || '').trim();
    // Solo añadir si el mensaje específico no está ya incluido
    if (!currDesc.includes(systemCif) || !currDesc.toLowerCase().includes('empresa del sistema')) {
      normalized.descripcion_incidencia = currDesc ? `${currDesc} | ${specificMsg}` : specificMsg;
    }
  }
  // CASO 2b: Emisor sin CIF, incidencia marcada, pero no hay coincidencia con sistema
  else if (!emisorCif && (normalized.incidencia || !clienteCif)) {
    const currDesc = String(normalized.descripcion_incidencia || '').trim();
    if (!currDesc) {
      normalized.descripcion_incidencia = `El CIF del emisor no figura impreso en el documento original.`;
    }
  }

  return normalized;
}

/** @deprecated usar normalizeDocumento */
export const normalizeDocumentoFromGemini = normalizeDocumento;
