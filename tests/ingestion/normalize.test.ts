/**
 * tests/ingestion/normalize.test.ts
 * 
 * Tests unitarios de la lógica de normalización.
 * Cada test verifica contra el comportamiento EXACTO de n8n.
 * Los fixtures vienen del golden dataset extraído del pinData real del flujo.
 */

import {
  repairJSON,
  parseGeminiResponse,
  validateRetenciones,
  toLowerCaseKeysDeep,
  normalizeCIF,
  detectTipoDocumento,
  validateMathBalance,
  computeProgressForMultiple,
  GeminiParseError,
  type Impuesto,
} from '../../src/services/ingestion/normalize';

// ─── repairJSON ───────────────────────────────────────────────────────────────

describe('repairJSON', () => {
  it('repara un objeto de array sin } antes de la coma', () => {
    // El patrón exacto que Gemini produce: un campo con valor, luego newline, coma, newline, {
    const broken = `{"documentos": [{"numero": "F-001", "importe": 100
    ,
    {"numero": "F-002", "importe": 200}]}`;
    const repaired = repairJSON(broken);
    // Después de reparar, el primer objeto debe cerrarse correctamente
    expect(repaired).toContain('"importe": 100\n    },');
  });

  it('no modifica JSON ya válido', () => {
    const valid = `{"documentos": [{"numero": "F-001"}, {"numero": "F-002"}]}`;
    expect(repairJSON(valid)).toBe(valid);
  });
});

// ─── parseGeminiResponse ──────────────────────────────────────────────────────

describe('parseGeminiResponse', () => {
  it('parsea JSON limpio', () => {
    const raw = `{"NUMERO_DOCUMENTO": "F-001", "IMPORTE_TOTAL": 121}`;
    const result = parseGeminiResponse(raw);
    expect(result).toEqual({ NUMERO_DOCUMENTO: 'F-001', IMPORTE_TOTAL: 121 });
  });

  it('parsea JSON con wrappers de markdown', () => {
    const raw = '```json\n{"NUMERO_DOCUMENTO": "F-001"}\n```';
    const result = parseGeminiResponse(raw);
    expect(result).toEqual({ NUMERO_DOCUMENTO: 'F-001' });
  });

  it('lanza GeminiParseError si el JSON está irrecuperable', () => {
    const broken = `{"NUMERO_DOCUMENTO": "F-001" CORRUPTO SIN CIERRE`;
    expect(() => parseGeminiResponse(broken)).toThrow(GeminiParseError);
  });
});

// ─── validateRetenciones ─────────────────────────────────────────────────────

describe('validateRetenciones', () => {
  it('fuerza cuota_iva a negativo cuando tipo_iva es RETENCION', () => {
    const impuestos: Impuesto[] = [
      { tipo_iva: 'RETENCION', cuota_iva: 150 }, // positivo → debe forzarse negativo
    ];
    const result = validateRetenciones(impuestos);
    expect(result[0].cuota_iva).toBe(-150);
  });

  it('fuerza cuota_iva a negativo cuando tipo_iva es RETENCIÓN (con tilde)', () => {
    const impuestos: Impuesto[] = [
      { tipo_iva: 'RETENCIÓN', cuota_iva: 200 },
    ];
    expect(validateRetenciones(impuestos)[0].cuota_iva).toBe(-200);
  });

  it('fuerza cuota_iva a negativo cuando tipo_iva es IRPF', () => {
    const impuestos: Impuesto[] = [
      { tipo_iva: 'IRPF', cuota_iva: 75.5 },
    ];
    expect(validateRetenciones(impuestos)[0].cuota_iva).toBe(-75.5);
  });

  it('fuerza cuota_iva a negativo cuando tipo_iva es con RET (partial match)', () => {
    const impuestos: Impuesto[] = [
      { tipo_iva: 'RET. PROFESIONAL', cuota_iva: 50 },
    ];
    expect(validateRetenciones(impuestos)[0].cuota_iva).toBe(-50);
  });

  it('normaliza tipo_iva a "RETENCION" en todos los casos de retención', () => {
    const impuestos: Impuesto[] = [
      { tipo_iva: 'IRPF', cuota_iva: 100 },
      { tipo_iva: 'RETENCIÓN', cuota_iva: 50 },
    ];
    const result = validateRetenciones(impuestos);
    expect(result[0].tipo_iva).toBe('RETENCION');
    expect(result[1].tipo_iva).toBe('RETENCION');
  });

  it('no modifica IVA normal (no retención)', () => {
    const impuestos: Impuesto[] = [
      { tipo_iva: 'IVA', cuota_iva: 21 },
      { tipo_iva: 'IVA_REDUCIDO', cuota_iva: 10 },
    ];
    const result = validateRetenciones(impuestos);
    expect(result[0].cuota_iva).toBe(21);
    expect(result[1].cuota_iva).toBe(10);
  });

  it('no cambia una retención que ya era negativa', () => {
    const impuestos: Impuesto[] = [
      { tipo_iva: 'RETENCION', cuota_iva: -150 }, // ya negativa
    ];
    expect(validateRetenciones(impuestos)[0].cuota_iva).toBe(-150);
  });
});

// ─── toLowerCaseKeysDeep ─────────────────────────────────────────────────────

describe('toLowerCaseKeysDeep', () => {
  it('no modifica strings a nivel raíz', () => {
    expect(toLowerCaseKeysDeep('hola')).toBe('hola');
  });

  it('convierte claves a minúsculas en objetos anidados', () => {
    const input = { NOMBRE: 'servicios martinez', CIF: 'b12345678' };
    expect(toLowerCaseKeysDeep(input)).toEqual({ nombre: 'servicios martinez', cif: 'b12345678' });
  });

  it('procesa arrays recursivamente', () => {
    expect(toLowerCaseKeysDeep([{ A: 1 }, { B: 2 }])).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it('preserva tipos primitivos', () => {
    expect(toLowerCaseKeysDeep({ IMPORTE: 121.00, ES_ABONO: true, CAMPO: null }))
      .toEqual({ importe: 121.00, es_abono: true, campo: null });
  });

  it('convierte objeto complejo de Gemini correctamente', () => {
    const input = {
      TIPO_DOCUMENTO: 'factura recibida',
      EMPRESA_EMISORA: { NOMBRE: 'servicios s.l.', CIF: 'b12345678' },
      DESGLOSE_IVA: [{ TIPO_IVA: 'iva', CUOTA_IVA: 21 }],
    };
    const result: any = toLowerCaseKeysDeep(input);
    expect(result.tipo_documento).toBe('factura recibida');
    expect(result.empresa_emisora.nombre).toBe('servicios s.l.');
    expect(result.desglose_iva[0].tipo_iva).toBe('iva');
    expect(result.desglose_iva[0].cuota_iva).toBe(21);
  });
});

// ─── normalizeCIF ─────────────────────────────────────────────────────────────

describe('normalizeCIF', () => {
  it('elimina el prefijo ES', () => {
    expect(normalizeCIF('ESB12345678')).toBe('B12345678');
  });

  it('elimina el prefijo ES con guion', () => {
    expect(normalizeCIF('ES-B12345678')).toBe('B12345678');
  });

  it('elimina espacios y puntos', () => {
    expect(normalizeCIF('B 12.345.678')).toBe('B12345678');
  });

  it('convierte a mayúsculas', () => {
    expect(normalizeCIF('b12345678')).toBe('B12345678');
  });

  it('maneja NIE correctamente', () => {
    expect(normalizeCIF('Y6192986C')).toBe('Y6192986C');
  });

  it('maneja NIE con prefijo ES', () => {
    expect(normalizeCIF('ESY6192986C')).toBe('Y6192986C');
  });

  it('retorna null para string vacío', () => {
    expect(normalizeCIF('')).toBeNull();
    expect(normalizeCIF(null)).toBeNull();
    expect(normalizeCIF(undefined)).toBeNull();
  });

  it('elimina paréntesis de basura OCR', () => {
    expect(normalizeCIF('B57303380)')).toBe('B57303380');
    expect(normalizeCIF('(B57303380)')).toBe('B57303380');
  });

  it('caso real del golden dataset: B46781234', () => {
    // Del mensaje de Insertar documento3 en el pinData
    expect(normalizeCIF('B46781234')).toBe('B46781234');
    expect(normalizeCIF('b46781234')).toBe('B46781234');
    expect(normalizeCIF('ES-B46781234')).toBe('B46781234');
  });
});

// ─── detectTipoDocumento ─────────────────────────────────────────────────────

describe('detectTipoDocumento', () => {
  it('detecta FACTURA EMITIDA', () => {
    const r = detectTipoDocumento('FACTURA EMITIDA');
    expect(r.esEmitida).toBe(true);
    expect(r.esRecibida).toBe(false);
    expect(r.esIndeterminado).toBe(false);
  });

  it('detecta FACTURA RECIBIDA', () => {
    const r = detectTipoDocumento('FACTURA RECIBIDA');
    expect(r.esEmitida).toBe(false);
    expect(r.esRecibida).toBe(true);
    expect(r.esIndeterminado).toBe(false);
  });

  it('detecta ABONO EMITIDO', () => {
    // Del golden dataset: el Analista devolvió "ABONO EMITIDO"
    const r = detectTipoDocumento('ABONO EMITIDO');
    expect(r.esEmitida).toBe(true);
  });

  it('detecta tipo INDETERMINADO', () => {
    // Del golden dataset: Insertar documento3 tiene tipo_indeterminado = 1
    const r = detectTipoDocumento('PLANO DE CLIMATIZACIÓN Y VENTILACIONES');
    expect(r.esIndeterminado).toBe(true);
  });

  it('es case-insensitive', () => {
    expect(detectTipoDocumento('factura emitida').esEmitida).toBe(true);
    expect(detectTipoDocumento('Factura Recibida').esRecibida).toBe(true);
  });
});

// ─── validateMathBalance ─────────────────────────────────────────────────────

describe('validateMathBalance', () => {
  it('valida un documento que cuadra exactamente', () => {
    // base=100, IVA=21 → total=121
    const impuestos: Impuesto[] = [{ tipo_iva: 'IVA', cuota_iva: 21 }];
    const result = validateMathBalance(121, 100, impuestos);
    expect(result.ok).toBe(true);
    expect(result.diferencia).toBe(0);
  });

  it('valida con diferencia dentro de la tolerancia de 2€', () => {
    const impuestos: Impuesto[] = [{ tipo_iva: 'IVA', cuota_iva: 21 }];
    // total=122.5 pero debería ser 121 → diferencia 1.5€ < 2€ → OK
    const result = validateMathBalance(122.5, 100, impuestos);
    expect(result.ok).toBe(true);
    expect(result.diferencia).toBe(1.5);
  });

  it('falla con diferencia fuera de tolerancia', () => {
    const impuestos: Impuesto[] = [{ tipo_iva: 'IVA', cuota_iva: 21 }];
    // total=125 pero debería ser 121 → diferencia 4€ > 2€ → FAIL
    const result = validateMathBalance(125, 100, impuestos);
    expect(result.ok).toBe(false);
    expect(result.diferencia).toBe(4);
  });

  it('incluye retenciones (negativas) en el cálculo', () => {
    // base=1000, IVA=210, retención=-150 → total=1060
    const impuestos: Impuesto[] = [
      { tipo_iva: 'IVA', cuota_iva: 210 },
      { tipo_iva: 'RETENCION', cuota_iva: -150 },
    ];
    const result = validateMathBalance(1060, 1000, impuestos);
    expect(result.ok).toBe(true);
  });

  it('caso real del golden dataset: ABONO EMITIDO con importes negativos', () => {
    // Del pinData de Analista: importe_total=-112.32, importe_sin_iva=-108.00
    const impuestos: Impuesto[] = [{ tipo_iva: 'IVA', cuota_iva: -4.32 }];
    const result = validateMathBalance(-112.32, -108.00, impuestos);
    expect(result.ok).toBe(true);
  });
});

// ─── computeProgressForMultiple ───────────────────────────────────────────────

describe('computeProgressForMultiple', () => {
  it('primer documento de 4 → progreso 35 + 65/4*1 = 51%', () => {
    expect(computeProgressForMultiple(1, 4)).toBe(51);
  });

  it('último documento de 4 → progreso 35 + 65/4*4 = 100%', () => {
    expect(computeProgressForMultiple(4, 4)).toBe(100);
  });

  it('primer documento de 40 → progreso 35 + 65/40*1 = 37%', () => {
    // Caso real: ZIP de 200 facturas, lote de 40 por página
    expect(computeProgressForMultiple(1, 40)).toBe(37);
  });

  it('fórmula es consistente con Code11 de n8n', () => {
    // Verifica que la fórmula produce los mismos valores que:
    // progresoActual = Math.round(35 + (65 / totalDocumentos) * documentoIndex)
    for (const [idx, total] of [[5, 10], [3, 7], [1, 1]] as [number, number][]) {
      const expected = Math.round(35 + (65 / total) * idx);
      expect(computeProgressForMultiple(idx, total)).toBe(expected);
    }
  });
});
