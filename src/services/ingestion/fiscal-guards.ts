/**
 * Guards fiscales duros — puros y testeables.
 * Si fallan → documento en REVISION (excluido de agregados).
 * Si pasan → VALIDADO (puede haber incidencia "blanda" del extractor).
 */

import {
  DocumentoGemini,
  Impuesto,
  normalizeCIF,
  detectCountryFromCIF,
  detectTipoDocumento,
  validateMathBalance,
} from './normalize';
import {
  addYearsUtc,
  isValidIsoCalendarDate,
  parseIsoDateParts,
  utcToday,
} from './date-utils';
import { validateTicketLimits } from './ticket-validator';

export type FiscalGuardCode =
  | 'CIF_EMISOR_AUSENTE'
  | 'CIF_RECEPTOR_AUSENTE'
  | 'CIF_FORMATO_INVALIDO'
  | 'CIF_PROVEEDOR_EXTRANJERO_UE'
  | 'EMISOR_IGUAL_RECEPTOR'
  | 'MATH_BALANCE'
  | 'IVA_VS_BASE'
  | 'TIPO_INDETERMINADO'
  | 'DISCREPANCIA_CIF_DASHBOARD'
  | 'SIN_IMPORTES'
  | 'FECHA_CALENDARIO_INVALIDA'
  | 'FECHA_EMISION_FUTURA'
  | 'FECHA_EMISION_IMPLAUSIBLE'
  | 'TICKET_SUPERA_LIMITE_ABSOLUTO'
  | 'TICKET_SECTOR_NO_HABILITADO'
  | 'TICKET_MONEDA_NO_EUR'
  | 'TICKET_CATEGORIA_REVISAR';

export interface FiscalGuardFailure {
  code: FiscalGuardCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface FiscalGuardResult {
  ok: boolean;
  failures: FiscalGuardFailure[];
}

/** Fallos que un extract-repair dirigido puede corregir (Fase 3). El resto → REVISION. */
// MATH_BALANCE e IVA_VS_BASE excluidos: el LLM en modo repair tiende a inventar
// descuentos/ajustes para cuadrar la ecuación. Directo a REVISION es más seguro.
const REPAIRABLE_CODES: ReadonlySet<FiscalGuardCode> = new Set([
  'EMISOR_IGUAL_RECEPTOR',
]);

/** Años hacia atrás permitidos respecto a “hoy” (UTC). */
export const FECHA_EMISION_MAX_PAST_YEARS = 15;

export function isRepairableGuardFailure(failures: FiscalGuardFailure[]): boolean {
  if (!failures.length) return false;
  return failures.every((f) => REPAIRABLE_CODES.has(f.code));
}

const CIF_RE = /^[A-Z0-9]\d{7}[A-Z0-9]$|^[XYZ]\d{7}[A-Z]$|^\d{8}[A-Z]$/i;

function looksLikeSpanishTaxId(cif: string): boolean {
  if (cif.length !== 9) return false;
  return CIF_RE.test(cif) || /^[A-Z]\d{7}[A-Z0-9]$/i.test(cif);
}

function getImpuestos(doc: DocumentoGemini): Impuesto[] {
  const raw = doc.totales_por_impuesto || doc.desglose_iva || [];
  return Array.isArray(raw) ? (raw as Impuesto[]) : [];
}

function getImportes(doc: DocumentoGemini): { total: number; base: number; base_no_sujeta: number; descuento_global: number } {
  const nested = (doc as any).documento || {};
  const total = Number(nested.importe_total ?? doc.importe_total ?? 0);
  const base = Number(
    nested.importe_sin_iva ??
      nested.importe_sin_impuestos ??
      doc.importe_sin_iva ??
      doc.importe_sin_impuestos ??
      0
  );
  const base_no_sujeta = Number(nested.base_no_sujeta ?? doc.base_no_sujeta ?? 0);
  const descuento_global = Number(nested.descuento_global ?? doc.descuento_global ?? 0);
  return { total, base, base_no_sujeta, descuento_global };
}

function getFechaEmision(doc: DocumentoGemini): string {
  const nested = (doc as any).documento || {};
  const raw = nested.fecha_emision ?? doc.fecha_emision ?? '';
  return String(raw || '').trim().slice(0, 10);
}

/**
 * Valida fecha de emisión: calendario real, no futura, no absurda hacia atrás.
 * Fecha vacía: no falla aquí (otros flujos pueden exigirla).
 */
export function validateFechaEmision(
  fechaRaw: string,
  opts?: { now?: Date; maxPastYears?: number }
): FiscalGuardFailure[] {
  const fecha = String(fechaRaw || '').trim().slice(0, 10);
  if (!fecha) return [];

  if (!isValidIsoCalendarDate(fecha)) {
    return [
      {
        code: 'FECHA_CALENDARIO_INVALIDA',
        message: `Fecha de emisión inválida en calendario: ${fecha}`,
        details: { fecha },
      },
    ];
  }

  const parts = parseIsoDateParts(fecha)!;
  const emision = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  const today = utcToday(opts?.now ?? new Date());
  const maxPastYears = opts?.maxPastYears ?? FECHA_EMISION_MAX_PAST_YEARS;

  if (emision.getTime() > today.getTime()) {
    return [
      {
        code: 'FECHA_EMISION_FUTURA',
        message: `Fecha de emisión futura no permitida: ${fecha}`,
        details: { fecha, hoy: today.toISOString().slice(0, 10) },
      },
    ];
  }

  const minDate = addYearsUtc(today, -maxPastYears);
  if (emision.getTime() < minDate.getTime()) {
    return [
      {
        code: 'FECHA_EMISION_IMPLAUSIBLE',
        message: `Fecha de emisión demasiado antigua (${fecha}, máximo ${maxPastYears} años)`,
        details: {
          fecha,
          min: minDate.toISOString().slice(0, 10),
          maxPastYears,
        },
      },
    ];
  }

  return [];
}

/**
 * Valida que cada cuota de IVA (no retención) cuadre con base × porcentaje.
 * Tolerancia 0.05€ por línea (redondeo por línea).
 */
function validateIvaVsBase(impuestos: Impuesto[], toleranciaLinea = 0.05): FiscalGuardFailure[] {
  const failures: FiscalGuardFailure[] = [];
  for (const imp of impuestos) {
    const tipo = String(imp.tipo_iva ?? '').toUpperCase();
    if (tipo.includes('RET') || tipo === 'IRPF' || tipo.includes('RECARGO')) continue;
    const pct = Number(imp.porcentaje ?? imp.porcentaje_iva ?? 0);
    const base = Number(imp.base_imponible ?? 0);
    const cuota = Number(imp.cuota_iva ?? 0);
    if (pct <= 0 || base === 0) continue;
    const expected = Math.round(base * (pct / 100) * 100) / 100;
    const diff = Math.abs(Math.abs(cuota) - Math.abs(expected));
    if (diff > toleranciaLinea) {
      failures.push({
        code: 'IVA_VS_BASE',
        message: `IVA ${pct}% no cuadra con su base (${base} → esperado ${expected}, got ${cuota})`,
        details: { pct, base, cuota, expected, diff },
      });
    }
  }
  return failures;
}

export function runFiscalGuards(
  doc: DocumentoGemini,
  opts?: {
    empresaCif?: string | null;
    requireClassification?: boolean;
    now?: Date;
    maxPastYears?: number;
  }
): FiscalGuardResult {
  const failures: FiscalGuardFailure[] = [];
  const emisor = doc.empresa_emisora || {};
  const receptor = doc.cliente || doc.empresa_receptora || {};
  // detectCountryFromCIF corre sobre el CIF crudo (antes de normalizeCIF) para preservar prefijos de país
  const countryInfo = detectCountryFromCIF(emisor.cif);
  const cifEmisor = normalizeCIF(emisor.cif);
  const cifReceptor = normalizeCIF(receptor.cif);
  const { total, base, base_no_sujeta, descuento_global } = getImportes(doc);
  const impuestos = getImpuestos(doc);
  const tipoInfo = detectTipoDocumento(doc.tipo_documento);

  if (!Number.isFinite(total) || !Number.isFinite(base) || (total === 0 && base === 0 && impuestos.length === 0)) {
    failures.push({
      code: 'SIN_IMPORTES',
      message: 'Documento sin importes ni desglose fiscal utilizable',
    });
  }

  // Tickets: receptor puede faltar. Facturas: exigir al menos un CIF de contraparte según tipo.
  const tipo = String(doc.tipo_documento ?? '').toUpperCase();
  const esTicket = tipo.includes('TICKET');

  if (!cifEmisor && !esTicket) {
    failures.push({ code: 'CIF_EMISOR_AUSENTE', message: 'CIF del emisor ausente' });
  } else if (cifEmisor && !looksLikeSpanishTaxId(cifEmisor)) {
    if (countryInfo.isForeign) {
      // CIF de proveedor UE/EEUU — formato válido para su país, incidencia informativa no bloqueante
      failures.push({
        code: 'CIF_PROVEEDOR_EXTRANJERO_UE',
        message: `Proveedor extranjero (${countryInfo.countryName || countryInfo.countryCode}): IVA no deducible en España`,
        details: { cif: cifEmisor, countryCode: countryInfo.countryCode, countryName: countryInfo.countryName },
      });
    } else if (!esTicket) {
      // Tickets: el NIF del emisor puede ser un código interno del TPV, fecha, o formato no estándar.
      // No se considera incidencia bloqueante — el gasto ya es deducible con el ticket físico.
      failures.push({
        code: 'CIF_FORMATO_INVALIDO',
        message: `CIF emisor con formato inválido: ${cifEmisor}`,
        details: { cif: cifEmisor },
      });
    }
  }

  if (!esTicket && tipoInfo.esEmitida && !cifReceptor) {
    failures.push({ code: 'CIF_RECEPTOR_AUSENTE', message: 'CIF del receptor/cliente ausente en factura emitida' });
  } else if (!esTicket && cifReceptor && !looksLikeSpanishTaxId(cifReceptor)) {
    // Tickets: el CIF del receptor (empresa) tampoco suele ser validable desde el ticket físico.
    failures.push({
      code: 'CIF_FORMATO_INVALIDO',
      message: `CIF receptor con formato inválido: ${cifReceptor}`,
      details: { cif: cifReceptor },
    });
  }

  if (cifEmisor && cifReceptor && cifEmisor === cifReceptor) {
    failures.push({
      code: 'EMISOR_IGUAL_RECEPTOR',
      message: 'Emisor y receptor tienen el mismo CIF — documento inválido',
      details: { cif: cifEmisor },
    });
  }

  // ── Validación de límites fiscales para tickets (RD 1619/2012 y Art. 96/97 LIVA) ──
  if (esTicket) {
    const nested = (doc as any).documento || {};
    const categoriaOperacion = (doc as any).categoria_operacion ?? nested.categoria_operacion ?? null;
    const categoriaConfianza = Number(
      (doc as any).categoria_operacion_confianza ?? nested.categoria_operacion_confianza ?? 1
    );
    const moneda = (doc as any).moneda ?? nested.moneda ?? 'EUR';
    const esRectificativa = Boolean(doc.es_abono || tipo.includes('ABONO') || tipo.includes('RECTIFICATIVA'));
    const tieneNifReceptor = Boolean(cifReceptor && cifReceptor.length > 0);
    const tieneCuotaDesglosada = impuestos.some((i) => Number(i.cuota_iva ?? 0) > 0);

    const ticketResult = validateTicketLimits({
      importeTotal: total,
      categoriaOperacion,
      categoriaConfianza,
      moneda,
      tieneNifReceptor,
      tieneCuotaDesglosada,
      esFacturaRectificativa: esRectificativa,
    });

    (doc as any).iva_deducible = ticketResult.iva_deducible;

    if (ticketResult.status !== 'valido') {
      failures.push({
        code: ticketResult.guardCode || 'TICKET_CATEGORIA_REVISAR',
        message: ticketResult.motivo,
        details: {
          status: ticketResult.status,
          nivel: ticketResult.nivel,
          categoriaOperacion,
          categoriaConfianza,
          iva_deducible: ticketResult.iva_deducible,
        },
      });
    }
  }

  if (!esTicket && opts?.empresaCif) {
    const empresaCif = normalizeCIF(opts.empresaCif);
    
    if (tipoInfo.esEmitida && cifEmisor !== empresaCif) {
      failures.push({
        code: 'DISCREPANCIA_CIF_DASHBOARD',
        message: `Factura Emitida pero CIF Emisor (${cifEmisor || 'vacío'}) no coincide con Dashboard (${empresaCif})`,
      });
    } else if (tipoInfo.esRecibida && cifReceptor !== empresaCif) {
      failures.push({
        code: 'DISCREPANCIA_CIF_DASHBOARD',
        message: `Factura Recibida pero CIF Receptor (${cifReceptor || 'vacío'}) no coincide con Dashboard (${empresaCif})`,
      });
    } else if (opts?.requireClassification !== false && tipoInfo.esIndeterminado) {
      // Si no fue clasificada ni como emitida ni como recibida, y ninguno de los CIFs coincide
      const matchEmpresa = (empresaCif && cifEmisor === empresaCif) || (empresaCif && cifReceptor === empresaCif);
      if (!matchEmpresa) {
        failures.push({
          code: 'TIPO_INDETERMINADO',
          message: 'No se pudo clasificar emitida/recibida respecto a la empresa',
        });
      }
    }
  }

  failures.push(
    ...validateFechaEmision(getFechaEmision(doc), {
      now: opts?.now,
      maxPastYears: opts?.maxPastYears,
    })
  );

  const impuestosBalance = (esTicket && !(doc as any).iva_deducible && base === total)
    ? []
    : impuestos;

  if (impuestosBalance.length > 0 || (total !== 0 && base !== 0)) {
    const math = validateMathBalance(total, base, impuestosBalance, 0.05, base_no_sujeta, descuento_global);
    // tolerancia un poco más holgada en guard duro global
    const mathLoose = validateMathBalance(total, base, impuestosBalance, 0.5, base_no_sujeta, descuento_global);
    if (!mathLoose.ok) {
      failures.push({
        code: 'MATH_BALANCE',
        message: `Totales no cuadran (diff ${math.diferencia}€)`,
        details: { diferencia: math.diferencia, total, base },
      });
    }
  }

  // CIF_PROVEEDOR_EXTRANJERO_UE es informativo — no bloquea el flujo normal del documento
  const blockingFailures = failures.filter(f => f.code !== 'CIF_PROVEEDOR_EXTRANJERO_UE');
  return { ok: blockingFailures.length === 0, failures };
}

export function formatGuardFailures(failures: FiscalGuardFailure[]): string {
  return failures.map((f) => `[${f.code}] ${f.message}`).join(' | ');
}
