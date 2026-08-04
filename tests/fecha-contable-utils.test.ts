import { evaluarFechaContable, pickFechaContable } from '../src/lib/fecha-contable-utils';

describe('evaluarFechaContable', () => {
  const now = new Date('2026-08-03T12:00:00Z');

  it('pickFechaContable normaliza dd/mm/yyyy', () => {
    const p = pickFechaContable('15/12/2024');
    expect(p.raw).toBe('2024-12-15');
    expect(p.date?.getFullYear()).toBe(2024);
  });

  it('marca ejercicio anterior como fecha antigua', () => {
    const r = evaluarFechaContable('2024-06-15', { ejercicioActual: 2026, now });
    expect(r.esEjercicioAnterior).toBe(true);
    expect(r.requiereConfirmacion).toBe(true);
    expect(r.motivosIncidencia[0]).toContain('antigua');
    expect(r.motivosIncidencia[0]).toContain('2024');
  });

  it('acepta fecha del ejercicio actual', () => {
    const r = evaluarFechaContable('2026-03-01', { ejercicioActual: 2026, now });
    expect(r.esEjercicioAnterior).toBe(false);
    expect(r.requiereConfirmacion).toBe(false);
  });

  it('marca fecha futura con mensaje de fiscal-guards', () => {
    const r = evaluarFechaContable('2027-01-01', { ejercicioActual: 2026, now });
    expect(r.requiereConfirmacion).toBe(true);
    expect(r.motivosIncidencia[0]).toContain('futura');
  });

  it('marca fecha implausible (>15 años) con mensaje de fiscal-guards', () => {
    const r = evaluarFechaContable('2000-01-01', { ejercicioActual: 2026, now });
    expect(r.requiereConfirmacion).toBe(true);
    expect(r.motivosIncidencia[0]).toContain('demasiado antigua');
  });

  it('fecha ausente requiere confirmación pero sin mensaje de incidencia', () => {
    const r = evaluarFechaContable(null, { ejercicioActual: 2026, now });
    expect(r.fechaAusente).toBe(true);
    expect(r.requiereConfirmacion).toBe(true);
    expect(r.motivosIncidencia).toHaveLength(0);
  });

  it('sin emisión pero vencimiento en ejercicio anterior genera incidencia', () => {
    const r = evaluarFechaContable(null, {
      ejercicioActual: 2026,
      now,
      fechaVencimientoRaw: '2024-12-15',
    });
    expect(r.esEjercicioAnterior).toBe(true);
    expect(r.motivosIncidencia[0]).toContain('antigua');
    expect(r.motivosIncidencia[0]).toContain('2024-12-15');
  });
});
