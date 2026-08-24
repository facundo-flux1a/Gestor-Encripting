import { runFiscalGuards, isRepairableGuardFailure } from '@/services/ingestion/fiscal-guards';
import type { DocumentoGemini } from '@/services/ingestion/normalize';

function baseDoc(over: Partial<DocumentoGemini> = {}): DocumentoGemini {
  return {
    tipo_documento: 'FACTURA RECIBIDA',
    empresa_emisora: { nombre: 'Proveedor SA', cif: 'B12345678' },
    cliente: { nombre: 'Cliente SL', cif: 'A87654321' },
    documento: {
      numero_documento: 'F-1',
      fecha_emision: '2026-01-15',
      importe_total: 121,
      importe_sin_iva: 100,
    },
    totales_por_impuesto: [
      { tipo_iva: 'IVA', porcentaje: 21, base_imponible: 100, cuota_iva: 21 },
    ],
    ...over,
  } as DocumentoGemini;
}

describe('runFiscalGuards', () => {
  it('acepta factura coherente', () => {
    const r = runFiscalGuards(baseDoc(), { empresaCif: 'A87654321' });
    expect(r.ok).toBe(true);
  });

  it('rechaza emisor = receptor', () => {
    const r = runFiscalGuards(
      baseDoc({
        empresa_emisora: { nombre: 'Misma', cif: 'B12345678' },
        cliente: { nombre: 'Misma', cif: 'B12345678' },
      })
    );
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.code === 'EMISOR_IGUAL_RECEPTOR')).toBe(true);
  });

  it('rechaza IVA vs base descuadrado', () => {
    const r = runFiscalGuards(
      baseDoc({
        totales_por_impuesto: [
          { tipo_iva: 'IVA', porcentaje: 10, base_imponible: 12.64, cuota_iva: 2.65 },
        ],
        documento: { importe_total: 15.29, importe_sin_iva: 12.64 },
      } as any)
    );
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.code === 'IVA_VS_BASE')).toBe(true);
  });

  it('rechaza sin CIF emisor en factura', () => {
    const r = runFiscalGuards(
      baseDoc({
        empresa_emisora: { nombre: 'X', cif: '' },
      })
    );
    expect(r.failures.some((f) => f.code === 'CIF_EMISOR_AUSENTE')).toBe(true);
  });

  it('isRepairable: los descuadres fiscales pasan a revisión; CIF ausente tampoco se repara', () => {
    expect(
      isRepairableGuardFailure([{ code: 'MATH_BALANCE', message: 'x' }])
    ).toBe(false);
    expect(
      isRepairableGuardFailure([{ code: 'CIF_EMISOR_AUSENTE', message: 'x' }])
    ).toBe(false);
    expect(
      isRepairableGuardFailure([
        { code: 'MATH_BALANCE', message: 'x' },
        { code: 'CIF_EMISOR_AUSENTE', message: 'y' },
      ])
    ).toBe(false);
  });

  const now = new Date('2026-07-22T12:00:00Z');

  it('rechaza fecha de emisión futura', () => {
    const r = runFiscalGuards(
      baseDoc({
        documento: {
          numero_documento: 'F-1',
          fecha_emision: '2026-11-08',
          importe_total: 121,
          importe_sin_iva: 100,
        },
      } as any),
      { empresaCif: 'A87654321', now }
    );
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.code === 'FECHA_EMISION_FUTURA')).toBe(true);
  });

  it('rechaza fecha absurda (1930 tras OCR malo de 30/02)', () => {
    const r = runFiscalGuards(
      baseDoc({
        documento: {
          numero_documento: '2026/5095',
          fecha_emision: '1930-02-20',
          importe_total: 121,
          importe_sin_iva: 100,
        },
      } as any),
      { empresaCif: 'A87654321', now }
    );
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.code === 'FECHA_EMISION_IMPLAUSIBLE')).toBe(true);
  });

  it('rechaza ISO de calendario inválido (30 feb)', () => {
    const r = runFiscalGuards(
      baseDoc({
        documento: {
          numero_documento: 'F-1',
          fecha_emision: '2026-02-30',
          importe_total: 121,
          importe_sin_iva: 100,
        },
      } as any),
      { empresaCif: 'A87654321', now }
    );
    expect(r.ok).toBe(false);
    expect(r.failures.some((f) => f.code === 'FECHA_CALENDARIO_INVALIDA')).toBe(true);
  });
});
