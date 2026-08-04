import { calcularTrimestreExtendido } from '../src/lib/client-utils';

function parseFechaLocal(fecha: Date | string): Date {
  if (fecha instanceof Date) return fecha;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(fecha).trim());
  if (isoMatch) {
    return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
  }
  return new Date(fecha);
}

describe('trimestre-utils (pure functions)', () => {
  describe('calcularTrimestreExtendido', () => {
    it('asigna enero al T1 del mismo año', () => {
      expect(calcularTrimestreExtendido('2026-01-15')).toEqual({ año: 2026, trimestre: 1 });
    });

    it('asigna abril hasta día 20 al T1', () => {
      expect(calcularTrimestreExtendido('2026-04-20')).toEqual({ año: 2026, trimestre: 1 });
      expect(calcularTrimestreExtendido('2026-04-21')).toEqual({ año: 2026, trimestre: 2 });
    });

    it('asigna enero al T1 del mismo año (ventana T4 ene 1-30 no aplica si T1 coincide)', () => {
      expect(calcularTrimestreExtendido('2027-01-15')).toEqual({ año: 2027, trimestre: 1 });
    });
  });

  describe('parseFechaLocal', () => {
    it('evita desfase UTC en strings ISO', () => {
      const d = parseFechaLocal('2025-12-31');
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(11);
      expect(d.getDate()).toBe(31);
    });
  });
});
