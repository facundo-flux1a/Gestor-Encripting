/**
 * Fecha ISO / flexible — sin “rodar” días inválidos (30/02 → 02/03).
 */

export function parseIsoDateParts(iso: string): { y: number; m: number; d: number } | null {
  const m = String(iso || '')
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (![y, mo, d].every(Number.isFinite)) return null;
  return { y, m: mo, d };
}

/** True solo si día/mes/año existen en el calendario gregoriano (bisiestos incluidos). */
export function isValidIsoCalendarDate(iso: string): boolean {
  const parts = parseIsoDateParts(iso);
  if (!parts) return false;
  const { y, m, d } = parts;
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}

/**
 * Parsea ISO o dd/mm/yyyy (también con `.` o `-`).
 * Devuelve null si el día no existe en ese mes/año (p. ej. 30/02/2026, 29/02/2026).
 */
export function parseFlexibleDate(raw: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.slice(0, 10);
    return isValidIsoCalendarDate(iso) ? iso : null;
  }

  const m = s.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (!m) return null;
  let [, dd, mm, yy] = m;
  if (yy.length === 2) yy = Number(yy) > 50 ? `19${yy}` : `20${yy}`;
  const d = Number(dd);
  const mo = Number(mm);
  if (d < 1 || d > 31 || mo < 1 || mo > 12) return null;
  const iso = `${yy}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidIsoCalendarDate(iso) ? iso : null;
}

export function utcToday(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function addYearsUtc(date: Date, years: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear() + years, date.getUTCMonth(), date.getUTCDate()));
}
