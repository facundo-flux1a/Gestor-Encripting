import { normalizeCIF } from './utils';
import { PreSaveIssue, FieldChange } from './types';

export interface CheckTipoMismatchInput {
  tipoDocumento?: string | null;
  total?: number | null;
  entidades?: Array<{
    rol?: string | null;
    identificador_fiscal?: string | null;
  }> | null;
  empresaCIF?: string | null;
  empresaNombre?: string | null;
  cif?: string | null;
  clienteCIF?: string | null;
}

export function checkTipoMismatch(input: CheckTipoMismatchInput): PreSaveIssue | null {
  const normEmpresa = normalizeCIF(input.empresaCIF);
  if (!normEmpresa) return null;

  const entidades = input.entidades || [];
  const emisorEnt = entidades.find(
    e => (e.rol || '').toLowerCase() === 'emisor' || (e.rol || '').toLowerCase() === 'proveedor'
  );
  const receptorEnt = entidades.find(
    e => (e.rol || '').toLowerCase() === 'receptor' || (e.rol || '').toLowerCase() === 'cliente'
  );

  const normEmisor = normalizeCIF(emisorEnt?.identificador_fiscal || input.cif);
  const normReceptor = normalizeCIF(receptorEnt?.identificador_fiscal || input.clienteCIF);

  if (!normEmisor && !normReceptor) return null;

  let expectedType: string | null = null;
  const currentTipo = (input.tipoDocumento || '').toUpperCase();
  const isAbono =
    (input.total ?? 0) < 0 ||
    currentTipo.includes('ABONO') ||
    currentTipo.includes('RECTIFICATIVA');

  if (normEmisor === normEmpresa) {
    expectedType = isAbono ? 'NOTA DE CRÉDITO EMITIDA' : 'FACTURA EMITIDA';
  } else if (normReceptor === normEmpresa) {
    expectedType = isAbono ? 'NOTA DE CRÉDITO RECIBIDA' : 'FACTURA RECIBIDA';
  }

  if (expectedType && currentTipo !== expectedType) {
    const roleLabel = normEmisor === normEmpresa ? 'EMISOR' : 'RECEPTOR';
    const empName = input.empresaNombre ? ` (${input.empresaNombre})` : '';
    return {
      type: 'TIPO_MISMATCH',
      title: 'Conflicto de Tipo de Documento',
      description: `La empresa propia${empName} figura como ${roleLabel} de las entidades. El documento actualmente figura como "${input.tipoDocumento || ''}", pero por regla fiscal debe corregirse a "${expectedType}".`,
      blocking: true,
      suggestedValue: expectedType,
      currentValue: input.tipoDocumento || '',
    };
  }

  return null;
}

export interface CheckMathBalanceInput {
  total?: number | null;
  baseImponible?: number | null;
  ivaDetails?: Array<{
    tipo_impuesto?: string | null;
    cuota?: number | null;
  }> | null;
}

// Kept for unit tests and legacy use. In the editing flow, use checkFieldChanges instead.
export function checkMathBalance(input: CheckMathBalanceInput): PreSaveIssue | null {
  const declaredTotal = Number(input.total ?? 0);
  const base = Number(input.baseImponible ?? 0);
  const ivaDetails = input.ivaDetails || [];

  const totalIva = ivaDetails.reduce((sum, item) => {
    const isRet = (item.tipo_impuesto || '').toLowerCase().includes('retencion');
    return isRet ? sum : sum + Number(item.cuota || 0);
  }, 0);

  const totalRet = ivaDetails.reduce((sum, item) => {
    const isRet = (item.tipo_impuesto || '').toLowerCase().includes('retencion');
    return isRet ? sum + Math.abs(Number(item.cuota || 0)) : sum;
  }, 0);

  const calculatedTotal = base + totalIva - totalRet;
  const mathDiff = Math.abs(declaredTotal - calculatedTotal);

  if (mathDiff > 0.05) {
    return {
      type: 'MATH_MISMATCH',
      title: 'Descuadre en Totales del Documento',
      description: `El total declarado (${declaredTotal.toFixed(2)} €) no coincide con la suma de la base e impuestos (${calculatedTotal.toFixed(2)} €). Diferencia: ${mathDiff.toFixed(2)} €.`,
      blocking: false,
    };
  }

  return null;
}

// ── Formatters (pure, no DOM deps) ────────────────────────────────────────
function fmtNum(v: number | null | undefined): string {
  if (v == null) return '—';
  return `${v.toFixed(2)} €`;
}
function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}
function fmtStr(s: string | null | undefined): string {
  return s?.trim() || '—';
}
function numChanged(a: number | null | undefined, b: number | null | undefined, threshold = 0.005): boolean {
  return Math.abs((a ?? 0) - (b ?? 0)) > threshold;
}
function strChanged(a: string | null | undefined, b: string | null | undefined): boolean {
  return (a ?? '').trim() !== (b ?? '').trim();
}

// ── checkFieldChanges ─────────────────────────────────────────────────────
export interface FieldSnapshot {
  numero_documento?: string | null;
  fecha_emision?: string | null;
  fecha_vencimiento?: string | null;
  tipo_documento?: string | null;
  base_imponible?: number | null;
  total?: number | null;
  iva_cuotas_sum?: number | null;
  cif?: string | null;
  proveedor?: string | null;
  cliente_cif?: string | null;
  cliente_nombre?: string | null;
  moneda?: string | null;
  observaciones?: string | null;
}

export function checkFieldChanges(original: FieldSnapshot, proposed: FieldSnapshot): PreSaveIssue | null {
  const changes: FieldChange[] = [];

  if (strChanged(original.numero_documento, proposed.numero_documento))
    changes.push({ label: 'Nº Documento', before: fmtStr(original.numero_documento), after: fmtStr(proposed.numero_documento) });

  if (strChanged(original.fecha_emision, proposed.fecha_emision))
    changes.push({ label: 'Fecha Emisión', before: fmtDate(original.fecha_emision), after: fmtDate(proposed.fecha_emision) });

  if (strChanged(original.fecha_vencimiento, proposed.fecha_vencimiento))
    changes.push({ label: 'Fecha Vencimiento', before: fmtDate(original.fecha_vencimiento), after: fmtDate(proposed.fecha_vencimiento) });

  if (strChanged(original.tipo_documento, proposed.tipo_documento))
    changes.push({ label: 'Tipo Documento', before: fmtStr(original.tipo_documento), after: fmtStr(proposed.tipo_documento) });

  if (numChanged(original.base_imponible, proposed.base_imponible))
    changes.push({ label: 'Base Imponible', before: fmtNum(original.base_imponible), after: fmtNum(proposed.base_imponible) });

  if (numChanged(original.iva_cuotas_sum, proposed.iva_cuotas_sum))
    changes.push({ label: 'Suma Cuotas IVA', before: fmtNum(original.iva_cuotas_sum), after: fmtNum(proposed.iva_cuotas_sum) });

  if (numChanged(original.total, proposed.total))
    changes.push({ label: 'Total', before: fmtNum(original.total), after: fmtNum(proposed.total) });

  if (strChanged(original.proveedor, proposed.proveedor))
    changes.push({ label: 'Proveedor', before: fmtStr(original.proveedor), after: fmtStr(proposed.proveedor) });

  if (strChanged(original.cif, proposed.cif))
    changes.push({ label: 'CIF Proveedor', before: fmtStr(original.cif), after: fmtStr(proposed.cif) });

  if (strChanged(original.cliente_nombre, proposed.cliente_nombre))
    changes.push({ label: 'Cliente', before: fmtStr(original.cliente_nombre), after: fmtStr(proposed.cliente_nombre) });

  if (strChanged(original.cliente_cif, proposed.cliente_cif))
    changes.push({ label: 'CIF Cliente', before: fmtStr(original.cliente_cif), after: fmtStr(proposed.cliente_cif) });

  if (strChanged(original.moneda, proposed.moneda))
    changes.push({ label: 'Moneda', before: fmtStr(original.moneda), after: fmtStr(proposed.moneda) });

  if (strChanged(original.observaciones, proposed.observaciones))
    changes.push({ label: 'Observaciones', before: fmtStr(original.observaciones), after: fmtStr(proposed.observaciones) });

  if (changes.length === 0) return null;

  return {
    type: 'CHANGES_REVIEW',
    title: 'Revisión de Cambios',
    description: `${changes.length} campo${changes.length > 1 ? 's' : ''} modificado${changes.length > 1 ? 's' : ''}. Revisá los valores antes de confirmar el guardado.`,
    blocking: true,
    changedFields: changes,
  };
}
