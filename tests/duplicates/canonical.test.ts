import {
  pickCanonicalDuplicate,
  forceAbonoSign,
  type CanonicalCandidate,
} from '@/services/duplicates/canonical';

describe('forceAbonoSign', () => {
  it('fuerza negativo sin doble inversión', () => {
    expect(forceAbonoSign(10.8)).toBe(-10.8);
    expect(forceAbonoSign(-10.8)).toBe(-10.8);
    expect(forceAbonoSign(0)).toBe(0);
  });
});

describe('pickCanonicalDuplicate', () => {
  const base = (partial: Partial<CanonicalCandidate> & { id: number }): CanonicalCandidate => ({
    fecha_creacion: '2026-07-01T00:00:00Z',
    tipo_documento: 'FACTURA RECIBIDA',
    importe_total: 100,
    lineas: 1,
    impuestos: 1,
    ...partial,
  });

  it('en abonos prefiere totales negativos', () => {
    const kept = pickCanonicalDuplicate([
      base({
        id: 11,
        tipo_documento: 'ABONO RECIBIDO',
        importe_total: 10.8,
        fecha_creacion: '2026-07-20T00:00:00Z',
      }),
      base({
        id: 4,
        tipo_documento: 'ABONO RECIBIDO',
        importe_total: -10.8,
        fecha_creacion: '2026-07-17T00:00:00Z',
      }),
    ]);
    expect(kept.id).toBe(4);
  });

  it('prefiere el más completo si el signo empatan', () => {
    const kept = pickCanonicalDuplicate([
      base({ id: 1, lineas: 1, impuestos: 1, fecha_creacion: '2026-07-01T00:00:00Z' }),
      base({ id: 2, lineas: 10, impuestos: 2, fecha_creacion: '2026-07-10T00:00:00Z' }),
    ]);
    expect(kept.id).toBe(2);
  });

  it('en empate total conserva el más antiguo', () => {
    const kept = pickCanonicalDuplicate([
      base({ id: 20, fecha_creacion: '2026-07-20T00:00:00Z', lineas: 2, impuestos: 1 }),
      base({ id: 10, fecha_creacion: '2026-07-10T00:00:00Z', lineas: 2, impuestos: 1 }),
    ]);
    expect(kept.id).toBe(10);
  });

  it('falla con grupo vacío', () => {
    expect(() => pickCanonicalDuplicate([])).toThrow(/empty/);
  });
});
