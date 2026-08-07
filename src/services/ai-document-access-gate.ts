/**
 * Capa de acceso seguro a documentos para el agente IA.
 * Toda consulta exige userId de sesión y filtra por membership en empresas.
 */

import { prisma } from '@/lib/prisma';
import { getSelectedCompanies } from '@/lib/upstash';
import { resolveEffectiveEmpresaIds } from '@/lib/empresa-access';
import {
  documentToFull,
  documentToSummary,
  type AgentDocumentFull,
  type AgentDocumentSummary,
} from '@/lib/ai-document-sanitize';
import { getDocumentByIdForUser } from '@/services/document-service';
import type { Document } from '@/lib/types';

const MAX_LIST_RESULTS = 10;

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

async function fetchDocumentRows(scope: AgentDocumentScope, filters: ListDocumentsFilters) {
  const { where, limit, soloIncidencias } = buildDocumentWhere(scope, filters);

  // IDs bloqueados por health_check fallido — no hay @relation en el schema de Prisma.
  const blockedByHealthCheck = await prisma.health_check_status.findMany({
    where: { verified: false },
    select: { documento_id: true },
  });
  const blockedIds = new Set(blockedByHealthCheck.map((r: any) => r.documento_id));

  let docs = await prisma.documentos.findMany({
    where: where as any,
    orderBy: { fecha_emision: 'desc' },
    take: limit * 5, // traemos más para compensar los filtros post-query
    include: {
      empresas: { select: { nombre_de_empresa: true, CIF: true, cif_hash: true } },
      entidades_documento: {
        where: { rol: { in: ['emisor', 'proveedor', 'receptor', 'cliente'] } },
        select: { rol: true, nombre: true, identificador_fiscal: true, identificador_fiscal_hash: true },
      },
      archivos_documento: { select: { id: true }, take: 1 },
      incidencias_documento: { where: { validado: false }, take: 1, select: { descripcion: true, validado: true } },
    },
  });

  // ── Filtros post-query ──

  // 1. tipo_documento: solo facturas/abonos/créditos confirmados (case-insensitive con toLowerCase,
  //    equivalente al LOWER(tipo_documento) LIKE del SQL).
  const afterTipo0 = docs.length;
  docs = docs.filter((d: any) => {
    const tipo = (d.tipo_documento || '').toLowerCase();
    if (tipo.includes('(sin confirmar)')) return false;
    return tipo.includes('factura') || tipo.includes('abono') ||
           tipo.includes('crédito') || tipo.includes('credito');
  });

  // 2. Health_check fallido: excluir si verified=false en health_check_status.
  const afterTipo = docs.length;
  if (blockedIds.size > 0) {
    docs = docs.filter((d: any) => !blockedIds.has(Number(d.id)));
  }

  // 3. Incidencias: SOLO filtrar si el usuario pidió explícitamente soloIncidencias=true.
  //    En el flujo normal, el agente VE todos los docs (incluyendo con incidencias)
  //    para poder informar al usuario. La propiedad incidencia:true ya se setea en listDocumentsSummary.
  const afterHealth = docs.length;
  if (soloIncidencias) {
    docs = docs.filter((d: any) => d.incidencias_documento?.length > 0);
  }

  // 4. Filtro de proveedor (nombre de entidad)
  if (filters.proveedor?.trim()) {
    const q = filters.proveedor.trim().toLowerCase();
    docs = docs.filter((d: any) =>
      d.entidades_documento.some((e: any) => (e.nombre || '').toLowerCase().includes(q)),
    );
  }

  // 5. Filtro de tipo emitidas/recibidas
  if (filters.tipo === 'emitidas') {
    docs = docs.filter((d: any) =>
      computeIsIssued(d.empresas?.CIF, d.entidades_documento, d.empresas?.cif_hash),
    );
  } else if (filters.tipo === 'recibidas') {
    docs = docs.filter(
      (d: any) => !computeIsIssued(d.empresas?.CIF, d.entidades_documento, d.empresas?.cif_hash),
    );
  }

  console.log('[ai-access-gate] fetchDocumentRows pipeline:', {
    empresaIds: scope.effectiveEmpresaIds,
    raw: afterTipo0, afterTipo, afterHealth, final: docs.length,
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
  return rows.map((d: any) => {
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
