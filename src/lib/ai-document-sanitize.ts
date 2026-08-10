/**
 * Sanitización de documentos para contexto del agente IA.
 * Excluye credenciales, rutas internas y blobs JSON crudos innecesarios.
 */

import type { Document } from '@/lib/types';

const FISCAL_DATOS_EXTRA_KEYS = [
  'descuento_global',
  'base_no_sujeta',
  'retencion_irpf',
  'cif',
  'CLIENTE',
  'METADATOS',
  'EMPRESA_EMISORA',
] as const;

export function pickFiscalDatosExtra(datosExtra: unknown): Record<string, unknown> | null {
  if (!datosExtra || typeof datosExtra !== 'object') return null;
  const src = datosExtra as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of FISCAL_DATOS_EXTRA_KEYS) {
    if (src[key] !== undefined && src[key] !== null) {
      out[key] = src[key];
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export type AgentDocumentSummary = {
  id: number;
  numero_documento: string | null;
  tipo_documento: string;
  fecha_emision: string | null;
  fecha_vencimiento: string | null;
  base_imponible: number;
  iva: number;
  total: number;
  moneda: string;
  año_trimestre: number | null | undefined;
  num_trimestre: number | null | undefined;
  trimestre_cerrado: boolean;
  is_issued: boolean;
  is_new: boolean;
  incidencia: boolean;
  verificado: boolean;
  incidencia_razon: string | null | undefined;
  /** Motivos pendientes agrupados en un solo documento (salud + incidencias) */
  pendientes_detalle?: string[];
  empresa_id: number | null;
  empresa_nombre: string | undefined;
  empresa_cif: string | undefined;
  proveedor: string;
  cif: string;
  enviado_sii?: boolean;
  tiene_adjunto: boolean;
};

export type AgentEntity = {
  rol: string;
  nombre: string | null;
  identificador_fiscal: string | null;
  direccion: string | null;
  telefono: string | null;
  email: string | null;
  cuenta_contable: string | null;
};

export type AgentLine = {
  codigo: string | null;
  descripcion: string | null;
  cantidad: number;
  unidad: string | null;
  precio_unitario: number;
  descuento_porcentaje: number;
  precio_neto: number;
  importe_linea: number;
  cuenta_contable: string | null;
};

export type AgentDocumentFull = AgentDocumentSummary & {
  observaciones: string | null;
  fecha_creacion: string;
  datos_extra_fiscal: Record<string, unknown> | null;
  mismatch_amount?: number;
  entidades: AgentEntity[];
  lineas: AgentLine[];
  iva_details: Array<{
    tipo_impuesto: string | null | undefined;
    porcentaje: number;
    base_imponible: number;
    cuota: number;
  }>;
  incidencias: Array<{
    descripcion: string | null;
    validado: boolean;
    fecha_incidencia: string;
    observaciones_validacion?: string | null;
  }>;
  ai_incidencias: Array<{
    tipo: string;
    descripcion: string;
    severidad: string;
  }>;
  ai_suggestions: Array<{
    tipo: string | null;
    descripcion: string | null;
    severidad: string | null;
    sugerencia: string | null;
  }>;
  health_check: {
    verified: boolean;
    check_type: string;
    motivo: string | null;
  } | null;
  archivos: Array<{
    tipo_archivo: string | null;
    nombre_archivo: string | null;
  }>;
};

function toIsoDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

export function documentToSummary(
  doc: Document,
  extras?: { enviado_sii?: boolean; pendientes_detalle?: string[] },
): AgentDocumentSummary {
  return {
    id: doc.id_documento,
    numero_documento: doc.numero_documento,
    tipo_documento: doc.tipo_documento,
    fecha_emision: doc.fecha_emision,
    fecha_vencimiento: doc.fecha_vencimiento,
    base_imponible: doc.base_imponible,
    iva: doc.iva,
    total: doc.total,
    moneda: doc.moneda,
    año_trimestre: doc.año_trimestre,
    num_trimestre: doc.num_trimestre,
    trimestre_cerrado: Boolean(doc.trimestre_cerrado),
    is_issued: Boolean(doc.is_issued),
    is_new: Boolean(doc.is_new),
    incidencia: doc.incidencia,
    verificado: doc.verificado,
    incidencia_razon: doc.incidencia_razon,
    pendientes_detalle: extras?.pendientes_detalle,
    empresa_id: doc.empresa_id,
    empresa_nombre: doc.empresa_nombre,
    empresa_cif: doc.empresa_cif,
    proveedor: doc.proveedor,
    cif: doc.cif,
    enviado_sii: extras?.enviado_sii,
    tiene_adjunto: (doc.archivos?.length ?? 0) > 0,
  };
}

export function documentToFull(
  doc: Document,
  extras: {
    enviado_sii?: boolean;
    ai_incidencias?: Array<{ tipo: string; descripcion: string; severidad: string }>;
    ai_suggestions?: Array<{
      tipo: string | null;
      descripcion: string | null;
      severidad: string | null;
      sugerencia: string | null;
    }>;
    health_check?: { verified: boolean; check_type: string; motivo: string | null } | null;
  } = {},
): AgentDocumentFull {
  const summary = documentToSummary(doc, { enviado_sii: extras.enviado_sii });

  return {
    ...summary,
    observaciones: doc.observaciones,
    fecha_creacion: doc.fecha_creacion,
    datos_extra_fiscal: pickFiscalDatosExtra(doc.datos_extra),
    mismatch_amount: doc.mismatch_amount,
    entidades: (doc.entidades ?? []).map((e) => ({
      rol: e.rol,
      nombre: e.nombre,
      identificador_fiscal: e.identificador_fiscal,
      direccion: e.direccion,
      telefono: e.telefono,
      email: e.email,
      cuenta_contable: (e as { cuenta_contable?: string | null }).cuenta_contable ?? null,
    })),
    lineas: (doc.lineas ?? []).slice(0, 50).map((l) => ({
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      precio_unitario: l.precio_unitario,
      descuento_porcentaje: l.descuento_porcentaje,
      precio_neto: l.precio_neto,
      importe_linea: l.importe_linea,
      cuenta_contable: l.cuenta_contable ?? null,
    })),
    iva_details: (doc.iva_details ?? []).map((i) => ({
      tipo_impuesto: i.tipo_impuesto,
      porcentaje: i.porcentaje,
      base_imponible: i.base_imponible,
      cuota: i.cuota,
    })),
    incidencias: (doc.incidencias ?? []).map((i) => ({
      descripcion: i.descripcion,
      validado: i.validado,
      fecha_incidencia: i.fecha_incidencia,
      observaciones_validacion: (i as { observaciones_validacion?: string | null }).observaciones_validacion,
    })),
    ai_incidencias: extras.ai_incidencias ?? [],
    ai_suggestions: extras.ai_suggestions ?? [],
    health_check: extras.health_check ?? null,
    archivos: (doc.archivos ?? []).map((a) => ({
      tipo_archivo: a.tipo_archivo,
      nombre_archivo: a.nombre_archivo,
    })),
  };
}

export function truncateContextJson(data: unknown, maxChars = 12000): string {
  const json = JSON.stringify(data);
  if (json.length <= maxChars) return json;
  return json.slice(0, maxChars) + '…[truncado]';
}
