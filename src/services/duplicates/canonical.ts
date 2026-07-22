/**
 * Selección canónica entre documentos duplicados (mismo nº de factura / empresa).
 * Reglas (en orden):
 * 1. Abono/rectificativa: preferir totales ≤ 0 (signo correcto).
 * 2. Más completo (más líneas + impuestos).
 * 3. Empate: más antiguo (fecha_creacion ASC).
 */

export type CanonicalCandidate = {
  id: number;
  fecha_creacion: Date | string;
  tipo_documento?: string | null;
  importe_total?: number | string | null;
  lineas?: number;
  impuestos?: number;
};

function isAbonoTipo(tipo: string | null | undefined): boolean {
  const t = (tipo || '').toUpperCase();
  return t.includes('ABONO') || t.includes('RECTIFICATIVA');
}

function toTime(fecha: Date | string): number {
  const t = fecha instanceof Date ? fecha.getTime() : new Date(fecha).getTime();
  return Number.isFinite(t) ? t : 0;
}

function toNum(v: number | string | null | undefined): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Devuelve el candidato a conservar. El resto del grupo debe eliminarse.
 */
export function pickCanonicalDuplicate(docs: CanonicalCandidate[]): CanonicalCandidate {
  if (docs.length === 0) {
    throw new Error('pickCanonicalDuplicate: empty group');
  }
  if (docs.length === 1) return docs[0];

  return [...docs].sort((a, b) => {
    const aAbono = isAbonoTipo(a.tipo_documento);
    const bAbono = isAbonoTipo(b.tipo_documento);
    if (aAbono || bAbono) {
      const aOk = toNum(a.importe_total) <= 0 ? 1 : 0;
      const bOk = toNum(b.importe_total) <= 0 ? 1 : 0;
      if (aOk !== bOk) return bOk - aOk; // correcto primero
    }

    const aScore = (a.lineas ?? 0) + (a.impuestos ?? 0);
    const bScore = (b.lineas ?? 0) + (b.impuestos ?? 0);
    if (aScore !== bScore) return bScore - aScore; // más completo primero

    return toTime(a.fecha_creacion) - toTime(b.fecha_creacion); // más antiguo primero
  })[0];
}

/** Importes de abono: siempre negativos sin invertidos dobles (* -1). */
export function forceAbonoSign(value: number): number {
  if (!Number.isFinite(value) || value === 0) return 0;
  return -Math.abs(value);
}
