/**
 * Validación de fecha contable (fecha de emisión del documento).
 * Reutiliza los mismos criterios/mensajes que validateFechaEmision (fiscal-guards)
 * + ejercicio anterior al contable actual.
 * Independiente de la asignación operativa de trimestre.
 */

import { parseFechaLocal } from '@/lib/client-utils';
import { parseFlexibleDate, parseIsoDateParts } from '@/services/ingestion/date-utils';
import {
  FECHA_EMISION_MAX_PAST_YEARS,
  validateFechaEmision,
} from '@/services/ingestion/fiscal-guards';

export interface EvaluacionFechaContable {
  fechaAusente: boolean;
  esEjercicioAnterior: boolean;
  /** Requiere Sin confirmar antes de contabilizar */
  requiereConfirmacion: boolean;
  motivosIncidencia: string[];
}

/** Normaliza fecha contable del payload del extractor → ISO + Date local. */
export function pickFechaContable(
  ...candidates: Array<string | null | undefined>
): { raw: string | null; date: Date | null } {
  for (const c of candidates) {
    if (c == null) continue;
    const trimmed = String(c).trim();
    if (!trimmed) continue;
    const iso = parseFlexibleDate(trimmed);
    if (!iso) continue;
    return { raw: iso, date: parseFechaLocal(iso) };
  }
  return { raw: null, date: null };
}

function evaluarFechaIso(
  fechaIso: string,
  ejercicioActual: number,
  now: Date
): { motivosIncidencia: string[]; esEjercicioAnterior: boolean } {
  const motivosIncidencia: string[] = [];
  const guardFailures = validateFechaEmision(fechaIso, { now });
  motivosIncidencia.push(...guardFailures.map((f) => f.message));

  const year = parseIsoDateParts(fechaIso)!.y;
  const esEjercicioAnterior = year < ejercicioActual;
  if (esEjercicioAnterior && guardFailures.length === 0) {
    motivosIncidencia.push(
      `Fecha de emisión antigua (${fechaIso}): ejercicio anterior al contable actual.`
    );
  }

  return { motivosIncidencia, esEjercicioAnterior };
}

/**
 * Evalúa la fecha contable del documento (mismas reglas que fiscal-guards + ejercicio anterior).
 * Si falta fecha de emisión pero hay vencimiento en ejercicio anterior, también genera incidencia.
 */
export function evaluarFechaContable(
  fechaEmisionRaw: string | null | undefined,
  opts?: { ejercicioActual?: number; now?: Date; fechaVencimientoRaw?: string | null }
): EvaluacionFechaContable {
  const ejercicioActual = opts?.ejercicioActual ?? new Date().getFullYear();
  const now = opts?.now ?? new Date();
  const picked = pickFechaContable(fechaEmisionRaw);
  const raw = picked.raw ?? '';
  const fechaAusente = !raw;

  let motivosIncidencia: string[] = [];
  let esEjercicioAnterior = false;

  if (raw) {
    const evalEmision = evaluarFechaIso(raw, ejercicioActual, now);
    motivosIncidencia = evalEmision.motivosIncidencia;
    esEjercicioAnterior = evalEmision.esEjercicioAnterior;
  } else {
    const vencPicked = pickFechaContable(opts?.fechaVencimientoRaw);
    if (vencPicked.raw) {
      const evalVenc = evaluarFechaIso(vencPicked.raw, ejercicioActual, now);
      if (evalVenc.esEjercicioAnterior || evalVenc.motivosIncidencia.length > 0) {
        esEjercicioAnterior = evalVenc.esEjercicioAnterior;
        motivosIncidencia = evalVenc.motivosIncidencia;
      }
    }
  }

  return {
    fechaAusente,
    esEjercicioAnterior,
    requiereConfirmacion: motivosIncidencia.length > 0 || fechaAusente,
    motivosIncidencia,
  };
}

export { FECHA_EMISION_MAX_PAST_YEARS };
