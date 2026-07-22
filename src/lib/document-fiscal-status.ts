/**
 * Contrato de estados fiscales del documento.
 * Persistido en documentos.datos_extra.fiscal_status (sin migración de schema).
 */

export const FiscalStatus = {
  RECIBIDO: 'RECIBIDO',
  VALIDADO: 'VALIDADO',
  REVISION: 'REVISION',
} as const;

export type FiscalStatusValue = (typeof FiscalStatus)[keyof typeof FiscalStatus];

export const FISCAL_STATUS_KEY = 'fiscal_status';
export const FISCAL_REVISION_REASONS_KEY = 'fiscal_revision_reasons';
export const FISCAL_GUARD_VERSION_KEY = 'fiscal_guard_version';

export const FISCAL_GUARD_VERSION = 1;

export function isFiscalmenteValido(datosExtra: unknown): boolean {
  if (!datosExtra || typeof datosExtra !== 'object') return true; // legacy sin flag = cuenta
  const status = (datosExtra as Record<string, unknown>)[FISCAL_STATUS_KEY];
  if (status === undefined || status === null) return true;
  return status === FiscalStatus.VALIDADO;
}

export function getFiscalStatus(datosExtra: unknown): FiscalStatusValue | null {
  if (!datosExtra || typeof datosExtra !== 'object') return null;
  const status = (datosExtra as Record<string, unknown>)[FISCAL_STATUS_KEY];
  if (status === FiscalStatus.VALIDADO || status === FiscalStatus.REVISION || status === FiscalStatus.RECIBIDO) {
    return status;
  }
  return null;
}
