/**
 * Capa de acceso seguro a documentos para el agente IA.
 * Toda consulta exige userId de sesión y filtra por membership en empresas.
 */

import { prisma } from '@/lib/prisma';
import { getSelectedCompanies } from '@/lib/upstash';
import { resolveEffectiveEmpresaIds } from '@/lib/empresa-access';
import {
  getHealthCheckAnalytics,
  getIncidentsAnalytics,
} from '@/services/document-service';
import {
  documentToFull,
  documentToSummary,
  type AgentDocumentFull,
  type AgentDocumentSummary,
} from '@/lib/ai-document-sanitize';
import { getDocumentByIdForUser } from '@/services/document-service';
import type { Document } from '@/lib/types';

const MAX_LIST_RESULTS = 10;
const MAX_SECURITY_LIST = 25;

export type AgentDocumentScope = {
  userId: number;
  allowedEmpresaIds: number[];
  effectiveEmpresaIds: number[];
  empresas: Array<{ id: number; nombre: string | null; cif: string | null }>;
};

export type ListDocumentsFilters = {
  trimestre?: number;
  año?: number;
  tipo?: 'emitidas' | 'recibidas' | 'todas';
  proveedor?: string;
  numero?: string;
  limit?: number;
  solo_incidencias_pendientes?: boolean;
};

export type QuarterSummary = {
  año: number;
  trimestre: number;
  empresa_ids: number[];
  total_documentos: number;
  total_ingresos: number;
  total_gastos: number;
  iva_repercutido: number;
  iva_soportado: number;
  trimestre_cerrado: boolean;
};

export type SecurityCenterSummary = {
  empresas_consultadas: number[];
  /** Documentos únicos que requieren revisión (unión, no suma) */
  documentos_pendientes: number;
  /** Coincide con la tarjeta "Descuadres" del Centro de Seguridad */
  descuadres_matematicos: number;
  /** Coincide con "Alertas Lógicas" */
  alertas_logicas: number;
  /** Registros de incidencia abiertos (puede haber varios por documento) */
  registros_incidencias_abiertas: number;
  /** Documentos distintos con al menos una incidencia abierta */
  documentos_con_incidencia: number;
  /** Documentos en el listado de salud (descuadres + alertas lógicas) */
  documentos_con_alerta_salud: number;
  /** Documentos que tienen incidencia Y alerta de salud a la vez */
  documentos_con_ambos: number;
  documentos: AgentDocumentSummary[];
  documentos_listados: number;
  limite_listado: number;
};

const DOCUMENT_ROWS_INCLUDE = {
  empresas: { select: { nombre_de_empresa: true, CIF: true, cif_hash: true } },
  entidades_documento: {
    where: { rol: { in: ['emisor', 'proveedor', 'receptor', 'cliente'] as const } },
    select: { rol: true, nombre: true, identificador_fiscal: true, identificador_fiscal_hash: true },
  },
  archivos_documento: { select: { id: true }, take: 1 },
  incidencias_documento: {
    where: { validado: false },
    orderBy: { fecha_incidencia: 'desc' as const },
    take: 10,
    select: { descripcion: true, validado: true },
  },
} as const;

type DocumentRowWithHealth = Record<string, unknown> & {
  _healthPending?: { check_type: string | null; motivo: string | null } | null;
};

function formatHealthPendingLabel(health: {
  check_type?: string | null;
  motivo?: string | null;
}): string {
  if (health.motivo?.trim()) return health.motivo.trim();
  switch (health.check_type) {
    case 'FECHA_ANOMALA':
      return 'Alerta lógica: fecha anómala';
    case 'ENTIDAD_DUPLICADA':
      return 'Alerta lógica: entidad duplicada';
    case 'MISMATCH_MATEMATICO':
      return 'Descuadre matemático';
    default:
      return health.check_type
        ? `Alerta de salud (${health.check_type})`
        : 'Alerta de salud pendiente';
  }
}

function buildPendingIssuesForDocument(
  openIncidencias: Array<{ descripcion: string | null; validado: boolean }>,
  health: { check_type?: string | null; motivo?: string | null } | null | undefined,
): string[] {
  const detalle: string[] = [];
  if (health) {
    detalle.push(formatHealthPendingLabel(health));
  }
  for (const inc of openIncidencias) {
    const text = inc.descripcion?.trim();
    if (text && !detalle.includes(text)) {
      detalle.push(text);
    }
  }
  return detalle;
}

function mapPendingRowToSummary(d: Record<string, unknown>): AgentDocumentSummary {
  const { doc, enviado_sii } = mapRowToDocumentLike(d as Parameters<typeof mapRowToDocumentLike>[0]);
  const openIncidencias = ((d.incidencias_documento as Array<{ descripcion: string | null; validado: boolean }>) ?? []).filter(
    (inc) => !inc.validado,
  );
  const health = d._healthPending as { check_type?: string | null; motivo?: string | null } | null;
  const pendientesDetalle = buildPendingIssuesForDocument(openIncidencias, health);

  if (pendientesDetalle.length > 0) {
    doc.incidencia = true;
    doc.verificado = false;
    doc.incidencia_razon = pendientesDetalle.join(' · ');
  }

  return documentToSummary(doc, {
    enviado_sii,
    pendientes_detalle: pendientesDetalle.length > 0 ? pendientesDetalle : undefined,
  });
}

async function fetchPendingDocumentSummaries(
  scope: AgentDocumentScope,
  pendingIds: number[],
  limit: number,
): Promise<AgentDocumentSummary[]> {
  if (pendingIds.length === 0 || limit <= 0) return [];

  const healthStatuses = await prisma.health_check_status.findMany({
    where: { verified: false, documento_id: { in: pendingIds } },
    select: { documento_id: true, check_type: true, motivo: true },
  });
  const healthByDocId = new Map(
    healthStatuses.map((h: { documento_id: number; check_type: string | null; motivo: string | null }) => [
      Number(h.documento_id),
      { check_type: h.check_type, motivo: h.motivo },
    ]),
  );

  const rows = await prisma.documentos.findMany({
    where: {
      id: { in: pendingIds.map((id) => BigInt(id)) },
      id_de_empresa: { in: scope.effectiveEmpresaIds.map((id) => BigInt(id)) },
      empresas: { id_de_usuario: { array_contains: scope.userId } },
    } as any,
    orderBy: { fecha_emision: 'desc' },
    take: limit,
    include: DOCUMENT_ROWS_INCLUDE,
  });

  return rows.map((row) =>
    mapPendingRowToSummary({
      ...row,
      _healthPending: healthByDocId.get(Number(row.id)) ?? null,
    }),
  );
}

function computeIsIssued(
  empresaCif: string | null | undefined,
  entidades: Array<{ rol: string; identificador_fiscal: string | null; identificador_fiscal_hash?: string | null }>,
  empresaCifHash?: string | null,
): boolean {
  const cifNorm = (empresaCif || '').trim().toLowerCase();
  const hashNorm = empresaCifHash || '';
  // IMPORTANTE: solo mirar rol 'emisor' o 'proveedor', igual que el SQL:
  // WHEN ed2.rol IN('emisor', 'proveedor') AND COALESCE(ed2.identificador_fiscal_hash, ed2.identificador_fiscal) IN(?,?)
  // Si se incluye el receptor (= la propia empresa en facturas recibidas), todas aparecerían como emitidas.
  const emisores = entidades.filter((ed) => ed.rol === 'emisor' || ed.rol === 'proveedor');
  return emisores.some((ed) => {
    const fiscalHash = ed.identificador_fiscal_hash || '';
    const fiscal = (ed.identificador_fiscal || '').trim().toLowerCase();
    // El hash de la entidad coincide con el hash de la empresa
    if (hashNorm && fiscalHash && fiscalHash === hashNorm) return true;
    // El CIF en texto plano de la entidad coincide con el CIF de la empresa
    if (cifNorm && fiscal && fiscal === cifNorm) return true;
    return false;
  });
}

function mapRowToDocumentLike(
  d: {
    id: bigint;
    tipo_documento: string | null;
    numero_documento: string | null;
    fecha_emision: Date | null;
    fecha_vencimiento: Date | null;
    importe_total: unknown;
    importe_sin_impuestos: unknown;
    moneda: string | null;
    observaciones: string | null;
    datos_extra: unknown;
    fecha_creacion: Date | null;
    id_de_empresa: bigint | null;
    is_new: number | null;
    trimestre_cerrado: boolean | null;
    año_trimestre: number | null;
    num_trimestre: number | null;
    enviado_sii?: boolean | null;
    empresas?: { nombre_de_empresa: string | null; CIF: string | null; cif_hash?: string | null } | null;
    entidades_documento?: Array<{
      rol: string;
      nombre: string | null;
      identificador_fiscal: string | null;
      identificador_fiscal_hash?: string | null;
    }>;
    archivos_documento?: Array<{ id: bigint }>;
  },
): { doc: Document; enviado_sii?: boolean } {
  const entidades = d.entidades_documento ?? [];
  const emisor = entidades.find((e) => e.rol === 'emisor' || e.rol === 'proveedor');
  const isIssued = computeIsIssued(d.empresas?.CIF, entidades, d.empresas?.cif_hash);

  const importeTotal = Number(d.importe_total) || 0;
  const base = Number(d.importe_sin_impuestos) || 0;

  const doc: Document = {
    id_documento: Number(d.id),
    numero_documento: d.numero_documento,
    tipo_documento: d.tipo_documento || '',
    fecha_emision: d.fecha_emision ? String(d.fecha_emision).slice(0, 10) : null,
    fecha_vencimiento: d.fecha_vencimiento ? String(d.fecha_vencimiento).slice(0, 10) : null,
    fecha_creacion: d.fecha_creacion ? String(d.fecha_creacion) : '',
    moneda: d.moneda || 'EUR',
    observaciones: d.observaciones,
    datos_extra: d.datos_extra,
    base_imponible: base,
    iva: Math.max(0, importeTotal - base),
    total: importeTotal,
    is_new: d.is_new ?? 0,
    entidades: [],
    lineas: [],
    iva_details: [],
    archivos: (d.archivos_documento ?? []).map(() => ({ tipo_archivo: 'pdf', nombre_archivo: null, ruta_archivo: null, hash_archivo: null, fecha_subida: null })),
    incidencias: [],
    proveedor: emisor?.nombre || 'N/A',
    cif: emisor?.identificador_fiscal || 'N/A',
    incidencia: false,
    verificado: true,
    empresa_id: d.id_de_empresa != null ? Number(d.id_de_empresa) : null,
    empresa_nombre: d.empresas?.nombre_de_empresa ?? undefined,
    empresa_cif: d.empresas?.CIF ?? undefined,
    año_trimestre: d.año_trimestre ?? undefined,
    num_trimestre: d.num_trimestre ?? undefined,
    trimestre_cerrado: d.trimestre_cerrado ? 1 : 0,
    is_issued: isIssued ? 1 : 0,
  };

  return { doc, enviado_sii: d.enviado_sii ?? undefined };
}

export async function resolveAgentScope(userId: number): Promise<AgentDocumentScope | null> {
  const empresas = await prisma.empresas.findMany({
    where: { id_de_usuario: { array_contains: userId } },
    select: { id: true, nombre_de_empresa: true, CIF: true },
  });

  if (empresas.length === 0) return null;

  const allowedEmpresaIds = empresas.map((e: any) => Number(e.id));
  const selected = await getSelectedCompanies(userId);
  const effectiveEmpresaIds = resolveEffectiveEmpresaIds(allowedEmpresaIds, selected);

  return {
    userId,
    allowedEmpresaIds,
    effectiveEmpresaIds,
    empresas: empresas.map((e: any) => ({
      id: Number(e.id),
      nombre: e.nombre_de_empresa,
      cif: e.CIF,
    })),
  };
}

function buildDocumentWhere(scope: AgentDocumentScope, filters: ListDocumentsFilters) {
  const limit = Math.min(filters.limit ?? MAX_LIST_RESULTS, MAX_LIST_RESULTS);

  // NOTA: tipo_documento y health_check_status se filtran post-query en JS (case-insensitive).
  // incidencias_documento: el include los trae para filtrar post-query.
  const where: Record<string, unknown> = {
    id_de_empresa: { in: scope.effectiveEmpresaIds.map((id) => BigInt(id)) },
    empresas: { id_de_usuario: { array_contains: scope.userId } },
  };

  if (filters.trimestre != null) where.num_trimestre = filters.trimestre;
  if (filters.año != null) where.año_trimestre = filters.año;
  if (filters.numero?.trim()) {
    where.numero_documento = { contains: filters.numero.trim() };
  }

  return { where, limit, soloIncidencias: filters.solo_incidencias_pendientes ?? false };
}

function applyStandardDocumentFilters(
  docs: DocumentRowWithHealth[],
  filters: ListDocumentsFilters,
  blockedIds: Set<number>,
  options?: { soloIncidencias?: boolean },
) {
  let result = docs;

  if (!options?.soloIncidencias) {
    result = result.filter((d: any) => {
      const tipo = (d.tipo_documento || '').toLowerCase();
      if (tipo.includes('(sin confirmar)')) return false;
      return (
        tipo.includes('factura') ||
        tipo.includes('abono') ||
        tipo.includes('crédito') ||
        tipo.includes('credito')
      );
    });
  }

  if (!options?.soloIncidencias && blockedIds.size > 0) {
    result = result.filter((d: any) => !blockedIds.has(Number(d.id)));
  }

  if (options?.soloIncidencias) {
    result = result.filter(
      (d: any) =>
        (d.incidencias_documento?.length ?? 0) > 0 || Boolean(d._healthPending),
    );
  }

  if (filters.proveedor?.trim()) {
    const q = filters.proveedor.trim().toLowerCase();
    result = result.filter((d: any) =>
      d.entidades_documento.some((e: any) => (e.nombre || '').toLowerCase().includes(q)),
    );
  }

  if (filters.tipo === 'emitidas') {
    result = result.filter((d: any) =>
      computeIsIssued(d.empresas?.CIF, d.entidades_documento, d.empresas?.cif_hash),
    );
  } else if (filters.tipo === 'recibidas') {
    result = result.filter(
      (d: any) => !computeIsIssued(d.empresas?.CIF, d.entidades_documento, d.empresas?.cif_hash),
    );
  }

  return result;
}

/** Documentos pendientes en Centro de Seguridad: incidencias + descuadres (health check). */
async function fetchPendingSecurityIssues(
  scope: AgentDocumentScope,
  filters: ListDocumentsFilters,
  limit: number,
) {
  const baseWhere: Record<string, unknown> = {
    id_de_empresa: { in: scope.effectiveEmpresaIds.map((id) => BigInt(id)) },
    empresas: { id_de_usuario: { array_contains: scope.userId } },
  };
  if (filters.trimestre != null) baseWhere.num_trimestre = filters.trimestre;
  if (filters.año != null) baseWhere.año_trimestre = filters.año;
  if (filters.numero?.trim()) {
    baseWhere.numero_documento = { contains: filters.numero.trim() };
  }

  const healthStatuses = await prisma.health_check_status.findMany({
    where: { verified: false },
    select: { documento_id: true, check_type: true, motivo: true },
  });
  const healthByDocId = new Map<number, { check_type: string | null; motivo: string | null }>(
    healthStatuses.map((h: { documento_id: number; check_type: string | null; motivo: string | null }) => [
      Number(h.documento_id),
      { check_type: h.check_type, motivo: h.motivo },
    ]),
  );
  const healthDocIds = [...healthByDocId.keys()];

  const [byIncidencia, byHealth] = await Promise.all([
    prisma.documentos.findMany({
      where: {
        ...baseWhere,
        incidencias_documento: { some: { validado: false } },
      } as any,
      orderBy: { fecha_emision: 'desc' },
      take: limit * 3,
      include: DOCUMENT_ROWS_INCLUDE,
    }),
    healthDocIds.length > 0
      ? prisma.documentos.findMany({
          where: {
            ...baseWhere,
            id: { in: healthDocIds.map((id) => BigInt(id)) },
          } as any,
          orderBy: { fecha_emision: 'desc' },
          take: limit * 3,
          include: DOCUMENT_ROWS_INCLUDE,
        })
      : Promise.resolve([]),
  ]);

  const seen = new Set<string>();
  const merged: DocumentRowWithHealth[] = [];
  for (const doc of [...byIncidencia, ...byHealth]) {
    const key = String(doc.id);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...doc,
      _healthPending: healthByDocId.get(Number(doc.id)) ?? null,
    });
  }

  return applyStandardDocumentFilters(merged, filters, new Set(), { soloIncidencias: true }).slice(
    0,
    limit,
  );
}

async function fetchDocumentRows(scope: AgentDocumentScope, filters: ListDocumentsFilters) {
  const { where, limit, soloIncidencias } = buildDocumentWhere(scope, filters);

  if (soloIncidencias) {
    const pending = await fetchPendingSecurityIssues(scope, filters, limit);
    console.log('[ai-access-gate] fetchPendingSecurityIssues:', {
      empresaIds: scope.effectiveEmpresaIds,
      count: pending.length,
    });
    return pending;
  }

  // IDs bloqueados por health_check fallido — no hay @relation en el schema de Prisma.
  const blockedByHealthCheck = await prisma.health_check_status.findMany({
    where: { verified: false },
    select: { documento_id: true },
  });
  const blockedIds = new Set<number>(
    blockedByHealthCheck.map((r: { documento_id: number }) => Number(r.documento_id)),
  );

  let docs = await prisma.documentos.findMany({
    where: where as any,
    orderBy: { fecha_emision: 'desc' },
    take: limit * 5, // traemos más para compensar los filtros post-query
    include: DOCUMENT_ROWS_INCLUDE,
  });

  // ── Filtros post-query (listado general; excluye health check fallido) ──
  const afterTipo0 = docs.length;
  docs = applyStandardDocumentFilters(docs as DocumentRowWithHealth[], filters, blockedIds);

  console.log('[ai-access-gate] fetchDocumentRows pipeline:', {
    empresaIds: scope.effectiveEmpresaIds,
    raw: afterTipo0,
    final: docs.length,
    filters: { trimestre: filters.trimestre, año: filters.año, tipo: filters.tipo },
  });

  return docs.slice(0, limit);
}

export async function listDocumentsSummary(
  scope: AgentDocumentScope,
  filters: ListDocumentsFilters = {},
): Promise<AgentDocumentSummary[]> {
  if (scope.effectiveEmpresaIds.length === 0) return [];

  const rows = await fetchDocumentRows(scope, filters);
  const soloIncidencias = filters.solo_incidencias_pendientes ?? false;

  if (soloIncidencias) {
    return rows.map((d: any) => mapPendingRowToSummary(d));
  }

  return rows.map((d: any) => {
    const { doc, enviado_sii } = mapRowToDocumentLike(d);
    return documentToSummary(doc, { enviado_sii });
  });
}

export async function getSecurityCenterSummary(
  scope: AgentDocumentScope,
): Promise<SecurityCenterSummary> {
  const empresaIds = scope.effectiveEmpresaIds;
  const empty: SecurityCenterSummary = {
    empresas_consultadas: [],
    documentos_pendientes: 0,
    descuadres_matematicos: 0,
    alertas_logicas: 0,
    registros_incidencias_abiertas: 0,
    documentos_con_incidencia: 0,
    documentos_con_alerta_salud: 0,
    documentos_con_ambos: 0,
    documentos: [],
    documentos_listados: 0,
    limite_listado: MAX_SECURITY_LIST,
  };

  if (empresaIds.length === 0) return empty;

  const baseWhere = {
    id_de_empresa: { in: empresaIds.map((id) => BigInt(id)) },
    empresas: { id_de_usuario: { array_contains: scope.userId } },
  };

  const [healthData, incidentsAnalytics, incidenciaDocRows] = await Promise.all([
    getHealthCheckAnalytics(empresaIds),
    getIncidentsAnalytics(empresaIds),
    prisma.documentos.findMany({
      where: {
        ...baseWhere,
        incidencias_documento: { some: { validado: false } },
      },
      select: { id: true },
    }),
  ]);

  const healthDocIds = new Set(
    healthData.documents.map((d) => Number(d.id_documento)).filter((id) => Number.isFinite(id)),
  );
  const incidenciaDocIds = new Set(
    incidenciaDocRows.map((d: { id: bigint }) => Number(d.id)),
  );

  const documentosConAmbos = [...incidenciaDocIds].filter((id) => healthDocIds.has(id)).length;
  const pendingIds = [...new Set<number>([...healthDocIds, ...incidenciaDocIds])];
  const documentos = await fetchPendingDocumentSummaries(scope, pendingIds, MAX_SECURITY_LIST);

  return {
    empresas_consultadas: empresaIds,
    documentos_pendientes: pendingIds.length,
    descuadres_matematicos: healthData.summary.mismatches ?? 0,
    alertas_logicas: healthData.summary.logic_checks ?? 0,
    registros_incidencias_abiertas: incidentsAnalytics.totalOpen ?? 0,
    documentos_con_incidencia: incidenciaDocIds.size,
    documentos_con_alerta_salud: healthDocIds.size,
    documentos_con_ambos: documentosConAmbos,
    documentos,
    documentos_listados: documentos.length,
    limite_listado: MAX_SECURITY_LIST,
  };
}

export async function getDocumentFull(
  scope: AgentDocumentScope,
  documentId: number,
): Promise<AgentDocumentFull | null> {
  const doc = await getDocumentByIdForUser(documentId, scope.userId);
  if (!doc) return null;

  if (doc.empresa_id != null && !scope.effectiveEmpresaIds.includes(doc.empresa_id)) {
    return null;
  }

  const [rawDoc, aiInc, aiSug, health] = await Promise.all([
    prisma.documentos.findUnique({
      where: { id: BigInt(documentId) },
      select: { enviado_sii: true },
    }),
    prisma.ai_incidencias_documento.findMany({
      where: { documento_id: BigInt(documentId) },
      select: { tipo: true, descripcion: true, severidad: true },
      take: 20,
    }),
    prisma.ai_suggestions.findMany({
      where: { documento_id: BigInt(documentId), include_in_context: true },
      select: { tipo: true, descripcion: true, severidad: true, sugerencia: true },
      take: 10,
    }),
    prisma.health_check_status.findUnique({
      where: { documento_id: documentId },
      select: { verified: true, check_type: true, motivo: true },
    }),
  ]);

  return documentToFull(doc, {
    enviado_sii: rawDoc?.enviado_sii ?? undefined,
    ai_incidencias: aiInc.map((i: any) => ({
      tipo: i.tipo,
      descripcion: i.descripcion,
      severidad: String(i.severidad),
    })),
    ai_suggestions: aiSug.map((s: any) => ({
      tipo: s.tipo,
      descripcion: s.descripcion,
      severidad: s.severidad ? String(s.severidad) : null,
      sugerencia: s.sugerencia,
    })),
    health_check: health
      ? {
          verified: Boolean(health.verified),
          check_type: health.check_type,
          motivo: health.motivo,
        }
      : null,
  });
}

export async function getQuarterSummary(
  scope: AgentDocumentScope,
  año: number,
  trimestre: number,
): Promise<QuarterSummary | null> {
  if (scope.effectiveEmpresaIds.length === 0) return null;
  if (trimestre < 1 || trimestre > 4) return null;

  const empresaBigIds = scope.effectiveEmpresaIds.map((id) => BigInt(id));

  const [trimestreRows, docs] = await Promise.all([
    prisma.trimestres.findMany({
      where: {
        id_de_empresa: { in: empresaBigIds },
        a_o: año,
        num_trimestre: trimestre,
      },
    }),
    prisma.documentos.findMany({
      where: {
        id_de_empresa: { in: empresaBigIds },
        año_trimestre: año,
        num_trimestre: trimestre,
        empresas: { id_de_usuario: { array_contains: scope.userId } },
      },
      select: {
        importe_total: true,
        importe_sin_impuestos: true,
        empresas: { select: { CIF: true, cif_hash: true } },
        entidades_documento: {
          where: { rol: { in: ['emisor', 'proveedor'] } },
          select: { identificador_fiscal: true, identificador_fiscal_hash: true },
        },
        impuestos_documento: { select: { tipo_impuesto: true, cuota: true } },
      },
    }),
  ]);

  let totalIngresos = 0;
  let totalGastos = 0;
  let ivaRepercutido = 0;
  let ivaSoportado = 0;

  for (const d of docs) {
    const total = Number(d.importe_total) || 0;
    const issued = computeIsIssued(d.empresas?.CIF, d.entidades_documento, d.empresas?.cif_hash);
    if (issued) totalIngresos += total;
    else totalGastos += total;

    for (const imp of d.impuestos_documento) {
      const tipo = (imp.tipo_impuesto || '').toLowerCase();
      const cuota = Number(imp.cuota) || 0;
      if (tipo.includes('retencion')) continue;
      if (issued) ivaRepercutido += cuota;
      else ivaSoportado += cuota;
    }
  }

  const cerrado = trimestreRows.some((t: any) => t.cerrado);

  return {
    año,
    trimestre,
    empresa_ids: scope.effectiveEmpresaIds,
    total_documentos: docs.length,
    total_ingresos: Math.round(totalIngresos * 100) / 100,
    total_gastos: Math.round(totalGastos * 100) / 100,
    iva_repercutido: Math.round(ivaRepercutido * 100) / 100,
    iva_soportado: Math.round(ivaSoportado * 100) / 100,
    trimestre_cerrado: cerrado,
  };
}

export async function searchDocuments(
  scope: AgentDocumentScope,
  query: string,
): Promise<AgentDocumentSummary[]> {
  const q = query.trim();
  if (!q || scope.effectiveEmpresaIds.length === 0) return [];

  const limit = MAX_LIST_RESULTS;
  const baseWhere = {
    id_de_empresa: { in: scope.effectiveEmpresaIds.map((id) => BigInt(id)) },
    empresas: { id_de_usuario: { array_contains: scope.userId } },
  };

  const [byNumero, byProveedor] = await Promise.all([
    prisma.documentos.findMany({
      where: { ...baseWhere, numero_documento: { contains: q } } as any,
      orderBy: { fecha_emision: 'desc' },
      take: limit,
      include: {
        empresas: { select: { nombre_de_empresa: true, CIF: true, cif_hash: true } },
        entidades_documento: {
          where: { rol: { in: ['emisor', 'proveedor', 'receptor', 'cliente'] } },
          select: { rol: true, nombre: true, identificador_fiscal: true, identificador_fiscal_hash: true },
        },
        archivos_documento: { select: { id: true }, take: 1 },
        incidencias_documento: { where: { validado: false }, take: 1, select: { descripcion: true } },
      },
    }),
    prisma.documentos.findMany({
      where: {
        ...baseWhere,
        entidades_documento: {
          some: {
            rol: { in: ['emisor', 'proveedor'] },
            nombre: { contains: q },
          },
        },
      } as any,
      orderBy: { fecha_emision: 'desc' },
      take: limit,
      include: {
        empresas: { select: { nombre_de_empresa: true, CIF: true, cif_hash: true } },
        entidades_documento: {
          where: { rol: { in: ['emisor', 'proveedor', 'receptor', 'cliente'] } },
          select: { rol: true, nombre: true, identificador_fiscal: true, identificador_fiscal_hash: true },
        },
        archivos_documento: { select: { id: true }, take: 1 },
        incidencias_documento: { where: { validado: false }, take: 1, select: { descripcion: true } },
      },
    }),
  ]);

  const seen = new Set<number>();
  const merged = [...byNumero, ...byProveedor].filter((d) => {
    const id = Number(d.id);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, limit);

  return merged.map((d) => {
    const { doc, enviado_sii } = mapRowToDocumentLike(d);
    const pending = d.incidencias_documento?.[0];
    if (pending) {
      doc.incidencia = true;
      doc.verificado = false;
      doc.incidencia_razon = pending.descripcion;
    }
    return documentToSummary(doc, { enviado_sii });
  });
}
