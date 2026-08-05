'use server';

import db, { dbName } from '@/lib/db';
import type { Document, IvaDetail, DocumentUpdatePayload, DocumentEntity, DocumentLine, DocumentFile, ProviderWithStats, Incident, Company, CreateDocumentPayload, DashboardAnalytics } from '@/lib/types';
import type { RowDataPacket, OkPacket } from 'mysql2';
import type { ProviderAnalyticsData } from '@/components/dashboard/provider-analytics';
import type { IncidentsAnalyticsData } from '@/components/incidents/incidents-analytics';
import type { IncidentAnalysisResult } from '@/lib/types';
import { redirect } from 'next/navigation';
import { getCurrentUser } from './user-service';
import { revalidatePath } from 'next/cache';
import { normalizeProductDescription } from "@/lib/utils";
import { prisma } from '@/lib/prisma';
import { hashField, normalizeEntityName } from '@/lib/encryption';

const serializeData = (data: any) => JSON.parse(JSON.stringify(data, (k, v) => typeof v === 'bigint' ? Number(v) : v));

import type { Trimestre, TrimestreFilters, CerrarTrimestrePayload } from '@/lib/types';
import { validateIncidentsAsync } from './incidents-service';
import { runHealthChecksForDocument } from './health-check-service';
import { parseFechaLocal, resolverTrimestreContableImportacion } from '@/lib/trimestre-utils';
import { fireWebhook, fireBatchWebhook } from '@/services/webhook-service';



function calcularTrimestre(fecha: Date): number {
  const mes = fecha.getMonth() + 1; // 0-11 -> 1-12

  if (mes >= 1 && mes <= 3) return 1;
  if (mes >= 4 && mes <= 6) return 2;
  if (mes >= 7 && mes <= 9) return 3;
  return 4;
}

function isDateInCurrentQuarter(date: Date): boolean {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = calcularTrimestre(now);

  const docYear = date.getFullYear();
  const docQuarter = calcularTrimestre(date);

  return docYear === currentYear && docQuarter === currentQuarter;
}

interface DocumentPacket extends RowDataPacket {
  id: number;
  tipo_documento: string;
  numero_documento: string;
  fecha_emision: string;
  fecha_vencimiento: string | null;
  importe_total: number;
  importe_sin_impuestos: number;
  moneda: string;
  observaciones: string | null;
  datos_extra: any | null;
  fecha_creacion: string;
  id_de_empresa: number | null;
  empresa_nombre?: string | null;
  empresa_cif?: string | null;
  is_new: number;
  trimestre_cerrado: number;
  año_trimestre?: number;
  num_trimestre?: number;
  is_issued?: number;  // ✅ calculado via subquery
}
interface DatosExtra {
  EMPRESA_EMISORA?: {
    NOMBRE?: string;
    DIRECCION?: string;
    CIF?: string;
    TELEFONO?: string;
    EMAIL?: string;
  };
  datos_originales?: any;
}

interface ArchivoPacket extends RowDataPacket {
  id: number;
  tipo_archivo: string | null;
  nombre_archivo: string | null;
  ruta_archivo: string | null;
  hash_archivo: string | null;
  fecha_subida: string;
  documento_id: number;
}

interface EntidadPacket extends RowDataPacket {
  id: number;
  rol: string;
  nombre: string;
  direccion: string | null;
  identificador_fiscal: string | null;
  telefono: string | null;
  email: string | null;
  datos_extra: any | null;
  documento_id: number;
  fecha_creacion: string;
}

interface LineaPacket extends RowDataPacket {
  id: number;
  documento_id: number;
  codigo: string | null;
  descripcion: string | null;
  cantidad: number;
  unidad: string | null;
  precio_unitario: number;
  descuento_porcentaje: number;
  precio_neto: number;
  importe_linea: number;
  datos_extra: any | null;
  fecha_emision: string; // Joined from documentos table
  numero_documento: string; // Joined from documentos table
  fecha_creacion: string | null;
}

interface ImpuestoPacket extends RowDataPacket {
  id: number;
  tipo_impuesto: string | null; // Can be null
  porcentaje: number;
  base_imponible: number;
  cuota: number;
  documento_id: number;
}

interface ProviderStatsPacket extends RowDataPacket {
  nombre: string;
  identificador_fiscal: string;
  totalSpent: number;
  totalDocuments: number;
  uniqueProducts: number;
}

interface IncidenciaPacket extends RowDataPacket {
  id: number;
  documento_id: number;
  descripcion: string | null;
  validado: boolean;
  fecha_incidencia: string;
}

interface EmpresaPacket extends RowDataPacket {
  id: number;
  nombre: string;
}



// Helper function to safely parse JSON. Ensures the output is an object or null.
const safeJsonParse = (data: any): object | null => {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data);
      return typeof parsed === 'object' && parsed !== null ? parsed : null;
    } catch (e) {
      return null;
    }
  }
  return (typeof data === 'object' && data !== null) ? data : null;
};

async function mapDocumentPacketsToDocuments(documentRows: DocumentPacket[]): Promise<Document[]> {
  if (!documentRows || documentRows.length === 0) {
    return [];
  }
  const docIds = documentRows.map(doc => doc.id);

  const bigDocIds = docIds.map(id => BigInt(id));
  const [fileRows, entidadRows, lineaRows, impuestoRows, incidenciaRows] = await Promise.all([
    prisma.archivos_documento.findMany({ where: { documento_id: { in: bigDocIds } } }),
    prisma.entidades_documento.findMany({ where: { documento_id: { in: bigDocIds } } }),
    prisma.lineas_documento.findMany({ where: { documento_id: { in: bigDocIds } } }),
    prisma.impuestos_documento.findMany({ where: { documento_id: { in: bigDocIds } } }),
    prisma.incidencias_documento.findMany({ where: { documento_id: { in: bigDocIds } } }),
  ]);

  const documents = documentRows.map(doc => {
    const currentFiles = fileRows.filter(f => Number(f.documento_id) === Number(doc.id));
    const currentEntidades = entidadRows.filter(e => Number(e.documento_id) === Number(doc.id));
    const currentLineas = lineaRows.filter(l => Number(l.documento_id) === Number(doc.id));
    const currentImpuestos = impuestoRows.filter(i => Number(i.documento_id) === Number(doc.id));
    const currentIncidencias = incidenciaRows.filter(i => Number(i.documento_id) === Number(doc.id));


    const emisor = currentEntidades.find(e => e.rol === 'emisor' || e.rol === 'proveedor');
    const receptor = currentEntidades.find(e => e.rol === 'receptor' || e.rol === 'cliente');

    const iva_details: IvaDetail[] = currentImpuestos.map(i => ({
      id: i.id,
      tipo_impuesto: i.tipo_impuesto,
      porcentaje: i.porcentaje,
      base_imponible: i.base_imponible,
      cuota: i.cuota,
    }));

    const total_iva = iva_details
      .filter(tax => !tax.tipo_impuesto?.toLowerCase().includes('retencion'))
      .reduce((sum, tax) => sum + (Number(tax.cuota) || 0), 0);

    const entidades: DocumentEntity[] = currentEntidades.map(e => ({
      id: e.id,
      rol: e.rol,
      nombre: e.nombre,
      direccion: e.direccion,
      identificador_fiscal: e.identificador_fiscal,
      identificador_fiscal_hash: (e as any).identificador_fiscal_hash ?? null,
      telefono: e.telefono,
      email: e.email,
      datos_extra: safeJsonParse(e.datos_extra),
      fecha_creacion: e.fecha_creacion,
    }));

    const lineas: DocumentLine[] = currentLineas.map(l => ({
      id: l.id,
      documento_id: l.documento_id,
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      precio_unitario: l.precio_unitario,
      descuento_porcentaje: l.descuento_porcentaje,
      precio_neto: l.precio_neto,
      importe_linea: l.importe_linea,
      datos_extra: safeJsonParse(l.datos_extra),
      fecha_creacion: l.fecha_creacion,
    }));

    const archivos: DocumentFile[] = currentFiles.map(f => ({
      id: f.id,
      documento_id: f.documento_id,
      tipo_archivo: f.tipo_archivo,
      nombre_archivo: f.nombre_archivo,
      ruta_archivo: f.ruta_archivo,
      hash_archivo: f.hash_archivo,
      fecha_subida: f.fecha_subida,
    }));

    const incidencias: Incident[] = currentIncidencias.map(i => ({
      id: i.id,
      documento_id: i.documento_id,
      incidencia: true,
      descripcion: i.descripcion,
      validado: i.validado,
      fecha_incidencia: i.fecha_incidencia,
      fecha_validacion: null,
      validado_por: null,
    }));

    const pendientes = incidencias.filter(i => !i.validado).length;
    const primeraIncidenciaPendiente = incidencias.find(i => !i.validado);

    const datosExtra: any = safeJsonParse(doc.datos_extra) || {};

    // Priorizar CIF de datos_extra si existe
    const cifFromDatosExtra = datosExtra?.cif ||
      datosExtra?.CLIENTE?.CIF ||
      datosExtra?.METADATOS?.NIF_CIF_RELACIONADO ||
      datosExtra?.EMPRESA_EMISORA?.CIF;

    return {
      id_documento: doc.id,
      numero_documento: doc.numero_documento,
      tipo_documento: doc.tipo_documento,
      verificado: !primeraIncidenciaPendiente,
      incidencia: !!primeraIncidenciaPendiente,
      incidencia_razon: primeraIncidenciaPendiente?.descripcion ?? null,
      fecha_emision: doc.fecha_emision,
      fecha_vencimiento: doc.fecha_vencimiento,
      fecha_creacion: doc.fecha_creacion,
      moneda: doc.moneda,
      observaciones: doc.observaciones,
      datos_extra: datosExtra,
      base_imponible: Number(doc.importe_sin_impuestos) || 0,
      iva: total_iva,
      total: Number(doc.importe_total) || 0,
      descuento_global: Number(datosExtra?.descuento_global) || 0,
      base_no_sujeta: Number(datosExtra?.base_no_sujeta) || 0,
      entidades: entidades,
      lineas: lineas,
      iva_details: iva_details,
      archivos: archivos,
      incidencias: incidencias,
      proveedor: emisor?.nombre || receptor?.nombre || 'N/A',
      cif: cifFromDatosExtra || emisor?.identificador_fiscal || receptor?.identificador_fiscal || 'N/A',
      empresa_id: doc.id_de_empresa,
      empresa_nombre: doc.empresa_nombre || 'Sin empresa',
      empresa_cif: doc.empresa_cif || null,
      is_new: doc.is_new || 0, // ⬅️ LÍNEA AGREGADA
      trimestre_cerrado: doc.trimestre_cerrado || false,
      año_trimestre: doc.año_trimestre || null,
      num_trimestre: doc.num_trimestre || null,
      is_issued: doc.is_issued !== undefined ? Number(doc.is_issued) : undefined,  // ✅ clasificación backend
    };
  });

  return serializeData(documents);
}

/**
 * Obtiene todas las empresas del usuario actual
 */
export async function getCompanies(): Promise<Company[]> {
  const t0 = performance.now();
  try {
    console.log('🔍 [getCompanies] Iniciando...');

    const tUser = performance.now();
    const user = await getCurrentUser();
    console.log(`⏱️ [PERF] getCompanies.getCurrentUser | ${Math.round(performance.now() - tUser)}ms`);

    console.log('👤 [getCompanies] Usuario obtenido:', user);

    if (!user) {
      console.warn('⚠️ [getCompanies] No hay usuario autenticado');
      return [];
    }

    console.log('🔍 [getCompanies] Buscando empresas para usuario ID:', user.id);

    // Prisma: fetch all companies and filter in-memory (JSON array field)
    // ⚠️ No usar orderBy en campos encriptados — se ordena en memoria después de desencriptar
    const tDb = performance.now();
    const allRows = await prisma.empresas.findMany({
      select: {
        id: true,
        nombre_de_empresa: true,
        nombre_fiscal: true,
        CIF: true,
        mail_de_carga: true,
        recargo: true,
        id_de_usuario: true,
        config_roles: true
      }
    });
    console.log(`⏱️ [PERF] getCompanies.empresas.findMany | ${Math.round(performance.now() - tDb)}ms | rows=${allRows.length}`);

    const rows = allRows.filter(row => {
      const ids: number[] = Array.isArray(row.id_de_usuario) ? row.id_de_usuario as any[] : [];
      return ids.includes(user.id);
    });

    console.log('📊 [getCompanies] Filas obtenidas:', rows.length);

    if (!rows || rows.length === 0) {
      console.log(`⏱️ [PERF] getCompanies.TOTAL | ${Math.round(performance.now() - t0)}ms | companies=0`);
      return [];
    }

    const companies = rows
      .map(row => ({
        id: Number(row.id),
        name: row.nombre_de_empresa,         // desencriptado automáticamente por Prisma
        nombreFiscal: row.nombre_fiscal,       // desencriptado automáticamente por Prisma
        cif: row.CIF,
        mail_de_carga: row.mail_de_carga,     // desencriptado automáticamente por Prisma
        recargo: !!row.recargo,
        id_de_usuario: row.id_de_usuario,
        config_roles: row.config_roles
      }))
      // Ordenar en memoria DESPUÉS de desencriptar (no se puede ordenar en BD sobre campo encriptado)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));

    console.log('✅ [getCompanies] Empresas mapeadas:', companies);
    console.log(`⏱️ [PERF] getCompanies.TOTAL | ${Math.round(performance.now() - t0)}ms | companies=${companies.length}`);

    return companies as Company[];
  } catch (error) {
    console.error("❌ [getCompanies] Error:", error);
    console.log(`⏱️ [PERF] getCompanies.TOTAL | ${Math.round(performance.now() - t0)}ms | error=1`);
    return [];
  }
}

/**
 * Crea una nueva empresa para el usuario actual
 */
/**
 * Crea una nueva empresa para el usuario actual
 */
export async function createCompany(data: {
  name: string;
  nombreFiscal?: string | null;
  cif: string;
  mailDeCarga?: string | null;
  recargo?: boolean | number | null;
}): Promise<Company> {
  try {
    console.log('🏢 [createCompany] Iniciando creación de empresa:', data);

    const user = await getCurrentUser();

    if (!user) {
      console.error('❌ [createCompany] No hay usuario autenticado');
      throw new Error('Usuario no autenticado');
    }

    console.log('👤 [createCompany] Usuario actual:', user.id);

    // Validaciones
    if (!data.name || !data.name.trim()) {
      throw new Error('El nombre de la empresa es obligatorio');
    }

    if (!data.cif || !data.cif.trim()) {
      throw new Error('El CIF es obligatorio');
    }

    // Hashes para búsquedas seguras (Blind Indexes)
    const cifHash = hashField(data.cif.trim());
    const mailDeCargaHash = data.mailDeCarga?.trim() ? hashField(data.mailDeCarga.trim()) : null;

    // Verificar si ya existe una empresa con el mismo CIF para este usuario
    const existingCompanies = await prisma.empresas.findMany({
      where: { OR: [{ cif_hash: cifHash }, { CIF: data.cif.trim() }] }
    });

    const isCompanyForUser = existingCompanies.some(c => {
      let ids: number[] = [];
      try {
        ids = typeof c.id_de_usuario === 'string' ? JSON.parse(c.id_de_usuario) : (c.id_de_usuario || []);
      } catch(e) {}
      return Array.isArray(ids) && ids.includes(user.id);
    });

    if (isCompanyForUser) {
      throw new Error('Ya existe una empresa con este CIF');
    }

    // Si se proporciona email, verificar que sea único globalmente
    if (mailDeCargaHash && data.mailDeCarga) {
      const existingEmail = await prisma.empresas.findFirst({
        where: { OR: [{ mail_de_carga_hash: mailDeCargaHash }, { mail_de_carga: data.mailDeCarga.trim() }] }
      });

      if (existingEmail) {
        throw new Error('Ya existe una empresa con ese mail de carga');
      }
    }

    const initialConfigRoles = { [user.id.toString()]: 'ADMIN' };
    
    const newCompanyData = await prisma.empresas.create({
      data: {
        nombre_de_empresa: data.name.trim(),
        nombre_fiscal: data.nombreFiscal?.trim() || null,
        CIF: data.cif.trim(),
        cif_hash: cifHash,
        mail_de_carga: data.mailDeCarga?.trim() || null,
        mail_de_carga_hash: mailDeCargaHash,
        recargo: data.recargo ? true : false,
        id_de_usuario: [user.id],
        config_roles: initialConfigRoles
      }
    });

    console.log('✅ [createCompany] Empresa creada con ID:', newCompanyData.id);

    const newCompany: Company = {
      id: Number(newCompanyData.id),
      name: data.name.trim(),
      nombreFiscal: data.nombreFiscal?.trim() || null,
      cif: data.cif.trim(),
      recargo: !!data.recargo,
      config_roles: initialConfigRoles,
      members: [{
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        organization_rol: 'ADMIN' // Explicitly set instead of casting to avoid any missing imports
      } as any],
      invitations: []
    };

    // Revalidar las rutas relevantes
    revalidatePath('/documents');
    revalidatePath('/dashboard');

    return newCompany;

  } catch (error) {
    console.error('❌ [createCompany] Error:', error);
    throw error;
  }
}
/**
 * Obtiene todos los documentos, opcionalmente filtrados por empresa
 */
/**
 * Obtiene todos los documentos, opcionalmente filtrados por empresas
 */
/**
 * Obtiene todos los documentos, opcionalmente filtrados por empresas
 */
export async function getDocuments(empresaIds?: number[], excludeIncidents: boolean = false): Promise<Document[]> {
  const t0 = performance.now();
  console.log('🎯 [document-service] getDocuments llamado con:', { empresaIds, excludeIncidents });

  try {
    const tUser = performance.now();
    const user = await getCurrentUser();
    console.log(`⏱️ [PERF] getDocuments.getCurrentUser | ${Math.round(performance.now() - tUser)}ms`);
    if (!user) {
      console.warn('⚠️ [document-service] No hay usuario autenticado');
      return [];
    }

    // Prisma ORM implementation for getDocuments
    const whereClause: any = {
      OR: [
        { id_de_empresa: null }, // If needed, though usually docs belong to an empresa
        { empresas: { id_de_usuario: { array_contains: user.id } } }
      ]
    };

    if (empresaIds && empresaIds.length > 0) {
      whereClause.id_de_empresa = { in: empresaIds.map(id => BigInt(id)) };
    }

    if (excludeIncidents) {
      whereClause.incidencias_documento = { none: { validado: false } };
      
      // Excluir manualmente los documentos con fallos en el health check 
      // (no se puede por relación Prisma porque documento_id es Int y documentos.id es BigInt)
      const tHc = performance.now();
      const unverifiedHealthChecks = await prisma.health_check_status.findMany({
        where: { verified: false },
        select: { documento_id: true }
      });
      console.log(`⏱️ [PERF] getDocuments.health_check | ${Math.round(performance.now() - tHc)}ms | rows=${unverifiedHealthChecks.length}`);
      
      if (unverifiedHealthChecks.length > 0) {
        const unverifiedIds = unverifiedHealthChecks.map(hc => BigInt(hc.documento_id));
        whereClause.id = { notIn: unverifiedIds };
      }
    }

    const tDocs = performance.now();
    const docs = await prisma.documentos.findMany({
      where: whereClause,
      orderBy: { fecha_emision: 'desc' },
      include: {
        empresas: { select: { nombre_de_empresa: true, CIF: true, cif_hash: true } },
        entidades_documento: {
          where: { rol: { in: ['emisor', 'proveedor'] } },
          select: { identificador_fiscal_hash: true, identificador_fiscal: true }
        }
      }
    });
    console.log(`⏱️ [PERF] getDocuments.documentos.findMany | ${Math.round(performance.now() - tDocs)}ms | rows=${docs.length}`);

    console.log('📊 [document-service] Filas obtenidas de BD:', docs.length);

    const documentRows = docs.map((d: any) => {
      const is_issued = d.entidades_documento.some((ed: any) => 
        (ed.identificador_fiscal_hash && d.empresas?.cif_hash && ed.identificador_fiscal_hash === d.empresas.cif_hash) ||
        (ed.identificador_fiscal && d.empresas?.CIF && ed.identificador_fiscal === d.empresas.CIF)
      ) ? 1 : 0;

      return {
        id: Number(d.id),
        tipo_documento: d.tipo_documento,
        numero_documento: d.numero_documento,
        fecha_emision: d.fecha_emision,
        fecha_vencimiento: d.fecha_vencimiento,
        importe_total: d.importe_total,
        importe_sin_impuestos: d.importe_sin_impuestos,
        moneda: d.moneda,
        observaciones: d.observaciones,
        datos_extra: d.datos_extra,
        fecha_creacion: d.fecha_creacion,
        id_de_empresa: d.id_de_empresa ? Number(d.id_de_empresa) : null,
        is_new: d.is_new,
        trimestre_cerrado: d.trimestre_cerrado ? 1 : 0,
        año_trimestre: d.año_trimestre,
        num_trimestre: d.num_trimestre,
        empresa_nombre: d.empresas?.nombre_de_empresa || null,
        empresa_cif: d.empresas?.CIF || null,
        is_issued
      };
    }) as any[];

    if (documentRows.length > 0) {
      console.log('🔍 [document-service] Primer documento RAW:', {
        id: documentRows[0].id,
        is_new: documentRows[0].is_new,
        trimestre_cerrado: documentRows[0].trimestre_cerrado,
        numero: documentRows[0].numero_documento
      });
    }

    const tMap = performance.now();
    const result = await mapDocumentPacketsToDocuments(documentRows);
    console.log(`⏱️ [PERF] getDocuments.mapPackets | ${Math.round(performance.now() - tMap)}ms | docs=${result.length}`);

    console.log('✅ [document-service] Documentos mapeados:', result.length);
    console.log(`⏱️ [PERF] getDocuments.TOTAL | ${Math.round(performance.now() - t0)}ms`);

    return result;
  } catch (error) {
    console.error("❌ [document-service] Error al obtener documentos:", error);
    console.log(`⏱️ [PERF] getDocuments.TOTAL | ${Math.round(performance.now() - t0)}ms | error=1`);
    return [];
  }
}
/**
 * Obtiene un documento por su ID
 */
export async function getDocumentById(id: number): Promise<Document | null> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      console.warn('⚠️ [document-service] No hay usuario autenticado');
      return null;
    }

    console.log('📝 [document-service] getDocumentById:', { id, userId: user.id });

    const d = await prisma.documentos.findFirst({
      where: {
        id: BigInt(id),
        empresas: { id_de_usuario: { array_contains: user.id } }
      },
      include: {
        empresas: { select: { nombre_de_empresa: true, CIF: true, cif_hash: true } }
      }
    });

    if (!d) {
      console.log('⚠️ [document-service] Documento no encontrado:', id);
      return null;
    }

    const documentRows = [{
      id: Number(d.id),
      tipo_documento: d.tipo_documento,
      numero_documento: d.numero_documento,
      fecha_emision: d.fecha_emision,
      fecha_vencimiento: d.fecha_vencimiento,
      importe_total: d.importe_total,
      importe_sin_impuestos: d.importe_sin_impuestos,
      moneda: d.moneda,
      observaciones: d.observaciones,
      datos_extra: d.datos_extra,
      fecha_creacion: d.fecha_creacion,
      id_de_empresa: d.id_de_empresa ? Number(d.id_de_empresa) : null,
      is_new: d.is_new,
      trimestre_cerrado: d.trimestre_cerrado ? 1 : 0,
      año_trimestre: d.año_trimestre,
      num_trimestre: d.num_trimestre,
      empresa_nombre: d.empresas?.nombre_de_empresa || null,
      empresa_cif: d.empresas?.CIF || null
    }] as any[];

    console.log('✅ [document-service] Documento encontrado:', {
      id: documentRows[0].id,
      trimestre_cerrado: documentRows[0].trimestre_cerrado
    });

    const documents = await mapDocumentPacketsToDocuments(documentRows);

    return documents[0] || null;
  } catch (error) {
    console.error("❌ [document-service] Error al obtener documento por ID:", error);
    return null;
  }
}

export async function getIncidents(empresaIds?: number[]): Promise<Document[]> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      console.warn('⚠️ [getIncidents] No hay usuario autenticado');
      return [];
    }

    // ✅ AGREGADO: Si no hay empresas seleccionadas, retornar vacío
    if (!empresaIds || empresaIds.length === 0) {
      console.log('ℹ️ [getIncidents] No hay empresas seleccionadas');
      return [];
    }

    let query = `
            SELECT DISTINCT d.*
            FROM documentos d
            JOIN incidencias_documento i ON d.id = i.documento_id
            LEFT JOIN empresas e ON d.id_de_empresa = e.id
            WHERE i.validado = 0 
              AND JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))
  AND d.id_de_empresa IS NOT NULL
              AND d.id_de_empresa IN(?)
        `;

    const params: any[] = [user.id, empresaIds];

    query += ' ORDER BY d.fecha_emision DESC';

    console.log('📝 [getIncidents] Query:', query);
    console.log('📝 [getIncidents] Params:', params);

    const [documentRows] = await db.query<DocumentPacket[]>(query, params);

    console.log('📊 [getIncidents] Incidencias encontradas:', documentRows.length);

    return mapDocumentPacketsToDocuments(documentRows);
  } catch (error) {
    console.error("❌ [getIncidents] Error:", error);
    return [];
  }
}

export async function updateDocument(id: number, data: DocumentUpdatePayload, userIdentifier: string = 'Sistema'): Promise<{ success: boolean }> {
  if (userIdentifier === 'Sistema') {
    const sessionUser = await getCurrentUser();
    if (sessionUser?.email) userIdentifier = sessionUser.email;
  }

  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🚀 [updateDocument] INICIO - ID:', id);
    console.log('═══════════════════════════════════════════════════════════');

    let camposReales: string[] = [];
    let empresaId: number = 0;

    await prisma.$transaction(async (tx) => {
      console.log('✅ [updateDocument] Transacción iniciada via Prisma');

      let oldSnapshot = null;
      try {
        oldSnapshot = await getSnapshotBeforeUpdate(id, tx);
      } catch (e) {
        console.warn('⚠️ [updateDocument] Falló captura de snapshot previo:', e);
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 1: Verificar documento y trimestre cerrado
      // ═══════════════════════════════════════════════════════════
      const doc = await tx.documentos.findUnique({
        where: { id: BigInt(id) },
        select: { tipo_documento: true, trimestre_cerrado: true, año_trimestre: true, num_trimestre: true, id_de_empresa: true, importe_total: true, importe_sin_impuestos: true, datos_extra: true }
      });

      if (!doc) throw new Error('Documento no encontrado');
      if (doc.trimestre_cerrado) throw new Error('No se puede modificar un documento de un trimestre cerrado');

      empresaId = Number(doc.id_de_empresa);
      console.log('📋 [updateDocument] Empresa ID:', empresaId);

      // ═══════════════════════════════════════════════════════════
      // PASO 2: Validar y crear trimestre si es necesario
      // ═══════════════════════════════════════════════════════════
      if (data.año_trimestre !== undefined && data.num_trimestre !== undefined) {
        console.log('🔄 [updateDocument] Validando cambio de trimestre...');
        
        const trimestreExistente = await tx.documentos.groupBy({
          by: ['año_trimestre', 'num_trimestre'],
          where: { id_de_empresa: BigInt(empresaId), año_trimestre: data.año_trimestre, num_trimestre: data.num_trimestre },
          _max: { trimestre_cerrado: true }
        });

        if (trimestreExistente.length > 0) {
          if (trimestreExistente[0]._max.trimestre_cerrado) {
            throw new Error('No se puede mover el documento a un trimestre cerrado');
          }
        } else {
          const trimestreTabla = await tx.trimestres.findUnique({
            where: {
              a_o_num_trimestre_id_de_empresa: {
                a_o: data.año_trimestre,
                num_trimestre: data.num_trimestre,
                id_de_empresa: BigInt(empresaId),
              },
            },
            select: { cerrado: true },
          });

          if (trimestreTabla && trimestreTabla.cerrado) {
            throw new Error('No se puede crear/mover a un trimestre cerrado');
          }

          console.log('🆕 [updateDocument] Creando nuevo trimestre en tabla trimestres...');
          await tx.trimestres.upsert({
            where: {
              a_o_num_trimestre_id_de_empresa: {
                a_o: data.año_trimestre,
                num_trimestre: data.num_trimestre,
                id_de_empresa: BigInt(empresaId),
              },
            },
            update: { fecha_actualizacion: new Date() },
            create: {
              a_o: data.año_trimestre,
              num_trimestre: data.num_trimestre,
              id_de_empresa: BigInt(empresaId),
              cerrado: false,
              total_documentos: 0,
              total_ingresos: 0,
              total_gastos: 0,
              iva_repercutido: 0,
              iva_soportado: 0,
              fecha_creacion: new Date(),
              fecha_actualizacion: new Date(),
            },
          });
        }
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 2.5: Conversión de signos por cambio de tipo
      // ═══════════════════════════════════════════════════════════
      if (data.tipo_documento) {
        const oldTipo = doc.tipo_documento?.toLowerCase() || '';
        const newTipo = data.tipo_documento.toLowerCase();

        const wasAbono = oldTipo.includes('abono');
        const isAbono = newTipo.includes('abono');

        if (wasAbono !== isAbono) {
          if (isAbono) {
            data.total = doc.importe_total != null ? -Math.abs(Number(doc.importe_total)) : Number(doc.importe_total);
            data.base_imponible = doc.importe_sin_impuestos != null ? -Math.abs(Number(doc.importe_sin_impuestos)) : Number(doc.importe_sin_impuestos);

            const existingLines = await tx.lineas_documento.findMany({ where: { documento_id: BigInt(id) } });
            for (const line of existingLines) {
              await tx.lineas_documento.update({
                where: { id: line.id },
                data: {
                  precio_unitario: line.precio_unitario != null ? -Math.abs(Number(line.precio_unitario)) : line.precio_unitario,
                  importe_linea: line.importe_linea != null ? -Math.abs(Number(line.importe_linea)) : line.importe_linea
                }
              });
            }
            if (data.lineas && data.lineas.length > 0) {
              data.lineas.forEach((linea: any) => {
                if (linea.precio_unitario != null) linea.precio_unitario = -Math.abs(linea.precio_unitario);
                if (linea.importe_sin_iva != null) linea.importe_sin_iva = -Math.abs(linea.importe_sin_iva);
                if (linea.iva_importe != null) linea.iva_importe = -Math.abs(linea.iva_importe);
                if (linea.importe_total != null) linea.importe_total = -Math.abs(linea.importe_total);
              });
            }
          } else {
            data.total = doc.importe_total != null ? Math.abs(Number(doc.importe_total)) : Number(doc.importe_total);
            data.base_imponible = doc.importe_sin_impuestos != null ? Math.abs(Number(doc.importe_sin_impuestos)) : Number(doc.importe_sin_impuestos);

            const existingLinesPos = await tx.lineas_documento.findMany({ where: { documento_id: BigInt(id) } });
            for (const line of existingLinesPos) {
              await tx.lineas_documento.update({
                where: { id: line.id },
                data: {
                  precio_unitario: line.precio_unitario != null ? Math.abs(Number(line.precio_unitario)) : line.precio_unitario,
                  importe_linea: line.importe_linea != null ? Math.abs(Number(line.importe_linea)) : line.importe_linea
                }
              });
            }
            if (data.lineas && data.lineas.length > 0) {
              data.lineas.forEach((linea: any) => {
                if (linea.precio_unitario != null) linea.precio_unitario = Math.abs(linea.precio_unitario);
                if (linea.importe_sin_iva != null) linea.importe_sin_iva = Math.abs(linea.importe_sin_iva);
                if (linea.iva_importe != null) linea.iva_importe = Math.abs(linea.iva_importe);
                if (linea.importe_total != null) linea.importe_total = Math.abs(linea.importe_total);
              });
            }
          }

          const existingTaxes = await tx.impuestos_documento.findMany({ where: { documento_id: BigInt(id) } });
          for (const tax of existingTaxes) {
            await tx.impuestos_documento.update({
              where: { id: tax.id },
              data: {
                base_imponible: isAbono
                  ? (tax.base_imponible != null ? -Math.abs(Number(tax.base_imponible)) : tax.base_imponible)
                  : (tax.base_imponible != null ? Math.abs(Number(tax.base_imponible)) : tax.base_imponible),
                cuota: isAbono
                  ? (tax.cuota != null ? -Math.abs(Number(tax.cuota)) : tax.cuota)
                  : (tax.cuota != null ? Math.abs(Number(tax.cuota)) : tax.cuota)
              }
            });
          }

          if (data.iva_details && data.iva_details.length > 0) {
            data.iva_details = data.iva_details.map((iva: any) => ({
              ...iva,
              base_imponible: iva.base_imponible != null ? (isAbono ? -Math.abs(iva.base_imponible) : Math.abs(iva.base_imponible)) : iva.base_imponible,
              cuota: iva.cuota != null ? (isAbono ? -Math.abs(iva.cuota) : Math.abs(iva.cuota)) : iva.cuota,
            }));
          }

          if (data.observaciones) {
            let cleanedObs = data.observaciones;
            cleanedObs = cleanedObs.replace(/⚠️ DOCUMENTO ES ABONO \| /g, '');
            cleanedObs = cleanedObs.replace(/💰 Valores convertidos a negativos \(Abono\) \| /g, '');
            cleanedObs = cleanedObs.replace(/💰 Valores convertidos a positivos \(Factura\/Albarán\) \| /g, '');
            const newTypePrefix = isAbono ? '💰 Convertido a Abono | ' : '💰 Convertido a Factura/Albarán | ';
            if (!cleanedObs.startsWith('💰 Convertido')) cleanedObs = newTypePrefix + cleanedObs;
            data.observaciones = cleanedObs;
          }
        }
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 3: Actualizar documento principal
      // ═══════════════════════════════════════════════════════════
      const updateData: any = {
        tipo_documento: data.tipo_documento,
        numero_documento: data.numero_documento,
        fecha_emision: data.fecha_emision ? new Date(data.fecha_emision) : undefined,
        fecha_vencimiento: data.fecha_vencimiento ? new Date(data.fecha_vencimiento) : null,
        observaciones: data.observaciones,
        importe_sin_impuestos: data.base_imponible,
        importe_total: data.total,
        moneda: data.moneda || 'EUR',
      };
      if (data.año_trimestre !== undefined) updateData.año_trimestre = data.año_trimestre;
      if (data.num_trimestre !== undefined) updateData.num_trimestre = data.num_trimestre;

      await tx.documentos.update({ where: { id: BigInt(id) }, data: updateData });

      // ═══════════════════════════════════════════════════════════
      // PASO 3.5: Actualizar datos_extra (CIF, Descuentos, Suplidos)
      // ═══════════════════════════════════════════════════════════
      let hasDatosExtraUpdates = false;
      let datosExtra: any = {};
      try {
        datosExtra = typeof doc.datos_extra === 'string' ? JSON.parse(doc.datos_extra) : doc.datos_extra || {};
      } catch (e) {
        datosExtra = {};
      }

      if ((data as any).cif !== undefined) {
        if (datosExtra.CLIENTE) datosExtra.CLIENTE.CIF = (data as any).cif;
        if (datosExtra.METADATOS) datosExtra.METADATOS.NIF_CIF_RELACIONADO = (data as any).cif;
        if (datosExtra.EMPRESA_EMISORA) datosExtra.EMPRESA_EMISORA.CIF = (data as any).cif;
        if (!datosExtra.CLIENTE && !datosExtra.METADATOS && !datosExtra.EMPRESA_EMISORA) {
          datosExtra.CLIENTE = { CIF: (data as any).cif };
        }
        hasDatosExtraUpdates = true;
      }

      if (data.descuento_global !== undefined) {
        datosExtra.descuento_global = data.descuento_global;
        hasDatosExtraUpdates = true;
      }
      
      if (data.base_no_sujeta !== undefined) {
        datosExtra.base_no_sujeta = data.base_no_sujeta;
        hasDatosExtraUpdates = true;
      }

      if (hasDatosExtraUpdates) {
        await tx.documentos.update({ where: { id: BigInt(id) }, data: { datos_extra: datosExtra } });
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 4: Actualizar entidades
      // ═══════════════════════════════════════════════════════════
      await tx.entidades_documento.deleteMany({ where: { documento_id: BigInt(id) } });
      if ((data.entidades || []).length > 0) {
        await tx.entidades_documento.createMany({
          data: (data.entidades || []).map(entidad => ({
            documento_id: BigInt(id),
            nombre: entidad.nombre,
            identificador_fiscal: entidad.identificador_fiscal,
            identificador_fiscal_hash: entidad.identificador_fiscal ? require('crypto').createHash('sha256').update(entidad.identificador_fiscal.toLowerCase().trim()).digest('hex') : null,
            nombre_hash: entidad.nombre ? require('crypto').createHash('sha256').update(normalizeEntityName(entidad.nombre)).digest('hex') : null,
            direccion: entidad.direccion,
            telefono: entidad.telefono || '',
            email: entidad.email || '',
            rol: entidad.rol,
            datos_extra: entidad.datos_extra || {},
            id_de_empresa: empresaId ? BigInt(empresaId) : null
          }))
        });
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 5: Actualizar líneas (estrategia PATCH)
      // ═══════════════════════════════════════════════════════════
      const lineasExistentes = await tx.lineas_documento.findMany({ where: { documento_id: BigInt(id) }, orderBy: { id: 'asc' } });
      const lineasNuevas = data.lineas || [];

      // Batch strategy: delete all + recreate. Avoids N serial UPDATE queries that blow the tx timeout.
      await tx.lineas_documento.deleteMany({ where: { documento_id: BigInt(id) } });
      if (lineasNuevas.length > 0) {
        await tx.lineas_documento.createMany({
          data: lineasNuevas.map((lineaNueva: any) => ({
            documento_id: BigInt(id),
            codigo: lineaNueva.codigo || '',
            descripcion: lineaNueva.descripcion,
            cantidad: lineaNueva.cantidad,
            unidad: lineaNueva.unidad,
            precio_unitario: lineaNueva.precio_unitario,
            descuento_porcentaje: lineaNueva.descuento_porcentaje,
            precio_neto: lineaNueva.precio_neto,
            importe_linea: lineaNueva.importe_linea,
            datos_extra: lineaNueva.datos_extra || {},
            id_de_empresa: empresaId ? BigInt(empresaId) : null
          }))
        });
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 6: Actualizar impuestos
      // ═══════════════════════════════════════════════════════════
      await tx.impuestos_documento.deleteMany({ where: { documento_id: BigInt(id) } });
      if ((data.iva_details || []).length > 0) {
        await tx.impuestos_documento.createMany({
          data: (data.iva_details || []).map(iva => ({
            documento_id: BigInt(id),
            tipo_impuesto: iva.tipo_impuesto || 'IVA',
            porcentaje: iva.porcentaje,
            base_imponible: iva.base_imponible,
            cuota: iva.cuota,
            total_con_impuesto: iva.base_imponible + iva.cuota,
            id_de_empresa: empresaId ? BigInt(empresaId) : null
          }))
        });
      }

      // ═══════════════════════════════════════════════════════════
      // PASO 6.5: Auditoría (VeriFactu)
      // ═══════════════════════════════════════════════════════════
      try {
        camposReales = compareDocumentStates(oldSnapshot, data);
      } catch (err) {
        camposReales = Object.keys(data);
      }

      let newSnapshot = null;
      try {
        newSnapshot = await getSnapshotBeforeUpdate(id, tx);
      } catch (err) {
        console.warn('⚠️ [updateDocument] Falló captura de snapshot nuevo:', err);
      }

      if (camposReales.length > 0) {
        await tx.documentos_auditoria.create({
          data: {
            documento_id: BigInt(id),
            id_de_empresa: empresaId ? BigInt(empresaId) : BigInt(0),
            accion: 'UPDATE',
            usuario: userIdentifier,
            detalle: JSON.stringify({ modificados: camposReales, previo: oldSnapshot, actual: newSnapshot }),
            fecha_accion: new Date()
          }
        });
      }

    }, {
      maxWait: 10000,
      timeout: 30000,
    });

    console.log('🎉 [updateDocument] Transacción completada exitosamente');
    console.log('═══════════════════════════════════════════════════════════');

    // 🚀 FIRE AND FORGET: Validación asíncrona de incidencias
    validateIncidentsAsync(id).catch(err => {
      console.error('❌ [Background] Error en validación de incidencias:', err);
    });

    runHealthChecksForDocument(id).catch(err => {
      console.error('❌ [Background] Error en health check:', err);
    });

    // 🔔 WEBHOOKS TRIGGER: Documento Modificado
    if (camposReales.length > 0) {
      const updatedDoc = await prisma.documentos.findUnique({
        where: { id: BigInt(id) },
        select: { tipo_documento: true, numero_documento: true, importe_total: true, fecha_emision: true }
      });

      if (updatedDoc) {
        fireWebhook(empresaId, 'documento.modificado', { 
          documento_id: id,
          campos_actualizados: camposReales,
          tipo_documento: updatedDoc.tipo_documento,
          numero_documento: updatedDoc.numero_documento,
          importe_total: updatedDoc.importe_total,
          fecha_emision: updatedDoc.fecha_emision
        }).catch(err => {
          console.error('❌ [Background] Error disparando webhook de modificación:', err);
        });
      }
    }

    return { success: true };
  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ [updateDocument] ERROR CRÍTICO');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ Error:', error);
    console.error('❌ Error message:', error?.message);
    console.error('═══════════════════════════════════════════════════════════');
    
    // We no longer need to manually rollback since Prisma handles it
    return { success: false };
  }
}


// ✅ ARREGLADO: Tipado de tx como Prisma client
async function recalculateDocumentTotals(docId: number, tx: any = prisma) {
  // Recalculate base_imponible from lines via Prisma aggregation
  const lineSum = await tx.lineas_documento.aggregate({
    where: { documento_id: BigInt(docId) },
    _sum: { importe_linea: true }
  });
  const baseImponible = Number(lineSum._sum.importe_linea) || 0;

  // Recalculate total_iva from taxes (excluding retentions)
  const taxSum = await tx.impuestos_documento.aggregate({
    where: { documento_id: BigInt(docId), NOT: { tipo_impuesto: { contains: 'retencion' } } },
    _sum: { cuota: true }
  });
  const totalIva = Number(taxSum._sum.cuota) || 0;

  // Get total retentions
  const retentionSum = await tx.impuestos_documento.aggregate({
    where: { documento_id: BigInt(docId), tipo_impuesto: { contains: 'retencion' } },
    _sum: { cuota: true }
  });
  const totalRetention = Number(retentionSum._sum.cuota) || 0;

  // The total is base + taxes - retentions
  const total = baseImponible + totalIva + totalRetention;

  await tx.documentos.update({
    where: { id: BigInt(docId) },
    data: { importe_sin_impuestos: baseImponible, importe_total: total }
  });
}

export async function updateDocumentField(id: number, fieldName: string, value: any, userIdentifier: string = 'Sistema'): Promise<{ success: boolean }> {
  if (userIdentifier === 'Sistema') {
    const sessionUser = await getCurrentUser();
    if (sessionUser?.email) userIdentifier = sessionUser.email;
  }

  try {
    await prisma.$transaction(async (tx) => {
      let oldSnapshot = null;
      try {
        oldSnapshot = await getSnapshotBeforeUpdate(id, tx);
      } catch (e) {
        console.warn('⚠️ [updateDocumentField] Falló captura de snapshot previo:', e);
      }

      // ✅ CAMBIO: Verificar trimestre_cerrado en lugar de trimestre actual
      const doc = await tx.documentos.findUnique({
        where: { id: BigInt(id) },
        select: { trimestre_cerrado: true, datos_extra: true, id_de_empresa: true }
      });

      if (!doc) throw new Error('Documento no encontrado.');

      const isChangingTipoDocumento = fieldName === 'tipo_documento';
      if (doc.trimestre_cerrado === true && !isChangingTipoDocumento) {
        throw new Error('No se pueden editar campos de documentos de trimestres cerrados.');
      }

      const directDocumentFields = ['numero_documento', 'fecha_emision', 'fecha_vencimiento', 'base_imponible', 'total', 'observaciones', 'tipo_documento', 'incidencia', 'incidencia_razon'];

      if (directDocumentFields.includes(fieldName)) {
        const dbFieldName = fieldName === 'base_imponible' ? 'importe_sin_impuestos' : fieldName === 'total' ? 'importe_total' : fieldName;
        await tx.documentos.update({ where: { id: BigInt(id) }, data: { [dbFieldName]: value } });

        // Recalcular trimestre al cambiar fecha contable
        if (fieldName === 'fecha_emision' && doc.id_de_empresa) {
          const trim = await resolverTrimestreContableImportacion(
            parseFechaLocal(value),
            Number(doc.id_de_empresa),
            null
          );
          await tx.documentos.update({
            where: { id: BigInt(id) },
            data: { año_trimestre: trim.año, num_trimestre: trim.trimestre },
          });
        }
      } else if (fieldName === 'cif') {
        let datosExtra: any = {};
        try {
          datosExtra = typeof doc.datos_extra === 'string' ? JSON.parse(doc.datos_extra) : doc.datos_extra || {};
        } catch (e) {
          datosExtra = {};
        }
        if (datosExtra.CLIENTE) datosExtra.CLIENTE.CIF = value;
        if (datosExtra.METADATOS) datosExtra.METADATOS.NIF_CIF_RELACIONADO = value;
        if (datosExtra.EMPRESA_EMISORA) datosExtra.EMPRESA_EMISORA.CIF = value;
        if (!datosExtra.CLIENTE && !datosExtra.METADATOS && !datosExtra.EMPRESA_EMISORA) {
          datosExtra.METADATOS = { NIF_CIF_RELACIONADO: value };
        }
        await tx.documentos.update({ where: { id: BigInt(id) }, data: { datos_extra: datosExtra } });
      } else if (fieldName === 'proveedor_nombre' || fieldName === 'proveedor_cif') {
        const fieldToUpdate = fieldName === 'proveedor_nombre' ? 'nombre' : 'identificador_fiscal';
        const existing = await tx.entidades_documento.findFirst({
          where: { documento_id: BigInt(id), rol: { in: ['proveedor', 'emisor'] } }
        });

        if (existing) {
          await tx.entidades_documento.update({
            where: { id: existing.id },
            data: { [fieldToUpdate]: value }
          });
        } else {
          await tx.entidades_documento.create({
            data: { documento_id: BigInt(id), rol: 'proveedor', [fieldToUpdate]: value } as any
          });
        }
      } else if (fieldName.startsWith('iva_base_') || fieldName.startsWith('iva_cuota_')) {
        const parts = fieldName.split('_');
        const type = parts[1]; // 'base' or 'cuota'
        const percentage = parseInt(parts[2], 10);
        const fieldToUpdate = type === 'base' ? 'base_imponible' : 'cuota';

        const existing = await tx.impuestos_documento.findFirst({
          where: {
            documento_id: BigInt(id),
            porcentaje: percentage,
            OR: [
              { tipo_impuesto: null },
              { NOT: { tipo_impuesto: { contains: 'retencion' } } }
            ]
          }
        });

        if (existing) {
          await tx.impuestos_documento.update({
            where: { id: existing.id },
            data: { [fieldToUpdate]: value }
          });
        } else {
          const base = type === 'base' ? value : 0;
          const cuota = type === 'cuota' ? value : 0;
          await tx.impuestos_documento.create({
            data: { documento_id: BigInt(id), tipo_impuesto: 'IVA', porcentaje: percentage, base_imponible: base, cuota, total_con_impuesto: base + cuota } as any
          });
        }
      } else if (fieldName === 'retencion') {
        const existing = await tx.impuestos_documento.findFirst({
          where: { documento_id: BigInt(id), tipo_impuesto: { contains: 'retencion' } }
        });
        if (existing) {
          await tx.impuestos_documento.update({
            where: { id: existing.id },
            data: { cuota: value }
          });
        } else {
          await tx.impuestos_documento.create({
            data: { documento_id: BigInt(id), tipo_impuesto: 'Retencion', porcentaje: 0, base_imponible: 0, cuota: value, total_con_impuesto: value } as any
          });
        }
      } else if (fieldName === 'recargo') {
        const existing = await tx.impuestos_documento.findFirst({
          where: { documento_id: BigInt(id), tipo_impuesto: { contains: 'recargo' } }
        });
        if (existing) {
          await tx.impuestos_documento.update({
            where: { id: existing.id },
            data: { cuota: value }
          });
        } else {
          await tx.impuestos_documento.create({
            data: { documento_id: BigInt(id), tipo_impuesto: 'Recargo de Equivalencia', porcentaje: 0, base_imponible: 0, cuota: value, total_con_impuesto: value } as any
          });
        }
      } else {
        throw new Error(`El campo '${fieldName}' no es editable o no se reconoce.`);
      }

      await recalculateDocumentTotals(id, tx);

      const empresaId = doc.id_de_empresa ? Number(doc.id_de_empresa) : 0;

      let newSnapshot = null;
      try {
        newSnapshot = await getSnapshotBeforeUpdate(id, tx);
      } catch (err) {
        console.warn('⚠️ [updateDocumentField] Falló captura de snapshot nuevo:', err);
      }

      await tx.documentos_auditoria.create({
        data: {
          documento_id: BigInt(id),
          id_de_empresa: BigInt(empresaId),
          accion: 'UPDATE_FIELD',
          usuario: userIdentifier,
          detalle: JSON.stringify({ modificados: [fieldName], previo: oldSnapshot, actual: newSnapshot }),
          fecha_accion: new Date()
        }
      });
    }, {
      maxWait: 5000,
      timeout: 10000,
    });

    validateIncidentsAsync(id).catch(err => {
      console.error('❌ [Background] Error en validación de incidencias:', err);
    });

    runHealthChecksForDocument(id).catch(err => {
      console.error('❌ [Background] Error en health check:', err);
    });

    const updatedDoc = await prisma.documentos.findUnique({
      where: { id: BigInt(id) },
      select: { id_de_empresa: true }
    });

    if (updatedDoc && updatedDoc.id_de_empresa) {
      fireWebhook(Number(updatedDoc.id_de_empresa), 'documento.modificado', { documento_id: id }).catch(err => {
        console.error('❌ [Background] Error disparando webhook de modificación:', err);
      });
    }

    return { success: true };
  } catch (error) {
    console.error('Failed to update field:', error);
    throw error;
  }
}



/**
 * Crea un nuevo documento
 */
export async function createDocument(payload: CreateDocumentPayload): Promise<{ success: boolean; id?: number; error?: string }> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return {
        success: false,
        error: 'Usuario no autenticado'
      };
    }

    const {
      tipo_documento,
      numero_documento,
      fecha_emision,
      fecha_vencimiento,
      importe_total,
      importe_sin_impuestos,
      moneda,
      observaciones,
      empresa_id
    } = payload;

    const newDoc = await prisma.documentos.create({
      data: {
        tipo_documento,
        numero_documento: numero_documento || 'S/N',
        fecha_emision: new Date(fecha_emision),
        fecha_vencimiento: fecha_vencimiento ? new Date(fecha_vencimiento) : null,
        importe_total: importe_total || 0,
        importe_sin_impuestos: importe_sin_impuestos || 0,
        moneda: moneda || 'EUR',
        observaciones,
        id_de_empresa: empresa_id ? BigInt(empresa_id) : null
      }
    });

    revalidatePath('/documents');
    return { success: true, id: Number(newDoc.id) };
  } catch (error) {
    console.error('Error creating document:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido al crear el documento'
    };
  }
}
/**
 * Mueve un documento a otra empresa
 */
export async function moveDocument(
  documentId: number,
  newEmpresaId: number,
  userId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🔄 [moveDocument] Iniciando - Doc:', documentId, 'Nueva empresa:', newEmpresaId);

    // Verificar que el documento existe y pertenece a una empresa del usuario
    const docRow = await prisma.documentos.findFirst({
      where: { id: BigInt(documentId), empresas: { id_de_usuario: { array_contains: userId } } },
      select: { id: true, id_de_empresa: true, trimestre_cerrado: true, num_trimestre: true, año_trimestre: true }
    });

    if (!docRow) {
      console.error('❌ [moveDocument] Documento no encontrado o no pertenece al usuario');
      return {
        success: false,
        error: 'Documento no encontrado o no tienes permisos para moverlo'
      };
    }

    if (docRow.trimestre_cerrado) {
      console.warn(`⚠️ [moveDocument] Intento de mover documento en trimestre cerrado: ${docRow.año_trimestre}Q${docRow.num_trimestre}`);
      return {
        success: false,
        error: `No se puede mover el documento porque pertenece al trimestre ${docRow.año_trimestre}Q${docRow.num_trimestre}, el cual ya está cerrado.`
      };
    }

    const currentEmpresaId = Number(docRow.id_de_empresa);

    if (currentEmpresaId === newEmpresaId) {
      console.warn('⚠️ [moveDocument] El documento ya está en esa empresa');
      return {
        success: false,
        error: 'El documento ya pertenece a esa empresa'
      };
    }

    // Verificar que la nueva empresa existe y pertenece al usuario
    const targetEmpresa = await prisma.empresas.findFirst({
      where: { id: BigInt(newEmpresaId), id_de_usuario: { array_contains: userId } } as any
    });

    if (!targetEmpresa) {
      console.error('❌ [moveDocument] Empresa destino no encontrada');
      return {
        success: false,
        error: 'La empresa destino no existe o no tienes permisos'
      };
    }

    // Mover el documento
    await prisma.documentos.update({
      where: { id: BigInt(documentId) },
      data: { id_de_empresa: BigInt(newEmpresaId) }
    });

    if (false) { // kept for structure
      console.error('❌ [moveDocument] No se pudo actualizar el documento');
      return {
        success: false,
        error: 'No se pudo mover el documento'
      };
    }

    console.log('✅ [moveDocument] Documento movido exitosamente');

    // Revalidar rutas relevantes
    revalidatePath('/documents');
    revalidatePath('/dashboard');

    return { success: true };

  } catch (error) {
    console.error('❌ [moveDocument] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido al mover el documento'
    };
  }
}
/**
* Elimina un documento del usuario actual
*/
/**
 * Elimina un documento del usuario actual
 */
/**
 * Elimina un documento del usuario actual
 */
/**
 * Elimina un documento del usuario actual
 */
/**
 * Elimina un documento del usuario actual
 */
export async function deleteDocument(
  documentId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('🗑️ [deleteDocument] Iniciando eliminación de documento:', documentId);

    // Obtener el usuario actual
    const user = await getCurrentUser();
    if (!user) {
      console.error('❌ [deleteDocument] No hay usuario autenticado');
      return { success: false, error: 'Usuario no autenticado' };
    }

    // Verificar que el documento pertenece a una empresa del usuario y si está cerrado
    const docRaw = await prisma.documentos.findFirst({
      where: { id: BigInt(documentId), empresas: { id_de_usuario: { array_contains: user.id } } },
      select: { id: true, trimestre_cerrado: true, num_trimestre: true, año_trimestre: true, id_de_empresa: true, numero_documento: true, tipo_documento: true, importe_total: true, fecha_emision: true }
    });

    if (!docRaw) {
      console.error('❌ [deleteDocument] Documento no encontrado o no pertenece al usuario');
      return { success: false, error: 'Documento no encontrado' };
    }

    const docData = { ...docRaw, id_de_empresa: Number(docRaw.id_de_empresa), trimestre_cerrado: docRaw.trimestre_cerrado ? 1 : 0 };
    if (docData.trimestre_cerrado === 1) {
      console.warn(`⚠️ [deleteDocument] Intento de borrar documento en trimestre cerrado: ${docData.año_trimestre}Q${docData.num_trimestre}`);
      return {
        success: false,
        error: `No se puede eliminar el documento porque pertenece al trimestre ${docData.año_trimestre}Q${docData.num_trimestre}, el cual ya está cerrado.`
      };
    }

    let snapshot = null;
    try {
      snapshot = await getSnapshotBeforeUpdate(documentId);
    } catch (e) {
      console.warn('⚠️ [deleteDocument] Falló captura de snapshot previo a eliminar:', e);
    }

    // Auditoría DELETE sin FK al doc: fk_audit_documento es NO ACTION y bloquearía el delete.
    await prisma.documentos_auditoria.create({
      data: {
        documento_id: null,
        id_de_empresa: BigInt(docData.id_de_empresa),
        accion: 'DELETE',
        usuario: user.email || 'Desconocido',
        detalle: JSON.stringify({ documento_id: documentId, previo: snapshot }),
        fecha_accion: new Date()
      }
    });

    // Soltar FKs NO ACTION de auditorías previas (UPDATE/CREATE) que aún apuntan al doc
    await prisma.documentos_auditoria.updateMany({
      where: { documento_id: BigInt(documentId) },
      data: { documento_id: null },
    });

    // Eliminar el documento (resto de tablas relacionadas: CASCADE)
    await prisma.documentos.delete({ where: { id: BigInt(documentId) } });

    console.log('✅ [deleteDocument] Documento y auditoría eliminados correctamente');

    // 🔔 WEBHOOKS TRIGGER: Documento Eliminado
    fireWebhook(docData.id_de_empresa, 'documento.eliminado', { 
      documento_id: documentId,
      numero_documento: docData.numero_documento || null,
      tipo_documento: docData.tipo_documento || null,
      importe_total: docData.importe_total || null,
      fecha_emision: docData.fecha_emision || null

    }).catch(err => {
      console.error('❌ [Background] Error disparando webhook de eliminación:', err);
    });

    // Revalidar rutas
    revalidatePath('/documents');
    revalidatePath('/dashboard');

    return { success: true };

  } catch (error) {
    console.error('❌ [deleteDocument] Error:', error);
    return {
      success: false,
      error: 'Error al eliminar el documento'
    };
  }
}

/**
 * Elimina una empresa y TODOS sus documentos asociados
 */
export async function deleteCompany(
  empresaId: number,
  userId: number
): Promise<{ success: boolean; error?: string; documentsDeleted?: number }> {
  try {
    console.log('🗑️ [deleteCompany] Iniciando eliminación de empresa:', empresaId);

    // Verificar que la empresa pertenece al usuario
    const [companyCheck] = await db.query<RowDataPacket[]>(
      'SELECT id FROM empresas WHERE id = ? AND JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))',
      [empresaId, userId]
    );

    if (companyCheck.length === 0) {
      console.error('❌ [deleteCompany] Empresa no encontrada o no pertenece al usuario');
      return { success: false, error: 'Empresa no encontrada' };
    }

    // Contar documentos que se eliminarán
    const [docCount] = await db.query<RowDataPacket[]>(
      'SELECT COUNT(*) as count FROM documentos WHERE id_de_empresa = ?',
      [empresaId]
    );

    const documentsToDelete = docCount[0]?.count || 0;
    console.log(`📄[deleteCompany] Se eliminarán ${documentsToDelete} documento(s)`);

    // Eliminar todos los documentos de la empresa
    if (documentsToDelete > 0) {
      await prisma.documentos.deleteMany({
        where: { id_de_empresa: BigInt(empresaId) }
      });
      console.log(`✅[deleteCompany] ${documentsToDelete} documento(s) eliminado(s)`);
    }

    // Eliminar la empresa (permisos ya validados arriba)
    await prisma.empresas.delete({
      where: { id: BigInt(empresaId) }
    });

    console.log('✅ [deleteCompany] Empresa eliminada correctamente');

    // Revalidar rutas
    revalidatePath('/documents');
    revalidatePath('/dashboard');

    return {
      success: true,
      documentsDeleted: documentsToDelete
    };

  } catch (error) {
    console.error('❌ [deleteCompany] Error:', error);
    return {
      success: false,
      error: 'Error al eliminar la empresa'
    };
  }
}
export async function validateDocumentIncidents(documentId: number): Promise<{ success: boolean }> {
  // ✅ Validar incidencias del documento
  await prisma.incidencias_documento.updateMany({
    where: { documento_id: BigInt(documentId), validado: false },
    data: { validado: true, fecha_validacion: new Date(), validado_por: 'system' }
  });

  // ✅ Marcar documento como confirmado (is_new = 0)
  const doc = await prisma.documentos.findUnique({ where: { id: BigInt(documentId) }, select: { tipo_documento: true, is_new: true, id_de_empresa: true } });
  if (doc) {
    const wasNew = doc.is_new === 1;

    await prisma.documentos.update({
      where: { id: BigInt(documentId) },
      data: {
        is_new: 0,
        tipo_documento: doc.tipo_documento?.replace('(SIN CONFIRMAR)', '').trim() || ''
      }
    });

    try {
      const { getCurrentUser } = await import('./user-service');
      const user = await getCurrentUser();
      if (user) {
        const { logAuditAction } = await import('./audit-service');
        
        // Log "VALIDACION_MANUAL" (ya sea de estado sin confirmar o de incidencias)
        await logAuditAction({
          documentoId: documentId,
          empresaId: doc.id_de_empresa ? Number(doc.id_de_empresa) : null,
          accion: 'VALIDACION_MANUAL',
          usuarioEmail: user.email,
          userId: user.id,
          detalle: { source: 'dashboard_bulk_validate' }
        });

        // Si era nuevo, registrar "VISTO_POR_PRIMERA_VEZ" también, porque se confirmó sin abrir
        if (wasNew) {
          await logAuditAction({
            documentoId: documentId,
            empresaId: doc.id_de_empresa ? Number(doc.id_de_empresa) : null,
            accion: 'VISTO_POR_PRIMERA_VEZ',
            usuarioEmail: user.email,
            userId: user.id
          });
        }
      }
    } catch (auditErr) {
      console.warn('⚠️ Error registrando auditoría en validateDocumentIncidents:', auditErr);
    }
  }

  // 🔔 WEBHOOKS TRIGGER: Incidencia resuelta manualmente desde el dashboard
  try {
    const [docRows] = await db.query<RowDataPacket[]>(
      `SELECT id_de_empresa, file_hash, tipo_documento, numero_documento, importe_total FROM documentos WHERE id = ? LIMIT 1`,
      [documentId]
    );
    if (docRows.length > 0) {
      const empresaId = docRows[0].id_de_empresa;
      await fireWebhook(empresaId, 'incidencia.resuelta_manualmente', {
        documento_id: documentId,
        validado_por: 'dashboard',
        quedan_incidencias_pendientes: false
      });
      // Al validar todas desde el dashboard siempre quedará limpio → listo para ERP
      await fireWebhook(empresaId, 'documento.listo_para_erp', docRows[0]);
    }
  } catch (whErr) {
    console.error('❌ [validateDocumentIncidents] Error disparando webhook:', whErr);
  }

  return { success: true };
}

export async function getUniqueProvidersCount(): Promise<number> {
  const [providerRows] = await db.query<RowDataPacket[]>(`
       SELECT COUNT(DISTINCT COALESCE(identificador_fiscal_hash, nombre_hash, id)) as count
       FROM entidades_documento
       WHERE (rol = 'proveedor' OR rol = 'emisor')
  `);

  return providerRows[0].count || 0;
}

export async function getUniqueProviders(): Promise<DocumentEntity[]> {
  // 1. Obtener los IDs de los proveedores únicos agrupando por hash
  const [providerRows] = await db.query<{ id: string }[]>(`
    SELECT MAX(id) as id
    FROM entidades_documento
    WHERE (rol = 'proveedor' OR rol = 'emisor')
    GROUP BY COALESCE(identificador_fiscal_hash, nombre_hash, id)
  `);

  if (providerRows.length === 0) return [];

  const ids = providerRows.map(p => BigInt(p.id));

  // 2. Usar Prisma para traer los datos y desencriptarlos automáticamente
  const providers = await prisma.entidades_documento.findMany({
    where: { id: { in: ids } }
  });

  // 3. Ordenar en memoria (ya que Prisma no puede ordenar campos encriptados nativamente en SQL)
  providers.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es', { sensitivity: 'base' }));

  return providers.map(p => ({
    id: Number(p.id),
    rol: p.rol,
    nombre: p.nombre,
    direccion: p.direccion,
    identificador_fiscal: p.identificador_fiscal,
    telefono: p.telefono,
    email: p.email,
    datos_extra: p.datos_extra,
    fecha_creacion: p.fecha_creacion?.toISOString()

  }));

  return serializeData(providers);
}

export async function getProvidersWithStats(companyIds: number[]): Promise<ProviderWithStats[]> {
  if (!companyIds || companyIds.length === 0) return [];

  const placeholders = companyIds.map(() => '?').join(',');
  const showCompanyName = companyIds.length > 1;

  const whereDocType = `AND(
  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%emitid%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%emitid%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )
    AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)`;

  const [providerRows] = await db.query<any[]>(`
      SELECT
        e.id as entidad_id,
        e.nombre,
        e.rol,
        e.identificador_fiscal,
        e.identificador_fiscal_hash,
        e.nombre_hash,
        e.direccion,
        e.telefono,
        e.email,
        e.datos_extra,
        e.fecha_creacion,
        d.id_de_empresa,
        d.id as documento_id,
        d.importe_total
      FROM entidades_documento e
      JOIN documentos d ON e.documento_id = d.id
      JOIN empresas emp ON d.id_de_empresa = emp.id
      -- ✅ entidades_config JOIN removido: se hace en JS post-Prisma usando fiscal desencriptado
      WHERE e.rol IN ('proveedor', 'emisor')
        AND d.id_de_empresa IN (${placeholders})
        AND NOT (
            (e.identificador_fiscal_hash = emp.cif_hash AND e.identificador_fiscal_hash IS NOT NULL AND e.identificador_fiscal_hash != '') OR
            (e.identificador_fiscal = emp.CIF AND e.identificador_fiscal IS NOT NULL AND e.identificador_fiscal != '')
        )
        ${whereDocType}
  `, companyIds);

  const docIds = [...new Set(providerRows.map(r => r.documento_id))];

  const [productRows] = docIds.length > 0 ? await db.query<any[]>(`
      SELECT DISTINCT
        documento_id,
        codigo,
        descripcion
      FROM lineas_documento
      WHERE documento_id IN(${docIds.map(() => '?').join(',')})
        AND (
          (codigo IS NOT NULL AND codigo != '')
          OR
          (descripcion IS NOT NULL AND descripcion != '')
        )
  `, docIds) : [[]];

  const productsByDoc = new Map<number, Set<string>>();
  productRows.forEach(p => {
    if (!productsByDoc.has(p.documento_id)) {
      productsByDoc.set(p.documento_id, new Set());
    }
    const key = (p.codigo && p.codigo !== '') ? p.codigo : normalizeProductDescription(p.descripcion || '');
    if (key) productsByDoc.get(p.documento_id)!.add(key);
  });

  const providerMap = new Map<string, {
    entidad_id: number;
    rol: string;
    nombre: string;
    direccion: string | null;
    identificador_fiscal: string;
    telefono: string | null;
    email: string | null;
    datos_extra: any;
    fecha_creacion: string | null;
    cuenta_compra: string | null; // se rellena post-Prisma
    cuenta_venta: string | null;  // se rellena post-Prisma
    empresas: Set<string>;
    totalSpent: number;
    documentos: Set<number>;
    productos: Set<string>;
  }>();

  const empresaIds = [...new Set(providerRows.map(r => Number(r.id_de_empresa)))];
  const empresasData = empresaIds.length > 0 ? await prisma.empresas.findMany({
    where: { id: { in: empresaIds } },
    select: { id: true, nombre_de_empresa: true }
  }) : [];
  const empresasMap = new Map(empresasData.map(e => [Number(e.id), e.nombre_de_empresa || '']));

  providerRows.forEach(row => {
    const groupId = row.identificador_fiscal_hash || row.nombre_hash || row.nombre || `ID_${row.entidad_id}`;

    if (!providerMap.has(groupId)) {
      providerMap.set(groupId, {
        entidad_id: Number(row.entidad_id),
        rol: row.rol,
        nombre: row.nombre,
        direccion: row.direccion,
        identificador_fiscal: row.identificador_fiscal,
        telefono: row.telefono,
        email: row.email,
        datos_extra: row.datos_extra,
        fecha_creacion: row.fecha_creacion,
        cuenta_compra: null, // se rellena tras Prisma hydration
        cuenta_venta: null,  // se rellena tras Prisma hydration
        empresas: new Set(),
        totalSpent: 0,
        documentos: new Set(),
        productos: new Set(),
      });
    }

    const provider = providerMap.get(groupId)!;

    const empresaNombre = empresasMap.get(Number(row.id_de_empresa));
    if (empresaNombre) {
      provider.empresas.add(empresaNombre);
    }

    if (!provider.documentos.has(row.documento_id)) {
      provider.totalSpent += Number(row.importe_total || 0);
      provider.documentos.add(row.documento_id);
    }

    const docProducts = productsByDoc.get(row.documento_id);
    if (docProducts) {
      docProducts.forEach(codigo => provider.productos.add(codigo));
    }
  });

  const entityIds = Array.from(providerMap.values()).map(p => BigInt(p.entidad_id));
  const decryptedEntities = entityIds.length > 0 ? await prisma.entidades_documento.findMany({
    where: { id: { in: entityIds } }
  }) : [];
  
  const decryptedMap = new Map(decryptedEntities.map(e => [Number(e.id), e]));

  // ✅ Lookup entidades_config usando fiscal ya desencriptado (sin tocar la BD)
  const decryptedFiscals = decryptedEntities.map(e => e.identificador_fiscal).filter((f): f is string => !!f);
  const configs = decryptedFiscals.length > 0 ? await prisma.entidades_config.findMany({
    where: {
      empresa_id: { in: companyIds.map(id => BigInt(id)) },
      identificador_fiscal: { in: decryptedFiscals }
    },
    select: { empresa_id: true, identificador_fiscal: true, cuenta_compra: true, cuenta_venta: true }
  }) : [];
  const configMap = new Map(configs.map(c => [`${c.empresa_id}_${c.identificador_fiscal}`, c]));

  const result: ProviderWithStats[] = Array.from(providerMap.values()).map(p => {
    const dec = decryptedMap.get(p.entidad_id);
    const rawDatosExtra = dec?.datos_extra || p.datos_extra;
    
    let datosExtra: DatosExtra = {};
    try {
      datosExtra = rawDatosExtra ? JSON.parse(rawDatosExtra as string) : {};
    } catch { }

    const empresaEmisora = datosExtra.EMPRESA_EMISORA || {};

    const empresasArray = Array.from(p.empresas);
    const empresaNombre = showCompanyName && empresasArray.length > 0
      ? empresasArray.join(', ')
      : undefined;

    return {
      rol: dec?.rol || p.rol || 'N/A',
      nombre: dec?.nombre || empresaEmisora.NOMBRE || 'N/A',
      direccion: dec?.direccion || empresaEmisora.DIRECCION || 'N/A',
      identificador_fiscal: dec?.identificador_fiscal || empresaEmisora.CIF || 'N/A',
      telefono: dec?.telefono || empresaEmisora.TELEFONO || 'N/A',
      email: dec?.email || empresaEmisora.EMAIL || 'N/A',
      totalSpent: p.totalSpent,
      totalDocuments: p.documentos.size,
      uniqueProducts: p.productos.size,
      datos_extra: rawDatosExtra as any || null,
      fecha_creacion: dec?.fecha_creacion?.toISOString() || p.fecha_creacion || null,
      empresaNombre: empresaNombre,
      // ✅ Cuenta contable via configMap (fiscal desencriptado de Prisma → entidades_config plaintext)
      ...(() => {
        const decFiscal = dec?.identificador_fiscal;
        const conf = decFiscal ? configMap.get(`${p.id_de_empresa}_${decFiscal}`) : undefined;
        return { cuenta_compra: conf?.cuenta_compra ?? null, cuenta_venta: conf?.cuenta_venta ?? null };
      })(),
    };
  });

  result.sort((a, b) => b.totalSpent - a.totalSpent);

  return result;
}

export async function getClientsWithStats(companyIds: number[]): Promise<ProviderWithStats[]> {
  if (!companyIds || companyIds.length === 0) return [];

  const placeholders = companyIds.map(() => '?').join(',');
  const showCompanyName = companyIds.length > 1;

  // Clientes solo aparecen en facturas EMITIDAS por la empresa
  const whereDocType = `AND(
  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) LIKE '%emitid%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) LIKE '%emitid%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )
    AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)`;

  const [providerRows] = await db.query<any[]>(`
      SELECT
        e.id as entidad_id,
        e.nombre,
        e.rol,
        e.identificador_fiscal,
        e.identificador_fiscal_hash,
        e.nombre_hash,
        e.direccion,
        e.telefono,
        e.email,
        e.datos_extra,
        e.fecha_creacion,
        d.id_de_empresa,
        d.id as documento_id,
        d.importe_total
      FROM entidades_documento e
      JOIN documentos d ON e.documento_id = d.id
      JOIN empresas emp ON d.id_de_empresa = emp.id
      -- ✅ entidades_config JOIN removido: se hace en JS post-Prisma usando fiscal desencriptado
      WHERE e.rol IN ('cliente', 'receptor')
        AND d.id_de_empresa IN (${placeholders})
        AND NOT (
            (e.identificador_fiscal_hash = emp.cif_hash AND e.identificador_fiscal_hash IS NOT NULL AND e.identificador_fiscal_hash != '') OR
            (e.identificador_fiscal = emp.CIF AND e.identificador_fiscal IS NOT NULL AND e.identificador_fiscal != '')
        )
        ${whereDocType}
  `, companyIds);

  const docIds = [...new Set(providerRows.map(r => r.documento_id))];

  const [productRows] = docIds.length > 0 ? await db.query<any[]>(`
      SELECT DISTINCT
        documento_id,
        codigo,
        descripcion
      FROM lineas_documento
      WHERE documento_id IN(${docIds.map(() => '?').join(',')})
        AND (
          (codigo IS NOT NULL AND codigo != '')
          OR
          (descripcion IS NOT NULL AND descripcion != '')
        )
  `, docIds) : [[]];

  const productsByDoc = new Map<number, Set<string>>();
  productRows.forEach(p => {
    if (!productsByDoc.has(p.documento_id)) {
      productsByDoc.set(p.documento_id, new Set());
    }
    const key = (p.codigo && p.codigo !== '') ? p.codigo : normalizeProductDescription(p.descripcion || '');
    if (key) productsByDoc.get(p.documento_id)!.add(key);
  });

  const providerMap = new Map<string, {
    entidad_id: number;
    rol: string;
    nombre: string;
    direccion: string | null;
    identificador_fiscal: string;
    telefono: string | null;
    email: string | null;
    datos_extra: any;
    fecha_creacion: string | null;
    cuenta_compra: string | null;
    cuenta_venta: string | null;
    empresas: Set<string>;
    totalSpent: number;
    documentos: Set<number>;
    productos: Set<string>;
  }>();

  const empresaIds = [...new Set(providerRows.map(r => Number(r.id_de_empresa)))];
  const empresasData = empresaIds.length > 0 ? await prisma.empresas.findMany({
    where: { id: { in: empresaIds } },
    select: { id: true, nombre_de_empresa: true }
  }) : [];
  const empresasMap = new Map(empresasData.map(e => [Number(e.id), e.nombre_de_empresa || '']));

  providerRows.forEach(row => {
    const groupId = row.identificador_fiscal_hash || row.nombre_hash || row.nombre || `ID_${row.entidad_id}`;

    if (!providerMap.has(groupId)) {
      providerMap.set(groupId, {
        entidad_id: Number(row.entidad_id),
        rol: row.rol,
        nombre: row.nombre,
        direccion: row.direccion,
        identificador_fiscal: row.identificador_fiscal,
        telefono: row.telefono,
        email: row.email,
        datos_extra: row.datos_extra,
        fecha_creacion: row.fecha_creacion,
        cuenta_compra: row.cuenta_compra,
        cuenta_venta: row.cuenta_venta,
        empresas: new Set(),
        totalSpent: 0,
        documentos: new Set(),
        productos: new Set(),
      });
    }

    const provider = providerMap.get(groupId)!;

    const empresaNombre = empresasMap.get(Number(row.id_de_empresa));
    if (empresaNombre) {
      provider.empresas.add(empresaNombre);
    }

    if (!provider.documentos.has(row.documento_id)) {
      provider.totalSpent += Number(row.importe_total || 0);
      provider.documentos.add(row.documento_id);
    }

    const docProducts = productsByDoc.get(row.documento_id);
    if (docProducts) {
      docProducts.forEach(codigo => provider.productos.add(codigo));
    }
  });

  const entityIds = Array.from(providerMap.values()).map(p => BigInt(p.entidad_id));
  const decryptedEntities = entityIds.length > 0 ? await prisma.entidades_documento.findMany({
    where: { id: { in: entityIds } }
  }) : [];
  
  const decryptedMap = new Map(decryptedEntities.map(e => [Number(e.id), e]));

  // ✅ Lookup entidades_config usando fiscal ya desencriptado (sin tocar la BD)
  const decryptedFiscals = decryptedEntities.map(e => e.identificador_fiscal).filter((f): f is string => !!f);
  const configs = decryptedFiscals.length > 0 ? await prisma.entidades_config.findMany({
    where: {
      empresa_id: { in: companyIds.map(id => BigInt(id)) },
      identificador_fiscal: { in: decryptedFiscals }
    },
    select: { empresa_id: true, identificador_fiscal: true, cuenta_compra: true, cuenta_venta: true }
  }) : [];
  const configMap = new Map(configs.map(c => [`${c.empresa_id}_${c.identificador_fiscal}`, c]));


  const result: ProviderWithStats[] = Array.from(providerMap.values()).map(p => {
    const dec = decryptedMap.get(p.entidad_id);
    const rawDatosExtra = dec?.datos_extra || p.datos_extra;
    
    let datosExtra: DatosExtra = {};
    try {
      datosExtra = rawDatosExtra ? JSON.parse(rawDatosExtra as string) : {};
    } catch { }

    const empresaEmisora = datosExtra.EMPRESA_EMISORA || {};

    const empresasArray = Array.from(p.empresas);
    const empresaNombre = showCompanyName && empresasArray.length > 0
      ? empresasArray.join(', ')
      : undefined;

    return {
      rol: dec?.rol || p.rol || 'N/A',
      nombre: dec?.nombre || empresaEmisora.NOMBRE || 'N/A',
      direccion: dec?.direccion || empresaEmisora.DIRECCION || 'N/A',
      identificador_fiscal: dec?.identificador_fiscal || empresaEmisora.CIF || 'N/A',
      telefono: dec?.telefono || empresaEmisora.TELEFONO || 'N/A',
      email: dec?.email || empresaEmisora.EMAIL || 'N/A',
      totalSpent: p.totalSpent,
      totalDocuments: p.documentos.size,
      uniqueProducts: p.productos.size,
      datos_extra: rawDatosExtra as any || null,
      fecha_creacion: dec?.fecha_creacion?.toISOString() || p.fecha_creacion || null,
      empresaNombre: empresaNombre,
      // ✅ Cuenta contable via configMap (fiscal desencriptado de Prisma → entidades_config plaintext)
      ...(() => {
        const decFiscal = dec?.identificador_fiscal;
        const conf = decFiscal ? configMap.get(`${p.id_de_empresa}_${decFiscal}`) : undefined;
        return { cuenta_compra: conf?.cuenta_compra ?? null, cuenta_venta: conf?.cuenta_venta ?? null };
      })(),
    };
  });

  result.sort((a, b) => b.totalSpent - a.totalSpent);

  return result;
}

export async function getAllProducts(): Promise<number> {
  const [lineaRows] = await db.query<RowDataPacket[]>(`
        SELECT COUNT(DISTINCT codigo) as count
        FROM lineas_documento
        WHERE codigo IS NOT NULL AND codigo != ''
  `);

  return lineaRows[0].count || 0;
}

// Get by fiscal Id, as name can be repeated or contain special chars
export async function getDocumentsByProviderName(
  fiscalId: string,
  empresaIds?: number[]
): Promise<Document[]> {
  const fiscalIdHash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');
  console.log('🔍 [getDocumentsByProviderName] Iniciando:', { fiscalId, empresaIds });

  let query = `
        SELECT DISTINCT d.*
        FROM documentos d
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
  AND(ed.rol = 'proveedor' OR ed.rol = 'emisor')
          AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
    `;

  const params: any[] = [fiscalIdHash, fiscalId];

  // ✅ Agregar filtro de empresas si se especifica
  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    query += ` AND d.id_de_empresa IN(${placeholders})`;
    params.push(...empresaIds);
  }

  query += ' ORDER BY d.fecha_emision DESC';

  console.log('📝 [getDocumentsByProviderName] Query:', query);
  console.log('📝 [getDocumentsByProviderName] Params:', params);

  const [documentRows] = await db.query<DocumentPacket[]>(query, params);

  console.log('📊 [getDocumentsByProviderName] Documentos encontrados:', documentRows.length);

  return mapDocumentPacketsToDocuments(documentRows);
}

export async function getProviderByFiscalId(fiscalId: string): Promise<DocumentEntity | null> {
  if (!fiscalId) return null;
  const hash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');

  // Usamos SQL crudo primero para el ID, porque Prisma intercepta la consulta
  // e intenta encriptar 'fiscalId', lo cual falla contra la base de datos pre-migración.
  const [rows] = await db.query<{ id: string }[]>(`
    SELECT id FROM entidades_documento
    WHERE (identificador_fiscal_hash = ? OR identificador_fiscal = ?)
    AND rol IN ('proveedor', 'emisor')
    LIMIT 1
  `, [hash, fiscalId]);

  if (rows.length === 0) return null;

  const p = await prisma.entidades_documento.findUnique({
    where: { id: BigInt(rows[0].id) }
  });

  if (!p) return null;

  const provider: DocumentEntity = {
    id: Number(p.id),
    rol: p.rol,
    nombre: p.nombre,
    direccion: p.direccion,
    identificador_fiscal: p.identificador_fiscal,
    telefono: p.telefono,
    email: p.email,
    datos_extra: safeJsonParse(p.datos_extra as string),
    fecha_creacion: p.fecha_creacion
  };

  return serializeData(provider);
}

export async function getProductsByProviderName(
  fiscalId: string,
  empresaIds?: number[]
): Promise<DocumentLine[]> {
  const fiscalIdHash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');
  console.log('🔍 [getProductsByProviderName] Iniciando:', { fiscalId, empresaIds });

  // 🛠️ Subquery para limpiar duplicados del JOIN antes de aplicar Window Functions
  let baseQuery = `
        WITH FilteredLines AS(
    SELECT DISTINCT
                ld.id as line_id,
    ld.documento_id,
    ld.codigo,
    ld.descripcion,
    ld.cantidad,
    ld.unidad,
    ld.precio_unitario,
    ld.descuento_porcentaje,
    ld.precio_neto,
    ld.importe_linea,
    ld.datos_extra,
    ld.cuenta_contable,
    d.id_de_empresa,
    d.fecha_emision
            FROM lineas_documento ld
            JOIN documentos d ON ld.documento_id = d.id
            JOIN entidades_documento ed ON d.id = ed.documento_id
            WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
    AND(ed.rol = 'proveedor' OR ed.rol = 'emisor')
              AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
              AND(
      (ld.codigo IS NOT NULL AND ld.codigo != '') 
                OR
      (ld.descripcion IS NOT NULL AND ld.descripcion != '')
  )
    `;

  const params: any[] = [fiscalIdHash, fiscalId];

  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    baseQuery += ` AND d.id_de_empresa IN(${placeholders})`;
    params.push(...empresaIds);
  }

  baseQuery += `
        ),
        RankedLines AS(
    SELECT
    *,
    -- ✅ Ahora el COUNT funciona bien porque FilteredLines ya no tiene duplicados de JOIN
                COUNT(*) OVER(
      PARTITION BY(CASE 
                        WHEN codigo IS NOT NULL AND codigo != '' THEN codigo 
                        ELSE descripcion 
                    END)
    ) as veces_comprado,
    SUM(cantidad) OVER(
      PARTITION BY(CASE 
                        WHEN codigo IS NOT NULL AND codigo != '' THEN codigo 
                        ELSE descripcion 
                    END)
    ) as total_cantidad_comprada,
    ROW_NUMBER() OVER(
      PARTITION BY(CASE 
                        WHEN codigo IS NOT NULL AND codigo != '' THEN codigo 
                        ELSE descripcion 
                    END) 
                    ORDER BY fecha_emision DESC
    ) as rn
            FROM FilteredLines
  )
SELECT * FROM RankedLines WHERE rn = 1
        ORDER BY descripcion ASC
  `;

  const [lineaRows] = await db.query<any[]>(baseQuery, params);

  const products: DocumentLine[] = lineaRows.map(l => ({
    id: l.line_id,
    documento_id: l.documento_id,
    id_de_empresa: l.id_de_empresa || l.empresa_id,
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    unidad: l.unidad,
    precio_unitario: l.precio_unitario,
    descuento_porcentaje: l.descuento_porcentaje,
    precio_neto: l.precio_neto,
    importe_linea: l.importe_linea,
    datos_extra: safeJsonParse(l.datos_extra),
    fecha_emision: l.fecha_emision,
    cuenta_contable: l.cuenta_contable,
    total_cantidad_comprada: l.total_cantidad_comprada,
    veces_comprado: l.veces_comprado,
  }));

  return serializeData(products);
}

export async function getAllProductLinesByProviderName(
  fiscalId: string,
  empresaIds?: number[]
): Promise<DocumentLine[]> {
  const fiscalIdHash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');
  console.log('🔍 [getAllProductLinesByProviderName] Iniciando:', { fiscalId, empresaIds });

  let baseQuery = `
SELECT
ld.*,
  d.id_de_empresa,
  d.fecha_emision,
  d.numero_documento
      FROM lineas_documento ld
      JOIN documentos d ON ld.documento_id = d.id
      JOIN entidades_documento ed ON d.id = ed.documento_id
      WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
  AND(ed.rol = 'proveedor' OR ed.rol = 'emisor')
        AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
AND(
  (ld.codigo IS NOT NULL AND ld.codigo != '')
OR
  (ld.descripcion IS NOT NULL AND ld.descripcion != '')
        )
`;

  const params: any[] = [fiscalIdHash, fiscalId];

  // ✅ Agregar filtro de empresas si se especifica
  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    baseQuery += ` AND d.id_de_empresa IN(${placeholders})`;
    params.push(...empresaIds);
  }

  baseQuery += ` ORDER BY d.fecha_emision DESC`;

  console.log('📝 [getAllProductLinesByProviderName] Query:', baseQuery);

  const [lineaRows] = await db.query<LineaPacket[]>(baseQuery, params);

  console.log('📊 [getAllProductLinesByProviderName] Productos encontrados:', lineaRows.length);

  const products: DocumentLine[] = lineaRows.map(l => ({
    id: l.id,
    documento_id: l.documento_id,
    id_de_empresa: l.id_de_empresa,
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    unidad: l.unidad,
    precio_unitario: l.precio_unitario,
    descuento_porcentaje: l.descuento_porcentaje,
    precio_neto: l.precio_neto,
    importe_linea: l.importe_linea,
    datos_extra: safeJsonParse(l.datos_extra),
    fecha_creacion: l.fecha_creacion,
    fecha_emision: l.fecha_emision,
    numero_documento: l.numero_documento,
    cuenta_contable: l.cuenta_contable,
  }));

  return serializeData(products);
}

export async function getProductHistory(
  providerFiscalId: string,
  identifier: string,
  searchBy: 'code' | 'description' = 'code',
  descriptionFilter?: string
): Promise<{ productInfo: DocumentLine | null, history: DocumentLine[] }> {
  const fiscalIdHash = require('crypto').createHash('sha256').update(providerFiscalId.toLowerCase().trim()).digest('hex');

  // ✅ Usamos ROW_NUMBER con PARTITION BY d.numero_documento
  // Esto elige solo UNA fila por cada número de factura repetido
  let query = `
    WITH UniqueHistory AS(
  SELECT 
            ld.id,
  ld.documento_id,
  ld.codigo,
  ld.descripcion,
  ld.cantidad,
  ld.unidad,
  ld.precio_unitario,
  ld.descuento_porcentaje,
  ld.precio_neto,
  ld.importe_linea,
  ld.cuenta_contable,
  d.fecha_emision,
  d.numero_documento,
  ROW_NUMBER() OVER(
    PARTITION BY ld.id 
                ORDER BY d.fecha_emision DESC
  ) as rn
        FROM lineas_documento ld
        JOIN documentos d ON ld.documento_id = d.id
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
  AND(ed.rol = 'proveedor' OR ed.rol = 'emisor')
          AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
          AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%'
          ${searchBy === 'code' ? 'AND ld.codigo = ?' : 'AND ld.descripcion LIKE ?'}
)
SELECT * FROM UniqueHistory 
    WHERE rn = 1 
    ORDER BY fecha_emision DESC;
`;

  const queryParams: any[] = [fiscalIdHash, providerFiscalId];
  if (searchBy === 'code') {
    queryParams.push(identifier);
  } else {
    // ✅ Hacemos que el LIKE sea más permisivo reemplazando espacios por '%' 
    // para que coincida con descripciones que tengan guiones, barras, etc.
    const searchPattern = identifier.split(/\s+/).filter(Boolean).join('%');
    queryParams.push(`%${searchPattern}%`);
  }

  const [lineaRows] = await db.query<any[]>(query, queryParams);

  if (lineaRows.length === 0) {
    return { productInfo: null, history: [] };
  }

  const history: DocumentLine[] = lineaRows
    .filter(l => {
      // ✅ Filtro semántico: usamos descriptionFilter si viene por URL (?desc=), 
      // o el identifier si estamos en una ruta de búsqueda por descripción (/DESC_...)
      const filterToUse = descriptionFilter || (searchBy === 'description' ? identifier : null);
      if (!filterToUse) return true;
      return normalizeProductDescription(l.descripcion) === filterToUse;
    })
    .map(l => ({
      id: l.id,
      documento_id: l.documento_id,
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      precio_unitario: l.precio_unitario,
      descuento_porcentaje: l.descuento_porcentaje || 0,
      precio_neto: l.precio_neto || l.precio_unitario,
      importe_linea: l.importe_linea,
      fecha_emision: l.fecha_emision,
      numero_documento: l.numero_documento,
      cuenta_contable: l.cuenta_contable,
      datos_extra: {},
      fecha_creacion: null,
    }));

  const productInfo = history[0];

  return serializeData({ productInfo, history });
}

export async function getProviderAnalytics(
  fiscalId: string,
  empresaIds?: number[]
): Promise<ProviderAnalyticsData | null> {
  const fiscalIdHash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');
  const provider = await getProviderByFiscalId(fiscalId);
  if (!provider) {
    return null;
  }

  // ✅ Construir filtro de empresa
  let whereEmpresa = '';
  let params: any[] = [fiscalIdHash, fiscalId];

  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    whereEmpresa = `AND d.id_de_empresa IN(${placeholders})`;
    params.push(...empresaIds);
  }

  // ✅ Filtro de tipo de documento (FACTURAS Y ABONOS)
  const whereDocType = `AND(
  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )
    AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)`;

  // ✅ CAMBIO CRÍTICO: Usar DISTINCT para evitar duplicados
  const [docs] = await db.query<DocumentPacket[]>(`
        SELECT DISTINCT d.*
  FROM documentos d
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
  AND(ed.rol = 'proveedor' OR ed.rol = 'emisor')
          ${whereDocType}
          ${whereEmpresa}
`, params);

  console.log(`📊[getProviderAnalytics] Documentos encontrados para ${fiscalId}: `, docs.length);
  console.log(`🏢[getProviderAnalytics] Empresas filtradas: `, empresaIds);

  // ✅ FIX: Aplicar el mismo filtro de empresaIds a la query de líneas
  let lineQuery = `
    SELECT ld.importe_linea
    FROM lineas_documento ld
    JOIN documentos d ON ld.documento_id = d.id
    JOIN entidades_documento ed ON d.id = ed.documento_id
    WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
  AND(ed.rol = 'proveedor' OR ed.rol = 'emisor')
      AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
AND(
  (ld.codigo IS NOT NULL AND ld.codigo != '')
OR
  (ld.descripcion IS NOT NULL AND ld.descripcion != '')
      )
`;
  let lineParams: any[] = [fiscalIdHash, fiscalId];

  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    lineQuery += ` AND d.id_de_empresa IN(${placeholders})`;
    lineParams.push(...empresaIds);
  }

  const [lineRows] = await db.query<LineaPacket[]>(lineQuery, lineParams);

  let totalProductsSpent = lineRows.reduce((acc, l) => acc + Number(l.importe_linea || 0), 0);

  const totalSpent = docs.reduce((acc, doc) => acc + Number(doc.importe_total || 0), 0);
  const totalDocuments = docs.length;
  const averagePurchaseValue = totalDocuments > 0 ? totalSpent / totalDocuments : 0;

  // ✅ Top Products (filtro de Facturas/Abonos para consistencia financiera)
  const docIds = docs.map(d => d.id);
  const [lines] = docIds.length > 0 ? await db.query<LineaPacket[]>(`SELECT * FROM lineas_documento WHERE documento_id IN(?)`, [docIds]) : [[]];

  const productSpend: { [key: string]: { codigo: string; descripcion: string; total: number } } = {};
  lines.forEach(line => {
    const amt = Number(line.importe_linea || 0);
    // Identificador único (Código o descripción normalizada)
    const key = (line.codigo && line.codigo !== '') ? line.codigo : normalizeProductDescription(line.descripcion || '');

    if (key) {
      if (!productSpend[key]) {
        productSpend[key] = {
          codigo: line.codigo || '',
          descripcion: line.descripcion || '',
          total: 0
        };
      }
      productSpend[key].total += amt;
    }
  });

  const topProductsBySpend = Object.values(productSpend)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const monthlySpendMap: { [key: string]: number } = {};
  docs.forEach(doc => {
    if (doc.fecha_emision) {
      const month = new Date(doc.fecha_emision).toISOString().substring(0, 7);
      monthlySpendMap[month] = (monthlySpendMap[month] || 0) + Number(doc.importe_total || 0);
    }
  });

  let monthlySpend: { month: string, total: number }[] = [];
  const monthKeys = Object.keys(monthlySpendMap).sort();

  if (monthKeys.length > 0) {
    const minMonthStr = monthKeys[0];
    const now = new Date();
    const currentMonthStr = now.toISOString().substring(0, 7);
    const maxMonthStr = monthKeys[monthKeys.length - 1] > currentMonthStr
      ? monthKeys[monthKeys.length - 1]
      : currentMonthStr;

    let currentDate = new Date(`${minMonthStr}-01T12:00:00Z`);
    const endDate = new Date(`${maxMonthStr}-01T12:00:00Z`);

    while (currentDate <= endDate) {
      const mStr = currentDate.toISOString().substring(0, 7);
      monthlySpend.push({
        month: mStr,
        total: monthlySpendMap[mStr] || 0
      });
      currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
    }
  }

  console.log(`💰[getProviderAnalytics] Total gastado: ${totalSpent.toFixed(2)} EUR`);
  console.log(`💰[getProviderAnalytics] Total productos: ${totalProductsSpent.toFixed(2)} EUR`);
  console.log(`📈[getProviderAnalytics] Meses con compras: ${monthlySpend.length} `);

  const analyticsData = {
    provider,
    totalSpent,
    totalProductsSpent,
    totalDocuments,
    uniqueProducts: Object.keys(productSpend).length,
    averagePurchaseValue,
    topProductsBySpend,
    monthlySpend
  };

  return serializeData(analyticsData);
}

export async function getIncidentsAnalytics(empresaIds?: number[]): Promise<IncidentsAnalyticsData> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      console.warn('⚠️ [getIncidentsAnalytics] No hay usuario autenticado');
      return {
        totalOpen: 0,
        totalValidated: 0,
        byProvider: [],
        byType: []
      };
    }

    // ✅ AGREGADO: Si no hay empresas seleccionadas, retornar vacío
    if (!empresaIds || empresaIds.length === 0) {
      console.log('ℹ️ [getIncidentsAnalytics] No hay empresas seleccionadas');
      return {
        totalOpen: 0,
        totalValidated: 0,
        byProvider: [],
        byType: []
      };
    }

    // ✅ Filtro de tipo de documento - solo excluir "sin confirmar"
    const whereDocType = `AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%'`;

    // ✅ Filtro de empresas (ahora siempre presente)
    const whereEmpresa = 'AND JSON_CONTAINS(e2.id_de_usuario, CAST(? AS JSON)) AND d.id_de_empresa IN (?)';
    const params: any[] = [user.id, empresaIds];

    const [summary] = await db.query<RowDataPacket[]>(`
SELECT
SUM(CASE WHEN i.validado = 0 THEN 1 ELSE 0 END) as totalOpen,
  SUM(CASE WHEN i.validado = 1 THEN 1 ELSE 0 END) as totalValidated
            FROM incidencias_documento i
            JOIN documentos d ON i.documento_id = d.id
            JOIN empresas e2 ON d.id_de_empresa = e2.id
            WHERE 1 = 1 ${whereDocType} ${whereEmpresa}
`, params);

    const [byProviderRaw] = await db.query<RowDataPacket[]>(`
            SELECT COALESCE(e.nombre_hash, e.nombre) as group_key,
                   MAX(e.id) as entidad_id_sample,
                   COUNT(i.id) as count
            FROM incidencias_documento i
            JOIN documentos d ON i.documento_id = d.id
            JOIN entidades_documento e ON i.documento_id = e.documento_id
            JOIN empresas e2 ON d.id_de_empresa = e2.id
            WHERE i.validado = 0
AND(e.rol = 'proveedor' OR e.rol = 'emisor')
              ${whereDocType}
              ${whereEmpresa}
            GROUP BY group_key
            ORDER BY count DESC
            LIMIT 5
  `, params);

    // ✅ Hidratar nombres desencriptados vía Prisma
    const sampleIds = byProviderRaw.map(r => BigInt(r.entidad_id_sample)).filter(Boolean);
    const hydrated = sampleIds.length > 0
      ? await prisma.entidades_documento.findMany({ where: { id: { in: sampleIds } }, select: { id: true, nombre: true } })
      : [];
    const hydratedMap = new Map(hydrated.map(e => [Number(e.id), e.nombre]));

    const byProvider = byProviderRaw.map(r => ({
      name: hydratedMap.get(Number(r.entidad_id_sample)) || r.group_key || 'Desconocido',
      count: r.count
    }));


    // Traer todas las descripciones y clasificar en JS con regex (más robusto que SQL LIKE)
    const [rawDescriptions] = await db.query<RowDataPacket[]>(`
      SELECT i.documento_id, i.descripcion
      FROM incidencias_documento i
      JOIN documentos d ON i.documento_id = d.id
      JOIN empresas e2 ON d.id_de_empresa = e2.id
      WHERE i.validado = 0
        ${whereDocType}
        ${whereEmpresa}
    `, params);

    // Normalizador de tipo de incidencia: reglas por prioridad con regex
    function classifyIncident(desc: string): string {
      const d = (desc || '').toLowerCase();
      if (/duplic/.test(d)) return 'Duplicado';
      if (/c[áa]lculo|math_balance|totales no cuadran|suma de (las l[íi]neas|los importes)|importe.*no coincide|inconsistencia.*l[íi]nea/.test(d)) return 'Error de Cálculo';
      if (/cif (no coincide|del cliente no coincide|de empresa emisora.*no coincide)|no coincide.*cif/.test(d)) return 'CIF No Coincide';
      if (/cif.*(ausente|no encontrado|faltante)|sin cif|c[óo]digo fiscal.*(ausente|no encontrado)/.test(d)) return 'CIF Ausente';
      if (/fecha.*posterior|fecha.*vencimiento.*anterior|fecha.*emisi[óo]n.*incorrecta/.test(d)) return 'Error de Fecha';
      if (/rectificativa.*abono|abono.*positivo|importes.*positivo.*abono/.test(d)) return 'Revisión de Abono';
      if (/no es una factura|no es un albar[áa]n|no.*documento comercial/.test(d)) return 'Doc. No Válido';
      if (/incompleto|ausente|faltante|no encontrado|no disponible/.test(d)) return 'Datos Faltantes';
      return 'Otro';
    }

    // Agrupar y contar por tipo, y también mapear docIds por tipo
    const typeCountMap = new Map<string, number>();
    const docIdsByType = new Map<string, Set<number>>();
    for (const row of rawDescriptions) {
      const type = classifyIncident(row.descripcion);
      typeCountMap.set(type, (typeCountMap.get(type) || 0) + 1);
      if (!docIdsByType.has(type)) docIdsByType.set(type, new Set());
      docIdsByType.get(type)!.add(Number(row.documento_id));
    }
    const byTypeNormalized = Array.from(typeCountMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const analyticsData = {
      totalOpen: Number(summary[0]?.totalOpen || 0),
      totalValidated: Number(summary[0]?.totalValidated || 0),
      byProvider: byProvider.map(p => ({ name: p.name, count: p.count })),
      byType: byTypeNormalized,
      docIdsByType: Object.fromEntries(
        Array.from(docIdsByType.entries()).map(([k, v]) => [k, Array.from(v)])
      ) as Record<string, number[]>,
    };

    console.log('📊 [getIncidentsAnalytics] Resultado:', analyticsData);

    return serializeData(analyticsData);
  } catch (error) {
    console.error("❌ [getIncidentsAnalytics] Error:", error);
    return {
      totalOpen: 0,
      totalValidated: 0,
      byProvider: [],
      byType: []
    };
  }
}

// En src/services/document-service.ts - línea ~1950

async function analyzeDocuments(docIds: number[]): Promise<IncidentAnalysisResult> {
  const connection = await db.getConnection();
  await connection.beginTransaction();

  let newIncidentsFound = 0;
  let duplicates = 0;
  let calculationErrors = 0;

  try {
    if (docIds.length === 0) {
      return {
        newIncidentsFound: 0,
        duplicates: 0,
        calculationErrors: 0,
        message: 'No se proporcionaron documentos para el análisis.'
      };
    }

    // ⬅️ CAMBIO: Ahora también obtenemos id_de_empresa
    const [docsWithDetails] = await connection.query<RowDataPacket[]>(`
SELECT
d.id,
  d.id_de_empresa,
  d.numero_documento,
  d.tipo_documento,
  d.fecha_emision,
  d.importe_total,
  d.importe_sin_impuestos,
  (SELECT COALESCE(identificador_fiscal_hash, identificador_fiscal) FROM entidades_documento WHERE documento_id = d.id AND(rol = 'proveedor' OR rol = 'emisor') LIMIT 1) as provider_cif,
    (SELECT COUNT(*) FROM lineas_documento WHERE documento_id = d.id) as line_count,
      (SELECT SUM(importe_linea) FROM lineas_documento WHERE documento_id = d.id) as sum_line_items,
        (SELECT SUM(cuota) FROM impuestos_documento WHERE documento_id = d.id) as sum_cuota_iva
            FROM documentos d
            WHERE d.id IN(?)
        `, [docIds]);

    // Check for incomplete documents
    for (const doc of docsWithDetails) {
      if (!doc.numero_documento || doc.line_count === 0 || doc.importe_total == 0) {
        const description = `Datos incompletos o faltantes en el documento.`;
        const [existing] = await connection.query<RowDataPacket[]>(
          'SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?',
          [doc.id, 'Datos incompletos%']
        );
        if (existing.length === 0) {
          await prisma.incidencias_documento.create({
            data: { documento_id: BigInt(doc.id), id_de_empresa: doc.id_de_empresa ? BigInt(doc.id_de_empresa) : null, descripcion: description } as any
          });
          newIncidentsFound++;
          fireWebhook(doc.id_de_empresa, 'documento.requiere_atencion', {
            id: doc.id,
            tipo_documento: doc.tipo_documento,
            numero_documento: doc.numero_documento,
            importe_total: doc.importe_total,
            fecha_emision: doc.fecha_emision,
            motivo_incidencia: description
          }).catch(console.error);
        }
      }
    }
    const validDocsForAnalysis = docsWithDetails.filter(d => d.numero_documento && d.provider_cif && d.importe_total);

    // ✅ CAMBIO CRÍTICO: Incluir empresa en la clave de duplicados
    // Check for duplicates (solo DENTRO de cada empresa)
    const docMap = new Map<string, Array<any>>();
    for (const doc of validDocsForAnalysis) {
      // ✅ ANTES: const key = `${ doc.provider_cif }| ${ doc.numero_documento }| ${ doc.importe_total } `;
      // ✅ AHORA: Incluir empresa en la clave
      const key = `${doc.id_de_empresa}| ${doc.provider_cif}| ${doc.numero_documento}| ${doc.importe_total} `;

      if (!docMap.has(key)) {
        docMap.set(key, []);
      }
      docMap.get(key)!.push(doc); // Push full doc for webhook
    }

    for (const [key, docs] of docMap.entries()) {
      if (docs.length > 1) {
        duplicates += docs.length;
        const ids = docs.map(d => d.id);
        const description = `Documento duplicado detectado.Clave: ${key.split('|').slice(1, 3).join(' - ')}.IDs: ${ids.join(', ')} `;

        for (const doc of docs) {
          const [existing] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?',
            [doc.id, 'Documento duplicado%']
          );
          if (existing.length === 0) {
            await prisma.incidencias_documento.create({
              data: { documento_id: BigInt(doc.id), id_de_empresa: doc.id_de_empresa ? BigInt(doc.id_de_empresa) : null, descripcion: description } as any
            });
            newIncidentsFound++;
            fireWebhook(doc.id_de_empresa, 'documento.requiere_atencion', {
              id: doc.id,
              tipo_documento: doc.tipo_documento,
              numero_documento: doc.numero_documento,
              importe_total: doc.importe_total,
              fecha_emision: doc.fecha_emision,
              motivo_incidencia: description
            }).catch(console.error);



          }
        }
      }
    }

    // Check for calculation errors
    for (const doc of validDocsForAnalysis) {
      // Check 1: Sum of line items vs Base Amount
      if (doc.sum_line_items !== null) {
        if (Math.abs(Number(doc.sum_line_items) - Number(doc.importe_sin_impuestos)) > 0.02) {
          calculationErrors++;
          const description = `Error de cálculo en el subtotal.La suma de las líneas(${Number(doc.sum_line_items).toFixed(2)}) no coincide con la base imponible del documento(${Number(doc.importe_sin_impuestos).toFixed(2)}).`;
          const [existing] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?',
            [doc.id, 'Error de cálculo en el subtotal%']
          );
          if (existing.length === 0) {
            await prisma.incidencias_documento.create({
              data: { documento_id: BigInt(doc.id), id_de_empresa: doc.id_de_empresa ? BigInt(doc.id_de_empresa) : null, descripcion: description } as any
            });
            newIncidentsFound++;
            fireWebhook(doc.id_de_empresa, 'documento.requiere_atencion', {
              id: doc.id,
              tipo_documento: doc.tipo_documento,
              numero_documento: doc.numero_documento,
              importe_total: doc.importe_total,
              fecha_emision: doc.fecha_emision,
              motivo_incidencia: description

            }).catch(console.error);
          }
        }
      }

      // Check 2: Base Amount + Taxes vs Total Amount
      if (doc.sum_cuota_iva !== null) {
        const calculatedTotal = (Number(doc.importe_sin_impuestos) || 0) + (Number(doc.sum_cuota_iva) || 0);
        if (Math.abs(calculatedTotal - (Number(doc.importe_total) || 0)) > 0.02) {
          calculationErrors++;
          const description = `Error de cálculo en el total.Base: ${doc.importe_sin_impuestos}, Impuestos: ${doc.sum_cuota_iva}, Total Doc: ${doc.importe_total}, Total Calc: ${calculatedTotal.toFixed(2)}.`;
          const [existing] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?',
            [doc.id, 'Error de cálculo en el total%']
          );
          if (existing.length === 0) {
            await prisma.incidencias_documento.create({
              data: { documento_id: BigInt(doc.id), id_de_empresa: doc.id_de_empresa ? BigInt(doc.id_de_empresa) : null, descripcion: description } as any
            });
            newIncidentsFound++;
            fireWebhook(doc.id_de_empresa, 'documento.requiere_atencion', {
              id: doc.id,
              tipo_documento: doc.tipo_documento,
              numero_documento: doc.numero_documento,
              importe_total: doc.importe_total,
              fecha_emision: doc.fecha_emision,
              motivo_incidencia: description

            }).catch(console.error);
          }
        }
      }
    }

    await connection.commit();

    console.log('✅ [analyzeDocuments] Análisis completo:', {
      newIncidentsFound,
      duplicates,
      calculationErrors
    });

    return {
      newIncidentsFound,
      duplicates,
      calculationErrors,
      message: `Análisis completo.Se encontraron ${newIncidentsFound} nuevas incidencias.`
    };

  } catch (error) {
    await connection.rollback();
    console.error("❌ [analyzeDocuments] Error:", error);
    throw new Error('Falló el análisis de documentos en el servidor.');
  } finally {
    connection.release();
  }
}
// En src/services/document-service.ts

export async function markDocumentAsRead(documentId: number) {
  try {
    console.log('🔄 [MARK-READ] Marcando documento como leído:', documentId);

    const updated = await prisma.documentos.update({
      where: { id: BigInt(documentId) },
      data: { is_new: 0 }
    });

    console.log('✅ [MARK-READ] Documento marcado como leído:', updated.id);

    return {
      success: true,
      updated: true
    };
  } catch (error) {
    console.error('❌ [MARK-READ] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error desconocido'
    };
  }
}
// ✅ MODIFICAR esta función (línea ~2100)
export async function runDocumentAnalysis(empresaIds?: number[]): Promise<IncidentAnalysisResult> {
  let query = 'SELECT d.id FROM documentos d';
  const params: any[] = [];

  // ✅ NUEVO: Filtro de tipo de documento (facturas Y abonos)
  const conditions: string[] = [`(
          (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%nota%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%nota%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )`];

  // ✅ NUEVO: Filtrar por empresas si se especifican
  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    conditions.push(`d.id_de_empresa IN(${placeholders})`);
    params.push(...empresaIds);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')} `;
  }

  console.log('🔍 [runDocumentAnalysis] Query:', query);
  console.log('🔍 [runDocumentAnalysis] Params:', params);

  const [allDocIds] = await db.query<RowDataPacket[]>(query, params);
  const docIds = allDocIds.map(row => row.id);

  console.log(`📊[runDocumentAnalysis] Analizando ${docIds.length} documentos`);

  return analyzeDocuments(docIds);
}

export async function runSingleDocumentAnalysis(documentId: number): Promise<IncidentAnalysisResult> {
  return analyzeDocuments([documentId]);
}
export async function getDashboardAnalytics(
  empresaIds?: number[],
  año?: number,
  trimestre?: number
): Promise<DashboardAnalytics> {
  console.log('🔥 [getDashboardAnalytics] Parámetros recibidos:', { empresaIds, año, trimestre });

  let MY_COMPANY_FISCAL_IDS: string[] = [];
  let MY_COMPANY_NAMES: string[] = [];

  if (empresaIds && empresaIds.length > 0) {
    const empresasInfo = await prisma.empresas.findMany({
      where: { id: { in: empresaIds } },
      select: { CIF: true, nombre_de_empresa: true, nombre_fiscal: true }
    });
    MY_COMPANY_FISCAL_IDS = empresasInfo.map(e => e.CIF).filter(Boolean) as string[];
    MY_COMPANY_NAMES = empresasInfo.flatMap(e => [e.nombre_de_empresa, e.nombre_fiscal]).filter(Boolean) as string[];
  }

  console.log('🏢 [getDashboardAnalytics] CIFs de empresas:', MY_COMPANY_FISCAL_IDS);

  const MY_COMPANY_NAME_HASHES = MY_COMPANY_NAMES.map(n => require('crypto').createHash('sha256').update(normalizeEntityName(n)).digest('hex'));

  const hasEmpresaFilter = empresaIds && empresaIds.length > 0;
  const hasTrimestreFilter = año !== undefined && trimestre !== undefined;

  console.log('🎯 [getDashboardAnalytics] Filtros:', { hasEmpresaFilter, hasTrimestreFilter: año !== undefined && trimestre !== undefined, añoOnly: año !== undefined });

  const whereDocType = `AND(
  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )
    AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)`;

  // ✅ CONSTRUCCIÓN DINÁMICA DE FILTRO TEMPORAL
  let wherePeriodFilter = '';
  const periodQueryParams: any[] = [];

  if (año !== undefined) {
    if (trimestre !== undefined) {
      // Filtro Año + Trimestre
      wherePeriodFilter = `AND d.\`año_trimestre\` = ? AND d.\`num_trimestre\` = ?`;
      periodQueryParams.push(año, trimestre);
    } else {
      // Filtro solo Año
      wherePeriodFilter = `AND YEAR(d.fecha_emision) = ?`;
      periodQueryParams.push(año);
    }
  }

  // ✅ AUTO-DETECT LATEST YEAR if not provided
  let yearToUse = año;

  if (año === undefined) {
    const [yearRow] = await db.query<RowDataPacket[]>(
      `SELECT MAX(YEAR(fecha_emision)) as maxYear FROM documentos ${hasEmpresaFilter ? 'WHERE id_de_empresa IN (?)' : ''
      }`,
      hasEmpresaFilter ? [empresaIds] : []
    );
    yearToUse = yearRow[0]?.maxYear || new Date().getFullYear();
    console.log('📅 [getDashboardAnalytics] Auto-detected year:', yearToUse);
  }

  const MY_COMPANY_FISCAL_COMBINED = MY_COMPANY_FISCAL_IDS.length > 0
    ? [...MY_COMPANY_FISCAL_IDS.map(cif => require('crypto').createHash('sha256').update(cif.toLowerCase().trim()).digest('hex')), ...MY_COMPANY_FISCAL_IDS]
    : [];

  const cifPlaceholders = MY_COMPANY_FISCAL_COMBINED.length > 0
    ? MY_COMPANY_FISCAL_COMBINED.map(() => '?').join(',')
    : "'NEVER_MATCH'";

  const MY_COMPANY_NAME_COMBINED = MY_COMPANY_NAMES.length > 0
    ? [...MY_COMPANY_NAME_HASHES, ...MY_COMPANY_NAMES]
    : [];

  const namePlaceholders = MY_COMPANY_NAME_COMBINED.length > 0
    ? MY_COMPANY_NAME_COMBINED.map(() => '?').join(',')
    : "'NEVER_MATCH'";

  // ✅ CAMBIO CRÍTICO: Usar importe_total (CON IVA) en lugar de importe_sin_impuestos
  const [kpiRows] = await db.query<RowDataPacket[]>(`
        WITH DocTypes AS (
            SELECT 
                d.id,
                d.tipo_documento,
                d.importe_total,
                d.importe_sin_impuestos,
                COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.base_no_sujeta')) AS DECIMAL(10,2)), 0) as base_no_sujeta,
                -- ✅ IVA (Con Fallback si no hay desgloses: Total - Base)
                COALESCE((
                  SELECT CASE 
                    WHEN SUM(di.cuota) > 0 THEN SUM(di.cuota)
                    ELSE ABS(d.importe_total - d.importe_sin_impuestos) 
                  END
                  FROM impuestos_documento di 
                  WHERE di.documento_id = d.id 
                    AND LOWER(di.tipo_impuesto) NOT LIKE '%retencion%' 
                    AND LOWER(di.tipo_impuesto) NOT LIKE '%reten%'
                    AND LOWER(di.tipo_impuesto) NOT LIKE '%irpf%'
                    AND LOWER(di.tipo_impuesto) NOT LIKE '%recargo%'
                    AND LOWER(di.tipo_impuesto) NOT LIKE '%equivalencia%'
                ), (ABS(d.importe_total - d.importe_sin_impuestos) - 
                    COALESCE((SELECT SUM(di3.cuota) FROM impuestos_documento di3 WHERE di3.documento_id = d.id AND (di3.tipo_impuesto LIKE '%recargo%' OR di3.tipo_impuesto LIKE '%equivalencia%')), 0) +
                    COALESCE((SELECT SUM(di4.cuota) FROM impuestos_documento di4 WHERE di4.documento_id = d.id AND (di4.tipo_impuesto LIKE '%retencion%' OR di4.tipo_impuesto LIKE '%irpf%')), 0)
                )) as total_iva,
                -- ✅ RECARGO SEPARADO
                COALESCE((SELECT SUM(di.cuota) 
                  FROM impuestos_documento di 
                  WHERE di.documento_id = d.id 
                    AND (di.tipo_impuesto LIKE '%recargo%' OR di.tipo_impuesto LIKE '%equivalencia%')), 0) as recargo_cuota,
                -- ✅ RETENCION SEPARADA
                COALESCE((SELECT SUM(di.cuota) FROM impuestos_documento di WHERE di.documento_id = d.id AND (di.tipo_impuesto LIKE '%reten%' OR di.tipo_impuesto LIKE '%irpf%')), 0) as retencion_cuota,
                
                -- ✅ DETECCIÓN DE ABONO (Igual a Trimestres)
                CASE 
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR d.importe_total < 0 
                    THEN 1 
                    ELSE 0 
                END as is_abono,
                
                -- ✅ CLASIFICACIÓN ROBUSTA (Igual a Trimestres)
                (SELECT COALESCE(MAX(CASE 
                    WHEN ed2.rol IN('emisor', 'proveedor') 
                      AND COALESCE(ed2.identificador_fiscal_hash, ed2.identificador_fiscal) IN(${cifPlaceholders}) 
                    THEN 1 
                    ELSE 0 
                END), 0) FROM entidades_documento ed2 WHERE ed2.documento_id = d.id) as is_issued,

                -- ✅ BASES POR TASA PARA CÁLCULO TEÓRICO RIGUROSO
                COALESCE((SELECT SUM(di.base_imponible) FROM impuestos_documento di WHERE di.documento_id = d.id AND ABS(di.porcentaje - 21) < 1), 0) as b21,
                COALESCE((SELECT SUM(di.base_imponible) FROM impuestos_documento di WHERE di.documento_id = d.id AND ABS(di.porcentaje - 10) < 1), 0) as b10,
                COALESCE((SELECT SUM(di.base_imponible) FROM impuestos_documento di WHERE di.documento_id = d.id AND ABS(di.porcentaje - 4) < 1), 0) as b4,
                COALESCE((SELECT SUM(di.base_imponible) FROM impuestos_documento di WHERE di.documento_id = d.id AND ABS(di.porcentaje - 15) < 1), 0) as b15,

                -- ✅ DETECCIÓN DE DESCUADRE (Diferencia > 0.05€) — incluye base_no_sujeta, descuento_global y corrige retenciones en abonos
                (CASE WHEN ABS(d.importe_total - (
                    d.importe_sin_impuestos +
                    COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.base_no_sujeta')) AS DECIMAL(10,2)), 0) -
                    COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.descuento_global')) AS DECIMAL(10,2)), 0) +
                    COALESCE((SELECT SUM(
                        CASE 
                            WHEN di2.tipo_impuesto LIKE '%RET%' AND (d.tipo_documento LIKE '%ABONO%' OR d.tipo_documento LIKE '%RECTIFICATIVA%') THEN -di2.cuota
                            ELSE di2.cuota
                        END
                    ) FROM impuestos_documento di2 WHERE di2.documento_id = d.id), 0)
                )) > 0.05 THEN 1 ELSE 0 END) as doc_mismatch
            FROM documentos d
            WHERE 1=1 ${whereDocType}
            ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
            ${wherePeriodFilter}
        )
        SELECT
          -- ✅ TOTALES CON IVA (Ajuste de signo inteligente)
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 THEN (CASE WHEN is_abono = 1 AND importe_total > 0 THEN -importe_total ELSE importe_total END) 
            ELSE 0 
          END), 0) as totalIngresos,
          
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 THEN (CASE WHEN is_abono = 1 AND importe_total > 0 THEN -importe_total ELSE importe_total END) 
            ELSE 0 
          END), 0) as totalGastos,
          
          -- ✅ TOTALES SIN IVA (Incluyendo base_no_sujeta)
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 THEN (CASE WHEN is_abono = 1 AND (importe_sin_impuestos + base_no_sujeta) > 0 THEN -(importe_sin_impuestos + base_no_sujeta) ELSE (importe_sin_impuestos + base_no_sujeta) END) 
            ELSE 0 
          END), 0) as totalIngresosSinIva,
          
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 THEN (CASE WHEN is_abono = 1 AND (importe_sin_impuestos + base_no_sujeta) > 0 THEN -(importe_sin_impuestos + base_no_sujeta) ELSE (importe_sin_impuestos + base_no_sujeta) END) 
            ELSE 0 
          END), 0) as totalGastosSinIva,
          
          -- ✅ IMPUESTOS DESGLOSADOS (Incluyendo Recargo para paridad con Trimestres)
          COALESCE(SUM(CASE WHEN is_issued = 1 THEN (CASE WHEN is_abono = 1 AND total_iva > 0 THEN -(total_iva) ELSE (total_iva) END) ELSE 0 END), 0) as ivaRepercutido,
          COALESCE(SUM(CASE WHEN is_issued = 0 THEN (CASE WHEN is_abono = 1 AND total_iva > 0 THEN -(total_iva) ELSE (total_iva) END) ELSE 0 END), 0) as ivaSoportado,
          
          -- ✅ RETENCIONES: Siempre positivo para el KPI, el signo lo manejamos en la fórmula
          COALESCE(SUM(CASE WHEN is_issued = 1 THEN (CASE WHEN is_abono = 1 THEN -ABS(retencion_cuota) ELSE ABS(retencion_cuota) END) ELSE 0 END), 0) as retencionRepercutido,
          COALESCE(SUM(CASE WHEN is_issued = 0 THEN (CASE WHEN is_abono = 1 THEN -ABS(retencion_cuota) ELSE ABS(retencion_cuota) END) ELSE 0 END), 0) as retencionSoportado,
          
          -- ✅ RECARGOS
          COALESCE(SUM(CASE WHEN is_issued = 1 THEN (CASE WHEN is_abono = 1 THEN -ABS(recargo_cuota) ELSE ABS(recargo_cuota) END) ELSE 0 END), 0) as recargoRepercutido,
          COALESCE(SUM(CASE WHEN is_issued = 0 THEN (CASE WHEN is_abono = 1 THEN -ABS(recargo_cuota) ELSE ABS(recargo_cuota) END) ELSE 0 END), 0) as recargoSoportado,
          
          COUNT(DISTINCT CASE WHEN is_issued = 1 THEN id END) as totalFacturasIngreso,
          COUNT(DISTINCT CASE WHEN is_issued = 0 THEN id END) as totalFacturasGasto,
          
          (SELECT COUNT(*) FROM incidencias_documento i 
           JOIN documentos d2 ON i.documento_id = d2.id 
           WHERE i.validado = 0 
             AND (
                 (LOWER(d2.tipo_documento) LIKE '%factura%' AND LOWER(d2.tipo_documento) NOT LIKE '%(sin confirmar)%')
                 OR (LOWER(d2.tipo_documento) LIKE '%abono%' AND LOWER(d2.tipo_documento) NOT LIKE '%(sin confirmar)%')
                OR (LOWER(d2.tipo_documento) LIKE '%crédito%' AND LOWER(d2.tipo_documento) NOT LIKE '%(sin confirmar)%')
             )
           ${hasEmpresaFilter ? 'AND d2.id_de_empresa IN (?)' : ''}
           ${wherePeriodFilter.replace(/d\./g, 'd2.')}) as incidenciasAbiertas,
          
          (SELECT COUNT(DISTINCT COALESCE(identificador_fiscal_hash, identificador_fiscal)) 
           FROM entidades_documento ed 
           JOIN documentos d3 ON ed.documento_id = d3.id 
           WHERE ed.rol IN ('proveedor', 'emisor') 
             AND COALESCE(ed.identificador_fiscal_hash, ed.identificador_fiscal) NOT IN (${cifPlaceholders}) 
             AND (
                 (LOWER(d3.tipo_documento) LIKE '%factura%' AND LOWER(d3.tipo_documento) NOT LIKE '%(sin confirmar)%')
                 OR (LOWER(d3.tipo_documento) LIKE '%abono%' AND LOWER(d3.tipo_documento) NOT LIKE '%(sin confirmar)%')
             )
           ${hasEmpresaFilter ? 'AND d3.id_de_empresa IN (?)' : ''}
           ${wherePeriodFilter.replace(/d\./g, 'd3.')}) as totalProveedores,
          
          (SELECT COUNT(DISTINCT ld.codigo) 
           FROM lineas_documento ld 
           JOIN documentos d4 ON ld.documento_id = d4.id 
           WHERE ld.codigo IS NOT NULL 
             AND ld.codigo != '' 
             AND (
                 (LOWER(d4.tipo_documento) LIKE '%factura%' AND LOWER(d4.tipo_documento) NOT LIKE '%(sin confirmar)%')
                 OR (LOWER(d4.tipo_documento) LIKE '%abono%' AND LOWER(d4.tipo_documento) NOT LIKE '%(sin confirmar)%')
             )
           ${hasEmpresaFilter ? 'AND d4.id_de_empresa IN (?)' : ''}
           ${wherePeriodFilter.replace(/d\./g, 'd4.')}) as totalProductos,
          
          -- ✅ SUMA DE BASES PARA CÁLCULO TEÓRICO AGREGADO
          COALESCE(SUM(CASE WHEN is_issued = 1 THEN (CASE WHEN is_abono = 1 AND b21 > 0 THEN -b21 ELSE b21 END) ELSE 0 END), 0) as ing_b21,
          COALESCE(SUM(CASE WHEN is_issued = 1 THEN (CASE WHEN is_abono = 1 AND b10 > 0 THEN -b10 ELSE b10 END) ELSE 0 END), 0) as ing_b10,
          COALESCE(SUM(CASE WHEN is_issued = 1 THEN (CASE WHEN is_abono = 1 AND b4 > 0 THEN -b4 ELSE b4 END) ELSE 0 END), 0) as ing_b4,
          COALESCE(SUM(CASE WHEN is_issued = 1 THEN (CASE WHEN is_abono = 1 AND b15 > 0 THEN -b15 ELSE b15 END) ELSE 0 END), 0) as ing_b15,
          
          COALESCE(SUM(CASE WHEN is_issued = 0 THEN (CASE WHEN is_abono = 1 AND b21 > 0 THEN -b21 ELSE b21 END) ELSE 0 END), 0) as gas_b21,
          COALESCE(SUM(CASE WHEN is_issued = 0 THEN (CASE WHEN is_abono = 1 AND b10 > 0 THEN -b10 ELSE b10 END) ELSE 0 END), 0) as gas_b10,
          COALESCE(SUM(CASE WHEN is_issued = 0 THEN (CASE WHEN is_abono = 1 AND b4 > 0 THEN -b4 ELSE b4 END) ELSE 0 END), 0) as gas_b4,
          COALESCE(SUM(CASE WHEN is_issued = 0 THEN (CASE WHEN is_abono = 1 AND b15 > 0 THEN -b15 ELSE b15 END) ELSE 0 END), 0) as gas_b15,
          
          MAX(doc_mismatch) as hasMismatches,
          COUNT(DISTINCT id) as totalDocs
        FROM DocTypes
    `, [
    ...MY_COMPANY_FISCAL_COMBINED,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams,
    ...MY_COMPANY_FISCAL_COMBINED,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams
  ]);

  const kpis = kpiRows[0];
  console.log('📊 [getDashboardAnalytics] KPIs calculados:', {
    ingresos: kpis.totalIngresos,
    gastos: kpis.totalGastos,
    retencionRep: kpis.retencionRepercutido,
    retencionSop: kpis.retencionSoportado,
    ivaRep: kpis.ivaRepercutido,
    ivaSop: kpis.ivaSoportado
  });
  const incidentRate = kpis.totalDocs > 0 ? (kpis.incidenciasAbiertas / kpis.totalDocs) * 100 : 0;

  // ✅ REDONDEO TEÓRICO AGREGADO (Sincronizado con Excel y Trimestres)
  const ivaRep21 = Math.round(Number(kpis.ing_b21) * 21) / 100;
  const ivaRep10 = Math.round(Number(kpis.ing_b10) * 10) / 100;
  const ivaRep4 = Math.round(Number(kpis.ing_b4) * 4) / 100;
  const ivaRep15 = Math.round(Number(kpis.ing_b15) * 15) / 100;
  const totalIvaRepTeorico = ivaRep21 + ivaRep10 + ivaRep4 + ivaRep15;

  const ivaSop21 = Math.round(Number(kpis.gas_b21) * 21) / 100;
  const ivaSop10 = Math.round(Number(kpis.gas_b10) * 10) / 100;
  const ivaSop4 = Math.round(Number(kpis.gas_b4) * 4) / 100;
  const ivaSop15 = Math.round(Number(kpis.gas_b15) * 15) / 100;
  const totalIvaSopTeorico = ivaSop21 + ivaSop10 + ivaSop4 + ivaSop15;

  // Recalcular Totales CON IVA (Netos de retención para paridad con Trimestres)
  const totalIngresosReal = Number(kpis.totalIngresosSinIva) + Number(kpis.ivaRepercutido) + Number(kpis.recargoRepercutido) - Number(kpis.retencionRepercutido);
  const totalGastosReal = Number(kpis.totalGastosSinIva) + Number(kpis.ivaSoportado) + Number(kpis.recargoSoportado) - Number(kpis.retencionSoportado);

  const beneficioSinIva = Number(kpis.totalIngresosSinIva) - Number(kpis.totalGastosSinIva);
  const beneficioConIva = totalIngresosReal - totalGastosReal;

  // ✅ RESULTADO IVA PURO REAL (Sin Recargos)
  const resultadoIva = Number(kpis.ivaRepercutido) - Number(kpis.ivaSoportado);

  // ✅ QUARTERLY SUMMARY con importe_total (CON IVA)
  const [quarterlyRows] = await db.query<RowDataPacket[]>(`
        WITH DocTypes AS (
            SELECT 
                d.id,
                d.fecha_emision,
                d.importe_total,
                CASE 
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR d.importe_total < 0 
                    THEN 1 
                    ELSE 0 
                END as es_abono,
                -- ✅ CLASIFICACIÓN ROBUSTA (Igual a Trimestres)
                (SELECT COALESCE(MAX(CASE 
                    WHEN ed2.rol IN('emisor', 'proveedor') 
                      AND COALESCE(ed2.identificador_fiscal_hash, ed2.identificador_fiscal) IN(${cifPlaceholders}) 
                    THEN 1 
                    ELSE 0 
                END), 0) FROM entidades_documento ed2 WHERE ed2.documento_id = d.id) as is_issued
            FROM documentos d
            WHERE 1=1
              AND (
                  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%nota%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%nota%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              )
              AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
              ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
              ${wherePeriodFilter}
            GROUP BY d.id -- ✅ Necesario para la subquery de is_issued
        )
        SELECT
          CONCAT('T', QUARTER(fecha_emision)) as quarter,
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 0 
            THEN importe_total 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 1 
            THEN ABS(importe_total) 
            ELSE 0 
          END), 0) as ingresos,
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 0 
            THEN importe_total 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 1 
            THEN ABS(importe_total) 
            ELSE 0 
          END), 0) as gastos
        FROM DocTypes
        GROUP BY quarter
    `, [
    ...MY_COMPANY_FISCAL_COMBINED,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams
  ]);

  console.log('🔍 [getDashboardAnalytics] QuarterlyRows RAW:', JSON.stringify(quarterlyRows, (k, v) => typeof v === 'bigint' ? Number(v) : v, 2));

  const quarterlySummary = {
    T1: { ingresos: 0, gastos: 0 },
    T2: { ingresos: 0, gastos: 0 },
    T3: { ingresos: 0, gastos: 0 },
    T4: { ingresos: 0, gastos: 0 }
  };

  quarterlyRows.forEach(r => {
    if (r.quarter) {
      quarterlySummary[r.quarter as keyof typeof quarterlySummary] = {
        ingresos: Number(r.ingresos),
        gastos: Number(r.gastos)
      };
    }
  });

  console.log('📊 [getDashboardAnalytics] QuarterlySummary:', JSON.stringify(quarterlySummary, (k, v) => typeof v === 'bigint' ? Number(v) : v, 2));

  // ✅ MULTI-YEAR QUARTERLY (Desglose por Año y Trimestre)
  const [multiYearRows] = await db.query<RowDataPacket[]>(`
        WITH DocTypes AS (
            SELECT 
                d.id,
                d.fecha_emision,
                d.importe_total,
                CASE 
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR d.importe_total < 0 
                    THEN 1 
                    ELSE 0 
                END as es_abono,
                CASE
                    WHEN LOWER(d.tipo_documento) REGEXP 'emitid[oa]' THEN 1
                    WHEN LOWER(d.tipo_documento) REGEXP 'recibid[oa]' THEN 0
                    WHEN LOWER(d.tipo_documento) LIKE '%albar%' THEN
                        CASE
                            WHEN EXISTS (
                                SELECT 1 FROM entidades_documento e2 
                                WHERE e2.documento_id = d.id 
                                  AND e2.rol IN ('cliente', 'receptor')
                            ) THEN 1
                            ELSE 0
                        END
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' THEN
                        CASE
                            WHEN (SELECT COALESCE(e2.identificador_fiscal_hash, e2.identificador_fiscal) 
                                  FROM entidades_documento e2 
                                  WHERE e2.documento_id = d.id 
                                    AND e2.rol IN ('emisor', 'proveedor') 
                                  LIMIT 1) IN (${cifPlaceholders})
                            THEN 1 ELSE 0
                        END
                    ELSE CASE WHEN d.importe_total < 0 THEN 1 ELSE 0 END
                END as is_issued
            FROM documentos d
            WHERE 1=1
              AND (
                  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%nota%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%nota%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              )
              AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
              ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
              -- No filters for period here, we want ALL available history
        )
        SELECT
          YEAR(fecha_emision) as year,
          CONCAT('T', QUARTER(fecha_emision)) as quarter,
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 0 THEN importe_total 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 1 THEN ABS(importe_total) 
            ELSE 0 
          END), 0) as ingresos,
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 0 THEN importe_total 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 1 THEN ABS(importe_total) 
            ELSE 0 
          END), 0) as gastos
        FROM DocTypes
        GROUP BY year, quarter
        ORDER BY year DESC, quarter ASC
    `, [
    ...MY_COMPANY_FISCAL_COMBINED,
    ...(hasEmpresaFilter ? [empresaIds] : [])
  ]);

  const multiYearQuarterlySummary: Record<string, Record<string, { ingresos: number; gastos: number }>> = {};

  multiYearRows.forEach(r => {
    if (r.year && r.quarter) {
      const y = r.year.toString();
      const q = r.quarter.toString();
      if (!multiYearQuarterlySummary[y]) multiYearQuarterlySummary[y] = {};
      multiYearQuarterlySummary[y][q] = {
        ingresos: Number(r.ingresos),
        gastos: Number(r.gastos)
      };
    }
  });

  // ✅ YEARLY SUMMARY (Resumen Anual)
  const [yearlyRows] = await db.query<RowDataPacket[]>(`
        WITH DocTypes AS (
            SELECT 
                d.id,
                d.fecha_emision,
                d.importe_total,
                CASE 
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR d.importe_total < 0 
                    THEN 1 
                    ELSE 0 
                END as es_abono,
                -- ✅ CLASIFICACIÓN ROBUSTA (Igual a Trimestres)
                (SELECT COALESCE(MAX(CASE 
                    WHEN ed2.rol IN('emisor', 'proveedor') 
                      AND COALESCE(ed2.identificador_fiscal_hash, ed2.identificador_fiscal) IN(${cifPlaceholders}) 
                    THEN 1 
                    ELSE 0 
                END), 0) FROM entidades_documento ed2 WHERE ed2.documento_id = d.id) as is_issued
            FROM documentos d
            WHERE 1=1
              AND (
                  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              )
              AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
              ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
              -- No year filter for yearly summary strictly, unless we wanted to filter by range, but usually we want all years
        )
        SELECT
          YEAR(fecha_emision) as year,
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 0 THEN importe_total 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 1 THEN ABS(importe_total) 
            ELSE 0 
          END), 0) as ingresos,
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 0 THEN importe_total 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 1 THEN ABS(importe_total) 
            ELSE 0 
          END), 0) as gastos
        FROM DocTypes
        GROUP BY year
        ORDER BY year ASC
    `, [
    ...MY_COMPANY_FISCAL_COMBINED,
    ...(hasEmpresaFilter ? [empresaIds] : [])
  ]);

  const yearlySummary: Record<string, { ingresos: number; gastos: number }> = {};
  yearlyRows.forEach(r => {
    if (r.year) {
      yearlySummary[r.year.toString()] = {
        ingresos: Number(r.ingresos),
        gastos: Number(r.gastos)
      };
    }
  });

  const [distributionRows] = await db.query<RowDataPacket[]>(`
        SELECT tipo_documento as name, COUNT(*) as value
        FROM documentos
        WHERE (
            (LOWER(tipo_documento) LIKE '%factura%' AND LOWER(tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(tipo_documento) LIKE '%abono%' AND LOWER(tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(tipo_documento) LIKE '%albar%' AND LOWER(tipo_documento) NOT LIKE '%(sin confirmar)%')
        )
        AND id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
        ${hasEmpresaFilter ? 'AND id_de_empresa IN (?)' : ''}
        ${wherePeriodFilter.replace(/d\./g, '')}
        GROUP BY tipo_documento
        ORDER BY value DESC
    `, [
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams
  ]);

  const [ivaRows] = await db.query<RowDataPacket[]>(`
        WITH DocTypes AS (
            SELECT 
                d.id,
                d.fecha_emision,
                d.importe_total,
                i.cuota as iva_cuota,
                CASE 
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR d.importe_total < 0 
                    THEN 1 
                    ELSE 0 
                END as es_abono,
                -- ✅ CLASIFICACIÓN ROBUSTA (Igual a Trimestres)
                (SELECT COALESCE(MAX(CASE 
                    WHEN ed2.rol IN('emisor', 'proveedor') 
                      AND COALESCE(ed2.identificador_fiscal_hash, ed2.identificador_fiscal) IN(${cifPlaceholders}) 
                    THEN 1 
                    ELSE 0 
                END), 0) FROM entidades_documento ed2 WHERE ed2.documento_id = d.id) as is_issued
            FROM documentos d
            JOIN impuestos_documento i ON d.id = i.documento_id
            WHERE i.tipo_impuesto NOT LIKE '%retencion%'
              AND (
                  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              )
              AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
            ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
            ${wherePeriodFilter}
        )
        SELECT
          CONCAT('T', QUARTER(fecha_emision)) as quarter,
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 0 
            THEN iva_cuota 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 1 
            THEN ABS(iva_cuota) 
            ELSE 0 
          END), 0) as repercutido,
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 0 
            THEN iva_cuota 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 1 
            THEN ABS(iva_cuota) 
            ELSE 0 
          END), 0) as soportado
        FROM DocTypes
        GROUP BY quarter
    `, [
    ...MY_COMPANY_FISCAL_COMBINED,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams
  ]);

  console.log('🔍 [getDashboardAnalytics] IvaRows RAW:', JSON.stringify(ivaRows, (k, v) => typeof v === 'bigint' ? Number(v) : v, 2));

  const ivaSummary = {
    T1: { repercutido: 0, soportado: 0 },
    T2: { repercutido: 0, soportado: 0 },
    T3: { repercutido: 0, soportado: 0 },
    T4: { repercutido: 0, soportado: 0 }
  };

  ivaRows.forEach(r => {
    if (r.quarter) {
      ivaSummary[r.quarter as keyof typeof ivaSummary] = {
        repercutido: Number(r.repercutido),
        soportado: Number(r.soportado)
      };
    }
  });

  console.log('📊 [getDashboardAnalytics] IvaSummary:', JSON.stringify(ivaSummary, (k, v) => typeof v === 'bigint' ? Number(v) : v, 2));

  // ✅ MULTI-YEAR IVA (Desglose por Año y Trimestre)
  const [multiYearIvaRows] = await db.query<RowDataPacket[]>(`
        WITH DocTypes AS (
            SELECT 
                d.id,
                d.fecha_emision,
                d.importe_total,
                i.cuota as iva_cuota,
                CASE 
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR d.importe_total < 0 
                    THEN 1 
                    ELSE 0 
                END as es_abono,
                CASE
                    WHEN LOWER(d.tipo_documento) REGEXP 'emitid[oa]' THEN 1
                    WHEN LOWER(d.tipo_documento) REGEXP 'recibid[oa]' THEN 0
                    WHEN LOWER(d.tipo_documento) LIKE '%albar%' THEN
                        CASE
                            WHEN EXISTS (
                                SELECT 1 FROM entidades_documento e2 
                                WHERE e2.documento_id = d.id 
                                  AND e2.rol IN ('cliente', 'receptor')
                            ) THEN 1
                            ELSE 0
                        END
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' THEN
                        CASE
                            WHEN (SELECT COALESCE(e2.identificador_fiscal_hash, e2.identificador_fiscal) 
                                  FROM entidades_documento e2 
                                  WHERE e2.documento_id = d.id 
                                    AND e2.rol IN ('emisor', 'proveedor') 
                                  LIMIT 1) IN (${cifPlaceholders})
                            THEN 1 ELSE 0
                        END
                    ELSE CASE WHEN d.importe_total < 0 THEN 1 ELSE 0 END
                END as is_issued
            FROM documentos d
            JOIN impuestos_documento i ON d.id = i.documento_id
            WHERE i.tipo_impuesto NOT LIKE '%retencion%'
              AND (
                  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              )
              AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
            ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
        )
        SELECT
          YEAR(fecha_emision) as year,
          CONCAT('T', QUARTER(fecha_emision)) as quarter,
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 0 THEN iva_cuota 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 1 THEN ABS(iva_cuota) 
            ELSE 0 
          END), 0) as repercutido,
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 0 THEN iva_cuota 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 1 THEN ABS(iva_cuota) 
            ELSE 0 
          END), 0) as soportado
        FROM DocTypes
        GROUP BY year, quarter
        ORDER BY year DESC, quarter ASC
    `, [
    ...MY_COMPANY_FISCAL_COMBINED,
    ...(hasEmpresaFilter ? [empresaIds] : [])
  ]);

  const multiYearIvaSummary: Record<string, Record<string, { repercutido: number; soportado: number }>> = {};
  multiYearIvaRows.forEach(r => {
    if (r.year && r.quarter) {
      const y = r.year.toString();
      const q = r.quarter.toString();
      if (!multiYearIvaSummary[y]) multiYearIvaSummary[y] = {};
      multiYearIvaSummary[y][q] = {
        repercutido: Number(r.repercutido),
        soportado: Number(r.soportado)
      };
    }
  });

  // ✅ YEARLY IVA SUMMARY
  const [ivaYearlyRows] = await db.query<RowDataPacket[]>(`
        WITH DocTypes AS (
            SELECT 
                d.id,
                d.fecha_emision,
                d.importe_total,
                i.cuota as iva_cuota,
                CASE 
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR d.importe_total < 0 
                    THEN 1 
                    ELSE 0 
                END as es_abono,
                CASE
                    WHEN LOWER(d.tipo_documento) REGEXP 'emitid[oa]' THEN 1
                    WHEN LOWER(d.tipo_documento) REGEXP 'recibid[oa]' THEN 0
                    WHEN LOWER(d.tipo_documento) LIKE '%albar%' THEN
                        CASE
                            WHEN EXISTS (
                                SELECT 1 FROM entidades_documento e2 
                                WHERE e2.documento_id = d.id 
                                  AND e2.rol IN ('cliente', 'receptor')
                            ) THEN 1
                            ELSE 0
                        END
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' THEN
                        CASE
                            WHEN (SELECT COALESCE(e2.identificador_fiscal_hash, e2.identificador_fiscal) 
                                  FROM entidades_documento e2 
                                  WHERE e2.documento_id = d.id 
                                    AND e2.rol IN ('emisor', 'proveedor') 
                                  LIMIT 1) IN (${cifPlaceholders})
                            THEN 1 ELSE 0
                        END
                    ELSE CASE WHEN d.importe_total < 0 THEN 1 ELSE 0 END
                END as is_issued
            FROM documentos d
            JOIN impuestos_documento i ON d.id = i.documento_id
            WHERE i.tipo_impuesto NOT LIKE '%retencion%'
              AND (
                  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
                  OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              )
              AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
            ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
        )
        SELECT
          YEAR(fecha_emision) as year,
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 0 THEN iva_cuota 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 1 AND es_abono = 1 THEN ABS(iva_cuota) 
            ELSE 0 
          END), 0) as repercutido,
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 0 THEN iva_cuota 
            ELSE 0 
          END), 0) - COALESCE(SUM(CASE 
            WHEN is_issued = 0 AND es_abono = 1 THEN ABS(iva_cuota) 
            ELSE 0 
          END), 0) as soportado
        FROM DocTypes
        GROUP BY year
        ORDER BY year ASC
    `, [
    ...MY_COMPANY_FISCAL_COMBINED,
    ...(hasEmpresaFilter ? [empresaIds] : [])
  ]);

  const ivaYearlySummary: Record<string, { repercutido: number; soportado: number }> = {};
  ivaYearlyRows.forEach(r => {
    if (r.year) {
      ivaYearlySummary[r.year.toString()] = {
        repercutido: Number(r.repercutido),
        soportado: Number(r.soportado)
      };
    }
  });

  // ✅ TOP 5 PROVEEDORES
  // Filter by period if yearToUse/quarter provided
  // We need to pass filters to getProvidersWithStats or handle it here?
  // Since topProviders uses a separate function call, we might need to update that signature or call getTopProviders directly
  // For now let's reuse getProvidersWithStats but note it doesn't take date filters yet...
  // WAIT - getProvidersWithStats is huge. 
  // Let's implement a simpler query here OR update getProvidersWithStats. 
  // Given complexity, let's implement a specific query here that respects the filters.

  const [providerStatsRows] = await db.query<any[]>(`
        SELECT 
            MAX(e.id) as entidad_id,
            SUM(d.importe_total) as totalSpent,
            COUNT(DISTINCT d.id) as totalDocs,
            MAX(d.fecha_emision) as lastDate
        FROM documentos d
        JOIN entidades_documento e ON d.id = e.documento_id
        WHERE e.rol IN ('proveedor', 'emisor')
          AND COALESCE(e.identificador_fiscal_hash, e.identificador_fiscal) NOT IN (${cifPlaceholders})
          AND COALESCE(e.nombre_hash, e.id) NOT IN (${namePlaceholders})
          AND d.importe_total > 0 -- Solo gastos positivos
          AND (
              (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          )
          AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
          ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
          ${wherePeriodFilter}
        GROUP BY COALESCE(e.identificador_fiscal_hash, e.nombre_hash, e.id)
        ORDER BY totalSpent DESC
        LIMIT 5
    `, [
    ...MY_COMPANY_FISCAL_COMBINED,
    ...MY_COMPANY_NAME_COMBINED,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams
  ]);

  const topProviderEntityIds = providerStatsRows.map(r => BigInt(r.entidad_id));
  const topProviderEntities = topProviderEntityIds.length > 0 ? await prisma.entidades_documento.findMany({ where: { id: { in: topProviderEntityIds } } }) : [];
  const topProviderMap = new Map(topProviderEntities.map(e => [Number(e.id), e]));

  const topProviders = providerStatsRows.map(p => {
    const dec = topProviderMap.get(Number(p.entidad_id));
    return {
      name: dec?.nombre || 'Desconocido',
      total: Number(p.totalSpent),
      fiscalId: dec?.identificador_fiscal || null
    };
  });

  const [clientStatsRows] = await db.query<any[]>(`
        SELECT 
            MAX(e.id) as entidad_id,
            SUM(d.importe_total) as totalEarned,
            COUNT(DISTINCT d.id) as totalDocs,
            MAX(d.fecha_emision) as lastDate
        FROM documentos d
        JOIN entidades_documento e ON d.id = e.documento_id
        WHERE e.rol IN ('cliente', 'receptor')
          AND COALESCE(e.identificador_fiscal_hash, e.identificador_fiscal) NOT IN (${cifPlaceholders})
          AND COALESCE(e.nombre_hash, e.id) NOT IN (${namePlaceholders})
          AND d.importe_total > 0
          AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
          AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
          ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
          ${wherePeriodFilter}
        GROUP BY COALESCE(e.identificador_fiscal_hash, e.nombre_hash, e.id)
        ORDER BY totalEarned DESC
        LIMIT 5
    `, [
    ...MY_COMPANY_FISCAL_COMBINED,
    ...MY_COMPANY_NAME_COMBINED,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams
  ]);

  const topClientEntityIds = clientStatsRows.map(r => BigInt(r.entidad_id));
  const topClientEntities = topClientEntityIds.length > 0 ? await prisma.entidades_documento.findMany({ where: { id: { in: topClientEntityIds } } }) : [];
  const topClientMap = new Map(topClientEntities.map(e => [Number(e.id), e]));

  const topClients = clientStatsRows.map(p => {
    const dec = topClientMap.get(Number(p.entidad_id));
    return {
      name: dec?.nombre || 'Desconocido',
      total: Number(p.totalEarned),
      fiscalId: dec?.identificador_fiscal || null
    };
  });

  const analyticsData = {
    kpis: {
      // ✅ Usamos los valores exactos extraídos de BDD, en lugar del cálculo teórico del redondeo.
      totalIngresos: Number(kpis.totalIngresos || 0),
      totalGastos: Number(kpis.totalGastos || 0),
      totalIngresosSinIva: Number(kpis.totalIngresosSinIva || 0),
      totalGastosSinIva: Number(kpis.totalGastosSinIva || 0),
      beneficio: Number(kpis.totalIngresos || 0) - Number(kpis.totalGastos || 0),
      beneficioSinIva: Number(beneficioSinIva),
      ivaRepercutido: Number(kpis.ivaRepercutido),
      ivaSoportado: Number(kpis.ivaSoportado),
      recargoRepercutido: Number(kpis.recargoRepercutido || 0),
      recargoSoportado: Number(kpis.recargoSoportado || 0),
      resultadoIva: Number(resultadoIva),
      totalFacturasIngreso: Number(kpis.totalFacturasIngreso || 0),
      totalFacturasGasto: Number(kpis.totalFacturasGasto || 0),
      incidenciasAbiertas: Number(kpis.incidenciasAbiertas || 0),
      totalProveedores: Number(kpis.totalProveedores || 0),
      totalProductos: Number(kpis.totalProductos || 0),
      incidentRate: Number(incidentRate || 0),
      totalDocs: Number(kpis.totalDocs || 0),
      retencionRepercutido: Number(kpis.retencionRepercutido || 0),
      retencionSoportado: Number(kpis.retencionSoportado || 0),
      hasMismatches: !!kpis.hasMismatches, // ✅ Nuevo campo
    },
    quarterlySummary,
    yearlySummary,
    multiYearQuarterlySummary,
    documentDistribution: distributionRows.map(r => ({
      name: r.name,
      value: Number(r.value)
    })),
    ivaSummary,
    ivaYearlySummary,
    multiYearIvaSummary,
    topProviders,
    topClients,
    yearUsed: yearToUse
  };

  console.log('📊 [getDashboardAnalytics] Resultado final:', analyticsData.kpis);

  return serializeData(analyticsData);
}


/**
 * Obtiene todos los trimestres con estadísticas
 * ✅ CORREGIDO: Ahora clasifica por tipo de documento (emitida vs recibida)
 */
export async function getTrimestresList(
  userId: number,
  filters?: TrimestreFilters
): Promise<Trimestre[]> {
  const conn = await db.getConnection();

  try {
    let whereConditions = ['JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))'];
    const params: any[] = [userId];

    // Filtro por múltiples empresas usando IN
    if (filters?.empresa_id) {
      if (Array.isArray(filters.empresa_id)) {
        if (filters.empresa_id.length > 0) {
          const placeholders = filters.empresa_id.map(() => '?').join(', ');
          whereConditions.push(`d.id_de_empresa IN(${placeholders})`);
          params.push(...filters.empresa_id);
        }
      } else {
        whereConditions.push('d.id_de_empresa = ?');
        params.push(filters.empresa_id);
      }
    }

    // Filtro por año
    if (filters?.año) {
      whereConditions.push('d.año_trimestre = ?');
      params.push(filters.año);
    }

    const whereClause = whereConditions.join(' AND ');

    // ✅ OBTENER CIFs de las empresas para clasificar is_issued
    let MY_COMPANY_FISCAL_IDS: string[] = [];

    if (filters?.empresa_id) {
      const empresaIds = Array.isArray(filters.empresa_id)
        ? filters.empresa_id
        : [filters.empresa_id];

      if (empresaIds.length > 0) {
        const empresasInfo = await prisma.empresas.findMany({
          where: { id: { in: empresaIds } },
          select: { CIF: true }
        });
        MY_COMPANY_FISCAL_IDS = empresasInfo.map((e: any) => e.CIF).filter(Boolean) as string[];
      }
    }

    const MY_COMPANY_FISCAL_COMBINED = MY_COMPANY_FISCAL_IDS.length > 0
      ? [...MY_COMPANY_FISCAL_IDS.map(cif => require('crypto').createHash('sha256').update(cif.toLowerCase().trim()).digest('hex')), ...MY_COMPANY_FISCAL_IDS]
      : [];

    const cifPlaceholders = MY_COMPANY_FISCAL_COMBINED.length > 0
      ? MY_COMPANY_FISCAL_COMBINED.map(() => '?').join(',')
      : "'NEVER_MATCH'";

    // ✅ CAMBIO CRÍTICO: Usar importe_total (CON IVA) en lugar de importe_sin_impuestos
    const query = `
      WITH DocTypes AS(
  SELECT 
          d.id,
  d.año_trimestre,
  d.num_trimestre,
  d.id_de_empresa,
  d.importe_total, -- ✅ CON IVA
          d.importe_sin_impuestos, -- ✅ SIN IVA(para el breakdown)
          COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.base_no_sujeta')) AS DECIMAL(10,2)), 0) as base_no_sujeta,
          d.trimestre_cerrado,
  d.fecha_cierre_trimestre,
  -- ✅ Identificar si es abono
  (CASE WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR LOWER(d.tipo_documento) LIKE '%crédito%' OR LOWER(d.tipo_documento) LIKE '%credito%' THEN 1 ELSE 0 END) as is_abono,
  -- ✅ Clasificar si es emitida(1) o recibida(0) sin multiplicar filas
  CASE WHEN EXISTS (
    SELECT 1 FROM entidades_documento ed 
    WHERE ed.documento_id = d.id 
      AND ed.rol IN ('emisor', 'proveedor') 
      AND COALESCE(ed.identificador_fiscal_hash, ed.identificador_fiscal) IN (${cifPlaceholders})
  ) THEN 1 ELSE 0 END as is_issued
        FROM documentos d
        LEFT JOIN empresas e ON d.id_de_empresa = e.id
        WHERE ${whereClause}
          AND(
    (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR(LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR(LOWER(d.tipo_documento) LIKE '%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR(LOWER(d.tipo_documento) LIKE '%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
)
AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
        GROUP BY d.id
      )
SELECT
  dt.año_trimestre as año,
  dt.num_trimestre as trimestre,
  dt.id_de_empresa as empresa_id,
  COUNT(DISTINCT dt.id) as total_documentos,

  -- ✅ TOTALES CON IVA (Abonos restan)
  COALESCE(SUM(CASE 
          WHEN dt.is_issued = 1 THEN 
            CASE WHEN dt.is_abono = 1 THEN -ABS(dt.importe_total) ELSE dt.importe_total END
          ELSE 0 
        END), 0) as total_ingresos,

  COALESCE(SUM(CASE 
          WHEN dt.is_issued = 0 THEN 
            CASE WHEN dt.is_abono = 1 THEN -ABS(dt.importe_total) ELSE dt.importe_total END
          ELSE 0 
        END), 0) as total_gastos,

  -- ✅ TOTALES SIN IVA (Abonos restan)
  COALESCE(SUM(CASE 
          WHEN dt.is_issued = 1 THEN 
             CASE WHEN dt.is_abono = 1 THEN -ABS(dt.importe_sin_impuestos + dt.base_no_sujeta) ELSE (dt.importe_sin_impuestos + dt.base_no_sujeta) END
          ELSE 0 
        END), 0) as total_ingresos_sin_iva,

  COALESCE(SUM(CASE 
          WHEN dt.is_issued = 0 THEN 
             CASE WHEN dt.is_abono = 1 THEN -ABS(dt.importe_sin_impuestos + dt.base_no_sujeta) ELSE (dt.importe_sin_impuestos + dt.base_no_sujeta) END
          ELSE 0 
        END), 0) as total_gastos_sin_iva,

  -- ✅ IVA Repercutido (Abonos restan)
  COALESCE((
    SELECT SUM(
      CASE WHEN (LOWER(d3.tipo_documento) LIKE '%abono%' OR LOWER(d3.tipo_documento) LIKE '%crédito%' OR LOWER(d3.tipo_documento) LIKE '%credito%') 
      THEN -ABS(i.cuota) 
      ELSE i.cuota END
    )
          FROM impuestos_documento i
          JOIN DocTypes dt2 ON i.documento_id = dt2.id
          JOIN documentos d3 ON dt2.id = d3.id 
          WHERE dt2.año_trimestre = dt.año_trimestre
            AND dt2.num_trimestre = dt.num_trimestre
            AND dt2.id_de_empresa = dt.id_de_empresa
            AND dt2.is_issued = 1
            AND(i.tipo_impuesto IS NULL OR (LOWER(i.tipo_impuesto) NOT LIKE '%retencion%' AND LOWER(i.tipo_impuesto) NOT LIKE '%reten%' AND LOWER(i.tipo_impuesto) NOT LIKE '%irpf%' AND LOWER(i.tipo_impuesto) NOT LIKE '%recargo%' AND LOWER(i.tipo_impuesto) NOT LIKE '%equivalencia%'))
), 0) as iva_repercutido,

  -- ✅ IVA Soportado (Abonos restan)
  COALESCE((
    SELECT SUM(
      CASE WHEN (LOWER(d4.tipo_documento) LIKE '%abono%' OR LOWER(d4.tipo_documento) LIKE '%crédito%' OR LOWER(d4.tipo_documento) LIKE '%credito%') 
      THEN -ABS(i.cuota) 
      ELSE i.cuota END
    )
          FROM impuestos_documento i
          JOIN DocTypes dt3 ON i.documento_id = dt3.id
          JOIN documentos d4 ON dt3.id = d4.id
          WHERE dt3.año_trimestre = dt.año_trimestre
            AND dt3.num_trimestre = dt.num_trimestre
            AND dt3.id_de_empresa = dt.id_de_empresa
            AND dt3.is_issued = 0
            AND(i.tipo_impuesto IS NULL OR (LOWER(i.tipo_impuesto) NOT LIKE '%retencion%' AND LOWER(i.tipo_impuesto) NOT LIKE '%reten%' AND LOWER(i.tipo_impuesto) NOT LIKE '%irpf%' AND LOWER(i.tipo_impuesto) NOT LIKE '%recargo%' AND LOWER(i.tipo_impuesto) NOT LIKE '%equivalencia%'))
), 0) as iva_soportado,

  -- ✅ NUEVO: RECARGO REPERCUTIDO
  COALESCE((
    SELECT SUM(
      CASE WHEN (LOWER(d5.tipo_documento) LIKE '%abono%' OR LOWER(d5.tipo_documento) LIKE '%crédito%' OR LOWER(d5.tipo_documento) LIKE '%credito%')
      THEN -ABS(i.cuota)
      ELSE i.cuota END
    )
    FROM impuestos_documento i
    JOIN DocTypes dt4 ON i.documento_id = dt4.id
    JOIN documentos d5 ON dt4.id = d5.id
    WHERE dt4.año_trimestre = dt.año_trimestre
      AND dt4.num_trimestre = dt.num_trimestre
      AND dt4.id_de_empresa = dt.id_de_empresa
      AND dt4.is_issued = 1
      AND (i.tipo_impuesto LIKE '%recargo%' OR i.tipo_impuesto LIKE '%equivalencia%')
  ), 0) as recargo_repercutido,

  -- ✅ NUEVO: RECARGO SOPORTADO
  COALESCE((
    SELECT SUM(
      CASE WHEN (LOWER(d6.tipo_documento) LIKE '%abono%' OR LOWER(d6.tipo_documento) LIKE '%crédito%' OR LOWER(d6.tipo_documento) LIKE '%credito%')
      THEN -ABS(i.cuota)
      ELSE i.cuota END
    )
    FROM impuestos_documento i
    JOIN DocTypes dt5 ON i.documento_id = dt5.id
    JOIN documentos d6 ON dt5.id = d6.id
    WHERE dt5.año_trimestre = dt.año_trimestre
      AND dt5.num_trimestre = dt.num_trimestre
      AND dt5.id_de_empresa = dt.id_de_empresa
      AND dt5.is_issued = 0
      AND (i.tipo_impuesto LIKE '%recargo%' OR i.tipo_impuesto LIKE '%equivalencia%')
  ), 0) as recargo_soportado,

  MAX(dt.trimestre_cerrado) as cerrado,
  MAX(dt.fecha_cierre_trimestre) as fecha_cierre
      FROM DocTypes dt
      GROUP BY dt.año_trimestre, dt.num_trimestre, dt.id_de_empresa
      ORDER BY dt.año_trimestre DESC, dt.num_trimestre DESC
  `;

    console.log('📝 [getTrimestresList] Query ejecutándose...');
    console.log('📝 [getTrimestresList] Params:', [...MY_COMPANY_FISCAL_COMBINED, ...params]);

    const [rows] = await conn.query<RowDataPacket[]>(query, [...MY_COMPANY_FISCAL_COMBINED, ...params]);

    console.log('📊 [getTrimestresList] Filas obtenidas:', rows.length);

    if (rows.length > 0) {
      console.log('🔍 [getTrimestresList] Primera fila:', {
        año: rows[0].año,
        trimestre: rows[0].trimestre,
        empresa_id: rows[0].empresa_id,
        ingresos_con_iva: rows[0].total_ingresos,
        ingresos_sin_iva: rows[0].total_ingresos_sin_iva,
        gastos_con_iva: rows[0].total_gastos,
        gastos_sin_iva: rows[0].total_gastos_sin_iva,
        iva_repercutido: rows[0].iva_repercutido,
        iva_soportado: rows[0].iva_soportado
      });
    }

    // ✅ Hidratar nombres de empresa con Prisma (desencripta automáticamente)
    const uniqueEmpresaIds = [...new Set(rows.map(r => BigInt(r.empresa_id)).filter(Boolean))];
    const empresasData = uniqueEmpresaIds.length > 0
      ? await prisma.empresas.findMany({
          where: { id: { in: uniqueEmpresaIds } },
          select: { id: true, nombre_de_empresa: true }
        })
      : [];
    const empresaMap = new Map(empresasData.map(e => [Number(e.id), e.nombre_de_empresa || 'Sin empresa']));

    let trimestres = rows.map(row => ({
      año: row.año,
      trimestre: row.trimestre,
      empresa_id: row.empresa_id,
      empresa_nombre: empresaMap.get(row.empresa_id) || 'Sin empresa',
      total_documentos: Number(row.total_documentos),

      // ✅ TOTALES CON IVA (principal)
      total_ingresos: Number(row.total_ingresos || 0),
      total_gastos: Number(row.total_gastos || 0),

      // ✅ NUEVOS: TOTALES SIN IVA (para breakdown)
      total_ingresos_sin_iva: Number(row.total_ingresos_sin_iva || 0),
      total_gastos_sin_iva: Number(row.total_gastos_sin_iva || 0),

      iva_repercutido: Number(row.iva_repercutido || 0),
      iva_soportado: Number(row.iva_soportado || 0),
      recargo_repercutido: Number(row.recargo_repercutido || 0), // ✅ NUEVO
      recargo_soportado: Number(row.recargo_soportado || 0),     // ✅ NUEVO
      cerrado: Boolean(row.cerrado),
      fecha_cierre: row.fecha_cierre || null,
    }));

    // Si no se pidió mostrar vacíos, filtrar
    if (!filters?.mostrar_vacios) {
      trimestres = trimestres.filter(t => t.total_documentos > 0);
    }

    // ✅ ORDENAR EN MEMORIA: año DESC, trimestre DESC, empresa_nombre ASC (sobre texto ya desencriptado)
    trimestres.sort((a, b) => {
      if (a.año !== b.año) return b.año - a.año;
      if (a.trimestre !== b.trimestre) return b.trimestre - a.trimestre;
      return a.empresa_nombre.localeCompare(b.empresa_nombre);
    });

    console.log('✅ [getTrimestresList] Trimestres procesados:', trimestres.length);
    console.log('📊 [getTrimestresList] Resumen:');
    trimestres.forEach(t => {
      console.log(`   - ${t.año} -T${t.trimestre} ${t.empresa_nombre}: Ingresos ${t.total_ingresos.toFixed(2)}€ (CON IVA), Gastos ${t.total_gastos.toFixed(2)}€ (CON IVA)`);
    });

    return trimestres;
  } finally {
    conn.release();
  }
}
/**
 * Obtiene documentos de un trimestre específico
 * ✅ ARREGLADO: Ahora acepta múltiples empresas (array)
 */
/**
 * Obtiene documentos de un trimestre específico
 * ✅ ARREGLADO: Ahora acepta múltiples empresas (array)
 */
// ✅ MODIFICACIÓN EN: src/services/document-service.ts
// Reemplazar la función getDocumentosByTrimestre (línea ~2650) con esta versión:

/**
 * Obtiene documentos de un trimestre específico (o todo el año si trimestre es undefined)
 * ✅ ARREGLADO: Ahora acepta múltiples empresas (array)
 * ✅ ARREGLADO: Ahora filtra por tipo de documento (igual que getTrimestresList)
 */
export async function getDocumentosByTrimestre(
  userId: number,
  año: number,
  trimestre?: number, // ✅ AHORA ES OPCIONAL
  empresaIds?: number[] | null
): Promise<Document[]> {
  try {
    // ✅ VALIDACIÓN: Si no hay empresas, retornar array vacío
    if (!empresaIds || empresaIds.length === 0) {
      console.log('⚠️ [getDocumentosByTrimestre] No hay empresas seleccionadas, retornando []');
      return [];
    }

    let whereConditions = [
      'JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))',
      'd.año_trimestre = ?'
    ];
    const params: any[] = [userId, año];

    // ✅ FILTRO TRIMESTRE OPCIONAL
    if (trimestre) {
      whereConditions.push('d.num_trimestre = ?');
      params.push(trimestre);
    }

    // ✅ AHORA SIEMPRE hay empresaIds (validado arriba)
    const placeholders = empresaIds.map(() => '?').join(',');
    whereConditions.push(`d.id_de_empresa IN(${placeholders})`);
    params.push(...empresaIds);

    // ✅ NUEVO: Agregar filtro de tipo de documento (igual que getTrimestresList)
    whereConditions.push(`(
      (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
      OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
      OR (LOWER(d.tipo_documento) LIKE '%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
      OR (LOWER(d.tipo_documento) LIKE '%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )
    AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)`);

    const whereClause = whereConditions.join(' AND ');

    // ✅ CLASIFICACIÓN DINÁMICA: obtener CIFs para subquery igual que Dashboard
    const empresasInfo = await prisma.empresas.findMany({
      where: { id: { in: empresaIds } },
      select: { CIF: true }
    });
    const MY_COMPANY_FISCAL_IDS = empresasInfo.map((e: any) => e.CIF).filter(Boolean) as string[];
    const MY_COMPANY_FISCAL_COMBINED = MY_COMPANY_FISCAL_IDS.length > 0
      ? [...MY_COMPANY_FISCAL_IDS.map(cif => require('crypto').createHash('sha256').update(cif.toLowerCase().trim()).digest('hex')), ...MY_COMPANY_FISCAL_IDS]
      : [];
    const cifPlaceholders = MY_COMPANY_FISCAL_COMBINED.length > 0
      ? MY_COMPANY_FISCAL_COMBINED.map(() => '?').join(',')
      : "'NEVER_MATCH'";

    const query = `
SELECT
  d.id,
  d.tipo_documento,
  d.numero_documento,
  d.fecha_emision,
  d.fecha_vencimiento,
  d.importe_total,
  d.importe_sin_impuestos,
  d.moneda,
  d.observaciones,
  d.datos_extra,
  d.fecha_creacion,
  d.id_de_empresa,
  d.is_new,
  d.trimestre_cerrado,
  d.año_trimestre,
  d.num_trimestre,
  -- ✅ CLASIFICACIÓN DINÁMICA igual que Dashboard (no usa columna is_issued de BD)
  (SELECT COALESCE(MAX(CASE
      WHEN ed2.rol IN('emisor', 'proveedor')
        AND COALESCE(ed2.identificador_fiscal_hash, ed2.identificador_fiscal) IN(${cifPlaceholders})
      THEN 1
      ELSE 0
  END), 0) FROM entidades_documento ed2 WHERE ed2.documento_id = d.id) as is_issued
    FROM documentos d
    LEFT JOIN empresas e ON d.id_de_empresa = e.id
    WHERE ${whereClause}
    ORDER BY d.fecha_emision DESC
  `;

    // CIF params van primero (para la subquery), luego los params del WHERE
    const fullParams = [...MY_COMPANY_FISCAL_COMBINED, ...params];

    console.log('📝 [getDocumentosByTrimestre] Query:', query);
    console.log('📝 [getDocumentosByTrimestre] Params:', fullParams);

    const [documentRows] = await db.query<DocumentPacket[]>(query, fullParams);

    console.log('✅ [getDocumentosByTrimestre] Documentos encontrados:', documentRows.length);

    return mapDocumentPacketsToDocuments(documentRows);
  } catch (error) {
    console.error('❌ [getDocumentosByTrimestre] Error:', error);
    throw error;
  }
}
/**
 * Cierra un trimestre (bloqueo permanente)
 */
/**
 * Cierra un trimestre (bloqueo permanente)
 * ✅ ARREGLADO: Ahora también inserta/actualiza en la tabla trimestres
 */

/* Cierra un trimestre (bloqueo permanente)
 * ✅ CORREGIDO: Ahora clasifica por tipo de documento (emitida vs recibida)
 */
export async function cerrarTrimestre(
  userId: number,
  payload: CerrarTrimestrePayload
): Promise<{ affected: number; blocked?: boolean }> {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔒 [cerrarTrimestre] INICIANDO CIERRE');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 [cerrarTrimestre] Datos:', {
      userId,
      año: payload.año,
      trimestre: payload.trimestre,
      empresa_id: payload.empresa_id
    });

    let whereConditions = [
      'JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))',
      'd.año_trimestre = ?',
      'd.num_trimestre = ?',
      'd.trimestre_cerrado = 0',
      // ✅ Asegurar que NO tiene incidencias pendientes
      'd.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)'
    ];
    const params: any[] = [userId, payload.año, payload.trimestre];

    // Si se especifica empresa, cerrar solo esa empresa
    if (payload.empresa_id !== null) {
      whereConditions.push('d.id_de_empresa = ?');
      params.push(payload.empresa_id);
    }

    const whereClause = whereConditions.join(' AND ');

    // ═══════════════════════════════════════════════════════════
    // PASO 1: Actualizar documentos
    // ═══════════════════════════════════════════════════════════
    const query = `
      UPDATE documentos d
      JOIN empresas e ON d.id_de_empresa = e.id
SET
d.trimestre_cerrado = 1,
  d.fecha_cierre_trimestre = NOW()
      WHERE ${whereClause}
`;

    console.log('📝 [cerrarTrimestre] Query UPDATE documentos:', query);
    console.log('📝 [cerrarTrimestre] Params:', params);

    const affectedCount = await prisma.$executeRawUnsafe(query, ...params);

    console.log('✅ [cerrarTrimestre] Documentos actualizados:', affectedCount);

    // Si no hay documentos, bloquear el trimestre igualmente (empresa que empieza a mitad de año)
    if (affectedCount === 0) {
      const empresaIds: number[] = payload.empresa_id !== null
        ? [payload.empresa_id]
        : (await conn.query<RowDataPacket[]>(
            'SELECT id FROM empresas WHERE JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))',
            [userId]
          ))[0].map((e: RowDataPacket) => Number(e.id));

      if (empresaIds.length === 0) {
        console.warn('⚠️ [cerrarTrimestre] No hay empresas para bloquear el trimestre');
        return { affected: 0 };
      }

      for (const empresaId of empresaIds) {
        const existing = await prisma.trimestres.findFirst({
          where: {
            a_o: payload.año,
            num_trimestre: payload.trimestre,
            id_de_empresa: BigInt(empresaId),
            cerrado: true,
          },
        });
        if (existing) {
          continue;
        }

        await prisma.trimestres.upsert({
          where: {
            a_o_num_trimestre_id_de_empresa: {
              a_o: payload.año,
              num_trimestre: payload.trimestre,
              id_de_empresa: BigInt(empresaId),
            },
          },
          update: {
            cerrado: true,
            fecha_cierre: new Date(),
            fecha_actualizacion: new Date(),
          },
          create: {
            a_o: payload.año,
            num_trimestre: payload.trimestre,
            id_de_empresa: BigInt(empresaId),
            cerrado: true,
            fecha_cierre: new Date(),
            total_documentos: 0,
            total_ingresos: 0,
            total_gastos: 0,
            iva_repercutido: 0,
            iva_soportado: 0,
            fecha_creacion: new Date(),
            fecha_actualizacion: new Date(),
          },
        });
        console.log(`🔒 [cerrarTrimestre] Trimestre ${payload.año}Q${payload.trimestre} bloqueado sin documentos (empresa ${empresaId})`);
      }

      await conn.commit();
      return { affected: 0, blocked: true };
    }

    // ═══════════════════════════════════════════════════════════
    // PASO 2: Calcular estadísticas para la tabla trimestres
    // ═══════════════════════════════════════════════════════════
    let statsWhereConditions = [
      'JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON))',
      'd.año_trimestre = ?',
      'd.num_trimestre = ?'
    ];
    const statsParams: any[] = [userId, payload.año, payload.trimestre];

    if (payload.empresa_id !== null) {
      statsWhereConditions.push('d.id_de_empresa = ?');
      statsParams.push(payload.empresa_id);
    }

    const statsWhereClause = statsWhereConditions.join(' AND ');

    // ✅ OBTENER CIFs de las empresas
    let MY_COMPANY_FISCAL_IDS: string[] = [];

    const empresaIdsToQuery = payload.empresa_id !== null
      ? [payload.empresa_id]
      : [];

    if (empresaIdsToQuery.length > 0) {
      const [empresasRaw] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM empresas WHERE id IN (?) AND JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))',
        [empresaIdsToQuery, userId]
      );
      const validIds = empresasRaw.map(e => e.id);
      if (validIds.length > 0) {
        const empresasInfo = await prisma.empresas.findMany({ where: { id: { in: validIds } }, select: { CIF: true } });
        MY_COMPANY_FISCAL_IDS = empresasInfo.map((e: any) => e.CIF).filter(Boolean) as string[];
      }
    } else {
      // Si no hay empresa específica, obtener todas del usuario
      const [empresasRaw] = await conn.query<RowDataPacket[]>(
        'SELECT id FROM empresas WHERE JSON_CONTAINS(id_de_usuario, CAST(? AS JSON))',
        [userId]
      );
      const validIds = empresasRaw.map(e => e.id);
      if (validIds.length > 0) {
        const empresasInfo = await prisma.empresas.findMany({ where: { id: { in: validIds } }, select: { CIF: true } });
        MY_COMPANY_FISCAL_IDS = empresasInfo.map((e: any) => e.CIF).filter(Boolean) as string[];
      }
    }

    const MY_COMPANY_FISCAL_COMBINED = MY_COMPANY_FISCAL_IDS.length > 0
      ? [...MY_COMPANY_FISCAL_IDS.map(cif => require('crypto').createHash('sha256').update(cif.toLowerCase().trim()).digest('hex')), ...MY_COMPANY_FISCAL_IDS]
      : [];

    const cifPlaceholders = MY_COMPANY_FISCAL_COMBINED.length > 0
      ? MY_COMPANY_FISCAL_COMBINED.map(() => '?').join(',')
      : "'NEVER_MATCH'";

    // ✅ CAMBIO CRÍTICO: Usar importe_total (CON IVA) para guardar en tabla trimestres
    const statsQuery = `
      WITH DocTypes AS(
  SELECT 
          d.id,
  d.año_trimestre,
  d.num_trimestre,
  d.id_de_empresa,
  d.importe_total, -- ✅ CON IVA
          d.importe_sin_impuestos, -- ✅ SIN IVA(para el breakdown)
          d.fecha_cierre_trimestre,
  -- ✅ Identificar si es abono
  (CASE WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR LOWER(d.tipo_documento) LIKE '%crédito%' OR LOWER(d.tipo_documento) LIKE '%credito%' THEN 1 ELSE 0 END) as is_abono,
  -- ✅ Clasificar si es emitida(1) o recibida(0)
          MAX(CASE 
            WHEN ed.rol IN('emisor', 'proveedor') 
              AND COALESCE(ed.identificador_fiscal_hash, ed.identificador_fiscal) IN(${cifPlaceholders}) 
            THEN 1 
            ELSE 0 
          END) as is_issued
        FROM documentos d
        LEFT JOIN entidades_documento ed ON d.id = ed.documento_id
        JOIN empresas e ON d.id_de_empresa = e.id
        WHERE ${statsWhereClause}
          AND(
    (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR(LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR(LOWER(d.tipo_documento) LIKE '%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR(LOWER(d.tipo_documento) LIKE '%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
)
    AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
        GROUP BY d.id
      )
SELECT
dt.año_trimestre as año,
  dt.num_trimestre as trimestre,
  dt.id_de_empresa as empresa_id,
  COUNT(DISTINCT dt.id) as total_documentos,

  -- ✅ TOTALES CON IVA (Abonos restan)
  COALESCE(SUM(CASE 
          WHEN dt.is_issued = 1 THEN 
             CASE WHEN dt.is_abono = 1 THEN -ABS(dt.importe_total) ELSE dt.importe_total END
          ELSE 0 
        END), 0) as total_ingresos,

  COALESCE(SUM(CASE 
          WHEN dt.is_issued = 0 THEN 
             CASE WHEN dt.is_abono = 1 THEN -ABS(dt.importe_total) ELSE dt.importe_total END
          ELSE 0 
        END), 0) as total_gastos,

  -- ✅ IVA Repercutido (Abonos restan)
  COALESCE((
    SELECT SUM(
      CASE WHEN (LOWER(d3.tipo_documento) LIKE '%abono%' OR LOWER(d3.tipo_documento) LIKE '%crédito%' OR LOWER(d3.tipo_documento) LIKE '%credito%') 
      THEN -ABS(i.cuota) 
      ELSE i.cuota END
    )
          FROM impuestos_documento i
          JOIN DocTypes dt2 ON i.documento_id = dt2.id
          JOIN documentos d3 ON dt2.id = d3.id
          WHERE dt2.año_trimestre = dt.año_trimestre
            AND dt2.num_trimestre = dt.num_trimestre
            AND dt2.id_de_empresa = dt.id_de_empresa
            AND dt2.is_issued = 1
            AND(i.tipo_impuesto IS NULL OR i.tipo_impuesto NOT LIKE '%retencion%')
), 0) as iva_repercutido,

  -- ✅ IVA Soportado (Abonos restan)
  COALESCE((
    SELECT SUM(
      CASE WHEN (LOWER(d4.tipo_documento) LIKE '%abono%' OR LOWER(d4.tipo_documento) LIKE '%crédito%' OR LOWER(d4.tipo_documento) LIKE '%credito%') 
      THEN -ABS(i.cuota) 
      ELSE i.cuota END
    )
          FROM impuestos_documento i
          JOIN DocTypes dt3 ON i.documento_id = dt3.id
          JOIN documentos d4 ON dt3.id = d4.id
          WHERE dt3.año_trimestre = dt.año_trimestre
            AND dt3.num_trimestre = dt.num_trimestre
            AND dt3.id_de_empresa = dt.id_de_empresa
            AND dt3.is_issued = 0
            AND(i.tipo_impuesto IS NULL OR i.tipo_impuesto NOT LIKE '%retencion%')
), 0) as iva_soportado
      FROM DocTypes dt
      GROUP BY dt.año_trimestre, dt.num_trimestre, dt.id_de_empresa
  `;

    console.log('📊 [cerrarTrimestre] Query estadísticas:', statsQuery);
    console.log('📊 [cerrarTrimestre] Params:', [...MY_COMPANY_FISCAL_COMBINED, ...statsParams]);

    const statsRows = await prisma.$queryRawUnsafe<any[]>(statsQuery, ...MY_COMPANY_FISCAL_COMBINED, ...statsParams);

    console.log('📊 [cerrarTrimestre] Filas de estadísticas obtenidas:', statsRows.length);

    if (statsRows.length === 0) {
      console.warn('⚠️ [cerrarTrimestre] No se encontraron estadísticas para guardar');
      console.log('═══════════════════════════════════════════════════════════');
      return { affected: 0 };
    }

    // ═══════════════════════════════════════════════════════════
    // PASO 3: INSERT ON DUPLICATE KEY UPDATE para cada empresa
    // ═══════════════════════════════════════════════════════════
    for (const stats of statsRows) {
      console.log('───────────────────────────────────────────────────────────');
      console.log('💾 [cerrarTrimestre] Guardando en tabla trimestres (CON IVA):', {
        año: stats.año,
        trimestre: stats.trimestre,
        empresa_id: stats.empresa_id,
        total_documentos: stats.total_documentos,
        total_ingresos: Number(stats.total_ingresos).toFixed(2) + ' € (CON IVA)',
        total_gastos: Number(stats.total_gastos).toFixed(2) + ' € (CON IVA)',
        iva_repercutido: Number(stats.iva_repercutido).toFixed(2),
        iva_soportado: Number(stats.iva_soportado).toFixed(2)
      });

      const insertQuery = `
        INSERT INTO trimestres(
    año,
    num_trimestre,
    id_de_empresa,
    cerrado,
    fecha_cierre,
    total_documentos,
    total_ingresos,
    total_gastos,
    iva_repercutido,
    iva_soportado,
    fecha_creacion,
    fecha_actualizacion
  ) VALUES(?, ?, ?, 1, NOW(), ?, ?, ?, ?, ?, NOW(), NOW())
        ON DUPLICATE KEY UPDATE
cerrado = 1,
  fecha_cierre = NOW(),
  total_documentos = VALUES(total_documentos),
  total_ingresos = VALUES(total_ingresos),
  total_gastos = VALUES(total_gastos),
  iva_repercutido = VALUES(iva_repercutido),
  iva_soportado = VALUES(iva_soportado),
  fecha_actualizacion = NOW()
    `;

      const upsertData = {
        cerrado: true,
        fecha_cierre: new Date(),
        total_documentos: Number(stats.total_documentos),
        total_ingresos: stats.total_ingresos,
        total_gastos: stats.total_gastos,
        iva_repercutido: stats.iva_repercutido,
        iva_soportado: stats.iva_soportado,
        fecha_actualizacion: new Date()
      };
      await prisma.trimestres.upsert({
        where: {
          a_o_num_trimestre_id_de_empresa: {
            a_o: stats.año,
            num_trimestre: stats.trimestre,
            id_de_empresa: BigInt(stats.empresa_id),
          },
        },
        update: upsertData,
        create: {
          a_o: stats.año,
          num_trimestre: stats.trimestre,
          id_de_empresa: BigInt(stats.empresa_id),
          ...upsertData,
          fecha_creacion: new Date(),
        },
      });

      console.log(`✅[cerrarTrimestre] Registro guardado en trimestres (empresa: ${stats.empresa_id})`);
    }

    console.log('───────────────────────────────────────────────────────────');
    console.log('🎉 [cerrarTrimestre] TRANSACCIÓN COMPLETADA EXITOSAMENTE');
    console.log('═══════════════════════════════════════════════════════════');

    try {
      const { logAuditAction } = await import('./audit-service');
      const { getCurrentUser } = await import('./user-service');
      const user = await getCurrentUser();
      if (user) {
        await logAuditAction({
          empresaId: payload.empresa_id,
          accion: 'CIERRE_TRIMESTRE',
          usuarioEmail: user.email,
          userId: user.id,
          detalle: { año: payload.año, trimestre: payload.trimestre, statsRows: statsRows.length },
        });
      }
    } catch (auditErr) {
      console.warn('⚠️ Error registrando auditoría CIERRE_TRIMESTRE:', auditErr);
    }

    return { affected: affectedCount || 1 }; // legacy: return { affected: ids.length };
  } catch (error) {
    await conn.rollback();
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ [cerrarTrimestre] ERROR CRÍTICO');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ Error:', error);
    console.error('═══════════════════════════════════════════════════════════');
    throw error;
  } finally {
    conn.release();
  }
}


/**
 * Verifica si un documento pertenece a un trimestre cerrado
 */
export async function isTrimestreCerrado(documentId: number): Promise<boolean> {
  try {
    const query = `
      SELECT trimestre_cerrado 
      FROM documentos 
      WHERE id = ?
  `;

    const [rows] = await db.query<RowDataPacket[]>(query, [documentId]);

    return rows.length > 0 ? Boolean(rows[0].trimestre_cerrado) : false;
  } catch (error) {
    console.error('❌ [isTrimestreCerrado] Error:', error);
    return false;
  }
}
/**
 * Crea un registro de exportación
 */
export async function createExport(payload: {
  userId: number;
  tipoExport: string;
  añoFiltro?: number | null;
  trimestreFiltro?: number | null;
  empresasIds?: number[];
  documentoIds?: number[];
  filtrosAplicados?: any;
}): Promise<{ success: boolean; exportId?: number; error?: string }> {
  try {
    const newExport = await prisma.exports.create({
      data: {
        id_de_usuario: payload.userId,
        tipo_export: payload.tipoExport,
        a_o_filtro: payload.añoFiltro || null,
        trimestre_filtro: payload.trimestreFiltro || null,
        empresas_ids: payload.empresasIds ? payload.empresasIds : [],
        documento_ids: payload.documentoIds ? payload.documentoIds : [],
        total_documentos: payload.documentoIds?.length || 0,
        filtros_aplicados: payload.filtrosAplicados || null,
        estado: 'pending'
      } as any
    });

    return { success: true, exportId: Number(newExport.id) };
  } catch (error) {
    console.error('❌ [createExport] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al crear exportación'
    };
  }
}

/**
 * Actualiza un export cuando el webhook de Microservice responde
 */
export async function updateExportStatus(
  exportId: number,
  status: 'processing' | 'completed' | 'failed',
  urlArchivo?: string,
  nombreArchivo?: string,
  errorMensaje?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.exports.update({
      where: { id: exportId },
      data: {
        estado: status,
        url_archivo: urlArchivo || null,
        nombre_archivo: nombreArchivo || null,
        error_mensaje: errorMensaje || null,
        fecha_completado: status === 'completed' ? new Date() : null
      } as any
    });

    return { success: true };
  } catch (error) {
    console.error('❌ [updateExportStatus] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Error al actualizar exportación'
    };
  }
}

/**
 * Obtiene los exports del usuario
 */
export async function getUserExports(userId: number): Promise<any[]> {
  try {
    const rows = await prisma.exports.findMany({
      where: { id_de_usuario: userId } as any,
      orderBy: { fecha_generacion: 'desc' } as any,
      take: 50
    });

    return rows;
  } catch (error) {
    console.error('❌ [getUserExports] Error:', error);
    return [];
  }
}

/**
 * Obtiene datos del dashboard para exportar
 */
export async function getDashboardExportData(
  empresaIds?: number[],
  año?: number,
  trimestre?: number
): Promise<{
  analytics: DashboardAnalytics;
  documentIds: number[];
  metadata: any;
  yearUsed?: number;
}> {
  try {
    console.log('📊 [getDashboardExportData] Iniciando con:', { empresaIds, año, trimestre });

    // Obtener analytics
    const analytics = await getDashboardAnalytics(empresaIds, año, trimestre);

    console.log('✅ [getDashboardExportData] Analytics:', JSON.stringify(analytics.kpis));

    // ✅ ARREGLADO: Query simple sin filtros extra
    const hasEmpresaFilter = empresaIds && empresaIds.length > 0;

    let query = `SELECT d.id FROM documentos d WHERE 1 = 1`;
    const params: any[] = [];

    if (hasEmpresaFilter) {
      query += ` AND d.id_de_empresa IN(?)`;
      params.push(empresaIds);
    }

    // ✅ SOLO agregar filtro de trimestre si está especificado
    if (año !== null && año !== undefined && trimestre !== null && trimestre !== undefined) {
      query += ` AND d.año_trimestre = ? AND d.num_trimestre = ? `;
      params.push(año, trimestre);
    }

    console.log('📝 [getDashboardExportData] Query:', query);
    console.log('📝 [getDashboardExportData] Params:', params);

    const [docs] = await db.query<RowDataPacket[]>(query, params);
    const documentIds = docs.map(d => d.id);

    console.log('📊 [getDashboardExportData] IDs encontrados:', documentIds);

    return {
      analytics,
      documentIds,
      metadata: {
        empresaIds,
        año: analytics.yearUsed || año,
        trimestre,
        totalDocumentos: documentIds.length,
        fechaGeneracion: new Date().toISOString()
      },
      yearUsed: analytics.yearUsed || año,
    };
  } catch (error) {
    console.error('❌ [getDashboardExportData] Error:', error);
    throw error;
  }
}
/**
 * Obtiene lista única de clientes para filtros
 * ✅ NUEVA FUNCIÓN: Acepta filtro por empresas
 */
export async function getUniqueClients(empresaIds?: number[]): Promise<string[]> {
  const t0 = performance.now();
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    // Si el client manda empresaIds, usarlos (ya vienen del CompanyProvider del user).
    // Evita getCompanies() extra (~1.3s) en cada filtro.
    let targetEmpresaIds = empresaIds && empresaIds.length > 0 ? empresaIds : [];
    if (targetEmpresaIds.length === 0) {
      const allowedCompanies = await getCompanies();
      targetEmpresaIds = allowedCompanies.map(c => c.id);
    }
    if (targetEmpresaIds.length === 0) return [];

    const tEnt = performance.now();
    // Solo clientes de facturas EMITIDAS. Seleccionamos también el hash para deduplicar por CIF.
    const entidades = await prisma.entidades_documento.findMany({
      where: {
        documentos: {
          id_de_empresa: { in: targetEmpresaIds.map(id => BigInt(id)) },
          tipo_documento: { contains: 'EMITIDA' }
        },
        rol: { in: ['receptor', 'cliente'] }
      },
      select: {
        nombre: true,
        identificador_fiscal_hash: true
      }
    });
    console.log(`⏱️ [PERF] getUniqueClients.entidades | ${Math.round(performance.now() - tEnt)}ms | rows=${entidades.length}`);

    // Deduplicar por fiscal_hash (si existe) → un nombre canónico por CIF, ignorando diferencias de case/typo
    const seenHashes = new Set<string>();
    const uniqueNombres: string[] = [];
    for (const e of entidades) {
      if (!e.nombre || e.nombre.trim() === '') continue;
      const key = e.identificador_fiscal_hash || e.nombre.trim().toLowerCase();
      if (!seenHashes.has(key)) {
        seenHashes.add(key);
        uniqueNombres.push(e.nombre.trim());
      }
    }
    uniqueNombres.sort((a, b) => a.localeCompare(b));

    console.log('✅ [getUniqueClients] Clientes únicos (Prisma):', uniqueNombres.length);
    console.log(`⏱️ [PERF] getUniqueClients.TOTAL | ${Math.round(performance.now() - t0)}ms`);
    return uniqueNombres;
  } catch (error) {
    console.error('❌ [getUniqueClients] Error:', error);
    console.log(`⏱️ [PERF] getUniqueClients.TOTAL | ${Math.round(performance.now() - t0)}ms | error=1`);
    return [];
  }
}

/**
 * Obtiene lista única de proveedores para filtros (NOMBRES, no entities)
 * ✅ REEMPLAZA la función existente getUniqueProviders() que retorna DocumentEntity[]
 */
export async function getUniqueProvidersNames(empresaIds?: number[]): Promise<string[]> {
  const t0 = performance.now();
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    let targetEmpresaIds = empresaIds && empresaIds.length > 0 ? empresaIds : [];
    if (targetEmpresaIds.length === 0) {
      const allowedCompanies = await getCompanies();
      targetEmpresaIds = allowedCompanies.map(c => c.id);
    }
    if (targetEmpresaIds.length === 0) return [];

    const tEnt = performance.now();
    // Seleccionamos también el hash para deduplicar por CIF (colapsa variantes de mayúsculas/typos)
    const entidades = await prisma.entidades_documento.findMany({
      where: {
        documentos: {
          id_de_empresa: { in: targetEmpresaIds.map(id => BigInt(id)) }
        },
        rol: { in: ['proveedor', 'emisor'] }
      },
      select: {
        nombre: true,
        identificador_fiscal_hash: true
      }
    });
    console.log(`⏱️ [PERF] getUniqueProvidersNames.entidades | ${Math.round(performance.now() - tEnt)}ms | rows=${entidades.length}`);

    // Deduplicar por fiscal_hash → un nombre canónico por CIF, evita duplicados por case ("ALMACENES BEM" vs "Almacenes Bem")
    const seenHashes = new Set<string>();
    const uniqueNombres: string[] = [];
    for (const e of entidades) {
      if (!e.nombre || e.nombre.trim() === '') continue;
      const key = e.identificador_fiscal_hash || e.nombre.trim().toLowerCase();
      if (!seenHashes.has(key)) {
        seenHashes.add(key);
        uniqueNombres.push(e.nombre.trim());
      }
    }
    uniqueNombres.sort((a, b) => a.localeCompare(b));

    console.log('✅ [getUniqueProvidersNames] Proveedores únicos (Prisma):', uniqueNombres.length);
    console.log(`⏱️ [PERF] getUniqueProvidersNames.TOTAL | ${Math.round(performance.now() - t0)}ms`);
    return uniqueNombres;
  } catch (error) {
    console.error('❌ [getUniqueProvidersNames] Error:', error);
    console.log(`⏱️ [PERF] getUniqueProvidersNames.TOTAL | ${Math.round(performance.now() - t0)}ms | error=1`);
    return [];
  }
}

/**
 * Obtiene lista única de tipos de documento para filtros
 * Opcional: filtrar por empresaIds, año y trimestre
 */
export async function getUniqueDocumentTypes(
  empresaIds?: number[],
  año?: number,
  trimestre?: number
): Promise<string[]> {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    let query = `
      SELECT DISTINCT d.tipo_documento
      FROM documentos d
      JOIN empresas emp ON d.id_de_empresa = emp.id
      WHERE d.tipo_documento IS NOT NULL
        AND d.tipo_documento != ''
        AND JSON_CONTAINS(emp.id_de_usuario, CAST(? AS JSON))
    `;

    const params: any[] = [user.id];

    if (empresaIds && empresaIds.length > 0) {
      const placeholders = empresaIds.map(() => '?').join(',');
      query += ` AND d.id_de_empresa IN(${placeholders})`;
      params.push(...empresaIds);
    }

    if (año !== undefined) {
      query += ` AND d.año_trimestre = ?`;
      params.push(año);
    }

    if (trimestre !== undefined) {
      query += ` AND d.num_trimestre = ?`;
      params.push(trimestre);
    }

    query += ` ORDER BY d.tipo_documento ASC`;

    const [rows] = await db.query<RowDataPacket[]>(query, params);
    const tipos = rows.map(r => r.tipo_documento);

    console.log('✅ [getUniqueDocumentTypes] Tipos encontrados:', tipos.length);
    return tipos;
  } catch (error) {
    console.error('❌ [getUniqueDocumentTypes] Error:', error);
    return [];
  }
}

/**
 * Elimina múltiples documentos
 */
export async function deleteDocuments(ids: number[], userId: number): Promise<{ success: boolean; error?: string }> {
  if (!ids || ids.length === 0) return { success: true };

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    console.log(`🗑️[deleteDocuments] Eliminando ${ids.length} documentos para usuario ${userId} `);

    // ✅ BLOQUEO DE TRIMESTRE CERRADO
    const [closedCheck] = await connection.query<RowDataPacket[]>(`
      SELECT d.id, d.num_trimestre, d.año_trimestre 
      FROM documentos d
      LEFT JOIN empresas e ON d.id_de_empresa = e.id
      WHERE d.id IN (?) 
        AND d.trimestre_cerrado = 1
        AND (JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON)) OR d.id_de_empresa IS NULL)
    `, [ids, userId]);

    if (closedCheck.length > 0) {
      const firstLocked = closedCheck[0];
      console.warn(`⚠️ [deleteDocuments] Bloqueo masivo: ${closedCheck.length} documentos en trimestres cerrados.`);
      return {
        success: false,
        error: `No se pueden eliminar los documentos seleccionados porque ${closedCheck.length} de ellos pertenecen a trimestres cerrados (ej: ${firstLocked.año_trimestre}Q${firstLocked.num_trimestre}).`
      };
    }

    // Fetch docs data for webhooks BEFORE deleting
    const [docsToWebhook] = await connection.query<RowDataPacket[]>(`
      SELECT d.id as documento_id, d.numero_documento, d.id_de_empresa 
      FROM documentos d
      LEFT JOIN empresas e ON d.id_de_empresa = e.id
      WHERE d.id IN (?) 
        AND (JSON_CONTAINS(e.id_de_usuario, CAST(? AS JSON)) OR d.id_de_empresa IS NULL)
    `, [ids, userId]);

    // Obtener información del usuario para auditoría
    const userEmail = (await getCurrentUser())?.email || 'Desconocido';

    // Capturar snapshots e insertar auditoría (sin FK: fk_audit_documento es NO ACTION)
    const bigIds = ids.map(id => BigInt(id));
    for (const doc of docsToWebhook) {
      let snapshot = null;
      try {
        snapshot = await getSnapshotBeforeUpdate(Number(doc.documento_id));
      } catch (e) {
        console.warn(`⚠️ [deleteDocuments] Falló captura de snapshot previo a eliminar doc ${doc.documento_id}:`, e);
      }

      await prisma.documentos_auditoria.create({
        data: {
          documento_id: null,
          id_de_empresa: doc.id_de_empresa ? BigInt(doc.id_de_empresa) : BigInt(0),
          accion: 'DELETE',
          usuario: userEmail,
          detalle: JSON.stringify({ documento_id: Number(doc.documento_id), previo: snapshot }),
          fecha_accion: new Date()
        }
      });
    }

    await prisma.documentos_auditoria.updateMany({
      where: { documento_id: { in: bigIds } },
      data: { documento_id: null },
    });

    // Eliminar documentos en cascada (las relaciones en el schema tienen onDelete: Cascade)
    const result = await prisma.documentos.deleteMany({
      where: {
        id: { in: bigIds },
        OR: [
          { id_de_empresa: null },
          { empresas: { id_de_usuario: { array_contains: userId } } }
        ]
      }
    });

    console.log(`✅[deleteDocuments] Eliminados: ${ids.length || ids.length} `);

    await connection.commit();
    // 🔔 WEBHOOKS TRIGGER: Eliminación masiva (o individual según config)
    if (docsToWebhook && docsToWebhook.length > 0) {
      const docsByEmpresa: Record<number, any[]> = {};
      for (const doc of docsToWebhook) {
        if (!doc.id_de_empresa) continue;
        if (!docsByEmpresa[doc.id_de_empresa]) docsByEmpresa[doc.id_de_empresa] = [];
        docsByEmpresa[doc.id_de_empresa].push({
          documento_id: doc.documento_id,
          numero_documento: doc.numero_documento || null
        });
      }

      for (const [empresaIdStr, docs] of Object.entries(docsByEmpresa)) {
        const empId = parseInt(empresaIdStr, 10);
        fireBatchWebhook(empId, 'documento.eliminado', 'documentos.eliminados_masivo', docs).catch(err => {
          console.error('❌ [Background] Error disparando webhook batch de eliminación:', err);
        });
      }
    }
    revalidatePath('/documents');
    return { success: true };

  } catch (error) {
    await connection.rollback();
    console.error('❌ [deleteDocuments] Error:', error);
    return { success: false, error: 'Error al eliminar documentos' };
  } finally {
    connection.release();
  }
}

export async function getHealthCheckAnalytics(companyIds: number[]): Promise<{
  summary: { total: number; mismatches: number; logic_checks: number };
  documents: Document[];
  triggeredDiagnoses?: number[];
}> {
  if (companyIds.length === 0) return { summary: { total: 0, mismatches: 0, logic_checks: 0 }, documents: [] };

  const [rows] = await db.query<RowDataPacket[]>(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN (
          (LOWER(d.tipo_documento) LIKE '%factura%' OR LOWER(d.tipo_documento) LIKE '%abono%' OR LOWER(d.tipo_documento) LIKE '%ticket%' OR LOWER(d.tipo_documento) LIKE '%rectificativa%')
          AND LOWER(d.tipo_documento) NOT LIKE '%sin confirmar%'
          AND LOWER(d.tipo_documento) NOT LIKE '%otros%'
          AND
          (ABS(d.importe_total - (
              d.importe_sin_impuestos +
              COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.base_no_sujeta')) AS DECIMAL(10,2)), 0) -
              COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.descuento_global')) AS DECIMAL(10,2)), 0) +
              COALESCE((SELECT SUM(
                  CASE 
                      WHEN di2.tipo_impuesto LIKE '%RET%' AND (d.tipo_documento LIKE '%ABONO%' OR d.tipo_documento LIKE '%RECTIFICATIVA%') THEN -di2.cuota
                      ELSE di2.cuota
                  END
              ) FROM impuestos_documento di2 WHERE di2.documento_id = d.id), 0)
          )) > 0.05)
      ) THEN 1 ELSE 0 END) as mismatches
    FROM documentos d
    WHERE d.id_de_empresa IN (?)
  `, [companyIds]);

  // ─── FASE 1: Detectar y registrar checks LÓGICOS ───────────────────────────

  // 1a. Fecha anómala: YEAR(fecha_emision) != año_trimestre, o año < 2020
  const [fechaAnomalas] = await db.query<RowDataPacket[]>(`
    SELECT d.id, d.id_de_empresa, d.año_trimestre, DATE_FORMAT(d.fecha_emision, '%d/%m/%Y') as fecha_fmt
    FROM documentos d
    WHERE d.id_de_empresa IN (?)
      AND d.fecha_emision IS NOT NULL
      AND (
        YEAR(d.fecha_emision) != d.año_trimestre
        OR YEAR(d.fecha_emision) < 2020
      )
      AND d.id NOT IN (SELECT documento_id FROM ${dbName}.health_check_status WHERE verified = 0)
  `, [companyIds]);

  for (const doc of fechaAnomalas as any[]) {
    const motivo = `Fecha de emisión (${doc.fecha_fmt}) no coincide con el año del trimestre asignado (${doc.año_trimestre}). Posible error de OCR.`;
    await prisma.health_check_status.createMany({
      data: [{ documento_id: Number(doc.id), empresa_id: doc.id_de_empresa ? Number(doc.id_de_empresa) : null, verified: false, check_type: 'FECHA_ANOMALA', motivo }] as any[],
      skipDuplicates: true
    });
    console.log(`📅 [HealthCheck] Fecha anómala registrada para doc #${doc.id}`);
  }

  // 1b. Entidad duplicada: misma entidad como emisor/proveedor Y receptor/cliente
  const [entidadesDuplicadas] = await db.query<RowDataPacket[]>(`
    SELECT ed.documento_id, d.id_de_empresa,
           COALESCE(NULLIF(ed.identificador_fiscal_hash,''), NULLIF(ed.nombre_hash,''), 
                    NULLIF(ed.identificador_fiscal,''), ed.nombre) as entidad_key,
           MAX(ed.id) as entidad_id_sample
    FROM entidades_documento ed
    JOIN documentos d ON ed.documento_id = d.id
    WHERE d.id_de_empresa IN (?)
      AND ed.documento_id NOT IN (SELECT documento_id FROM ${dbName}.health_check_status WHERE verified = 0)
    GROUP BY ed.documento_id, entidad_key
    HAVING SUM(ed.rol IN ('emisor','proveedor')) > 0
       AND SUM(ed.rol IN ('receptor','cliente')) > 0
  `, [companyIds]);

  for (const doc of entidadesDuplicadas as any[]) {
    // ✅ Obtener nombre desencriptado con Prisma
    let nombreEntidad = doc.entidad_key || 'Desconocida';
    if (doc.entidad_id_sample) {
      const [rows] = await db.query<{ id: string }[]>(`
        SELECT id FROM entidades_documento
        WHERE id = ?
        LIMIT 1
      `, [doc.entidad_id_sample]);

      if (rows.length > 0) {
        const entidad = await prisma.entidades_documento.findUnique({ where: { id: BigInt(rows[0].id) }, select: { nombre: true, identificador_fiscal: true } });
        if (entidad) {
          nombreEntidad = entidad.nombre || entidad.identificador_fiscal || nombreEntidad;
        }
      }
    }

    const motivo = `La entidad "${nombreEntidad}" aparece simultáneamente como emisor/proveedor y receptor/cliente en el mismo documento.`;
    await prisma.health_check_status.createMany({
      data: [{ documento_id: Number(doc.documento_id), empresa_id: doc.id_de_empresa ? Number(doc.id_de_empresa) : null, verified: false, check_type: 'ENTIDAD_DUPLICADA', motivo }] as any[],
      skipDuplicates: true
    });
    console.log(`🔁 [HealthCheck] Entidad duplicada registrada para doc #${doc.documento_id}`);
  }

  // ─── FASE 2: Fetch documents with mismatches OR pending confirmation (verified = 0) ───
  const [docRows] = await db.query<DocumentPacket[]>(`
    SELECT 
      d.*,
      (CASE 
        WHEN (
          (LOWER(d.tipo_documento) LIKE '%factura%' OR LOWER(d.tipo_documento) LIKE '%abono%' OR LOWER(d.tipo_documento) LIKE '%ticket%' OR LOWER(d.tipo_documento) LIKE '%rectificativa%')
          AND LOWER(d.tipo_documento) NOT LIKE '%sin confirmar%'
          AND LOWER(d.tipo_documento) NOT LIKE '%otros%'
        )
        THEN (ABS(d.importe_total - (
            d.importe_sin_impuestos +
            COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.base_no_sujeta')) AS DECIMAL(10,2)), 0) -
            COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(d.datos_extra, '$.descuento_global')) AS DECIMAL(10,2)), 0) +
            COALESCE((SELECT SUM(
                CASE 
                    WHEN di2.tipo_impuesto LIKE '%RET%' AND (d.tipo_documento LIKE '%ABONO%' OR d.tipo_documento LIKE '%RECTIFICATIVA%') THEN -di2.cuota
                    ELSE di2.cuota
                END
            ) FROM impuestos_documento di2 WHERE di2.documento_id = d.id), 0)
        )))
        ELSE 0
      END) as mismatch_amount,
      hcs.verified as hcs_verified,
      hcs.check_type as hcs_check_type,
      hcs.motivo as hcs_motivo
    FROM documentos d
    LEFT JOIN ${dbName}.health_check_status hcs ON hcs.documento_id = d.id
    WHERE d.id_de_empresa IN (?)
    HAVING mismatch_amount > 0.05
       OR (mismatch_amount <= 0.05 AND hcs.verified = 0)
    ORDER BY d.fecha_emision DESC
    LIMIT 50
  `, [companyIds]);

  let documents = await mapDocumentPacketsToDocuments(docRows);
  const triggeredDiagnoses: number[] = [];

  // Auto-register newly detected mismatched documents and trigger first diagnosis
  for (const doc of docRows as any[]) {
    if (Number(doc.mismatch_amount || 0) > 0.05) {
      const insertResult = await prisma.health_check_status.createMany({
        data: [{ documento_id: Number(doc.id), empresa_id: doc.id_de_empresa ? Number(doc.id_de_empresa) : null, verified: false, check_type: 'MISMATCH_MATEMATICO', motivo: `Descuadre de ${Number(doc.mismatch_amount).toFixed(2)}€ entre importe total y la suma de base + impuestos.` }] as any[],
        skipDuplicates: true
      });
      // Only diagnose if this is a NEW registration AND has no prior suggestions
      if (insertResult.affectedRows > 0) {
        const [existingSuggestions] = await db.query<any[]>(
          `SELECT id FROM ${dbName}.ai_suggestions WHERE documento_id = ? LIMIT 1`,
          [doc.id]
        );
        if ((existingSuggestions as any[]).length === 0) {
          console.log(`🤖 [Auto-diagnosis] Disparando diagnóstico inicial para doc #${doc.id}...`);
          triggeredDiagnoses.push(doc.id);
          // Fire-and-forget: diagnose in background, don't block the response
          import('@/services/vertex-ai-service')
            .then(({ diagnoseDocument }) => {
              return diagnoseDocument(doc.id).then(() => {
                console.log(`✅ [Auto-diagnosis] Diagnóstico completado con éxito para doc #${doc.id}`);
              });
            })
            .catch((e: any) => console.error(`❌ [Auto-diagnosis] Error crítico para doc #${doc.id}:`, e));
        } else {
          console.log(`⏭️ [Auto-diagnosis] Doc #${doc.id} ya tiene sugerencias, saltando.`);
        }
      }
    }
  }

  if (documents.length > 0) {
    const docIds = documents.map(d => d.id_documento);

    const [suggestionRows] = await db.query<any[]>(
      'SELECT * FROM ai_suggestions WHERE documento_id IN (?)',
      [docIds]
    );

    const [statusRows] = await db.query<any[]>(
      `SELECT documento_id, verified, check_type, motivo FROM ${dbName}.health_check_status WHERE documento_id IN (?)`,

      [docIds]
    );

    documents.forEach(doc => {
      doc.ai_suggestions = suggestionRows.filter(s => s.documento_id === doc.id_documento);
      const status = statusRows.find((s: any) => s.documento_id === doc.id_documento);
      (doc as any).hcs_verified = status ? Number(status.verified) : null;
      (doc as any).hcs_check_type = status?.check_type ?? 'MISMATCH_MATEMATICO';
      (doc as any).hcs_motivo = status?.motivo ?? null;
      (doc as any).hcs_mismatch_amount = Number(
        (docRows as any[]).find(r => r.id === doc.id_documento)?.mismatch_amount || 0
      );
    });
    
    // Auto-clean mathematically fixed documents (so they disappear without requiring manual validation)
    const fixedDocIds = documents
      .filter(d => (d as any).hcs_check_type === 'MISMATCH_MATEMATICO' && (d as any).hcs_mismatch_amount <= 0.05 && (d as any).hcs_verified === 0)
      .map(d => d.id_documento);

    if (fixedDocIds.length > 0) {
      prisma.health_check_status.deleteMany({
        where: { 
          documento_id: { in: fixedDocIds.map(id => Number(id)) },
          check_type: 'MISMATCH_MATEMATICO'
        }
      }).catch(err => console.error('Error auto-cleaning fixed mismatches:', err));
      
      // Remove them from the current response so they disappear instantly from the UI
      documents = documents.filter(d => !fixedDocIds.includes(d.id_documento));
    }
  }

  // Contar alertas lógicas pendientes (FECHA_ANOMALA + ENTIDAD_DUPLICADA con verified = 0)
  const [logicRows] = await db.query<RowDataPacket[]>(`
    SELECT COUNT(*) as logic_checks
    FROM ${dbName}.health_check_status hcs
    JOIN documentos d ON hcs.documento_id = d.id
    WHERE d.id_de_empresa IN (?)
      AND hcs.verified = 0
      AND hcs.check_type IN ('FECHA_ANOMALA', 'ENTIDAD_DUPLICADA')
  `, [companyIds]);


  return {
    summary: {
      total: rows[0].total || 0,
      mismatches: Number(rows[0].mismatches) || 0,
      logic_checks: Number(logicRows[0].logic_checks) || 0
    },
    documents,
    triggeredDiagnoses
  };
}

/**
 * Confirms a document in health_check_status so it disappears from the Health Check dashboard.
 */
export async function confirmHealthCheckDocument(documentId: number): Promise<void> {
  await prisma.health_check_status.updateMany({
    where: { documento_id: Number(documentId) },
    data: { verified: true }
  });
}



// ==========================================
// CLIENT FUNCTIONS (Duplicated from Providers)
// ==========================================

export async function getClientByFiscalId(fiscalId: string): Promise<DocumentEntity | null> {
  if (!fiscalId) return null;
  const hash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');

  // Mismo parche pre-migración que para proveedores
  const [rows] = await db.query<{ id: string }[]>(`
    SELECT id FROM entidades_documento
    WHERE (identificador_fiscal_hash = ? OR identificador_fiscal = ?)
    AND rol IN ('cliente', 'receptor')
    LIMIT 1
  `, [hash, fiscalId]);

  if (rows.length === 0) return null;

  const p = await prisma.entidades_documento.findUnique({
    where: { id: BigInt(rows[0].id) }
  });

  if (!p) return null;

  const provider: DocumentEntity = {
    id: Number(p.id),
    rol: p.rol,
    nombre: p.nombre,
    direccion: p.direccion,
    identificador_fiscal: p.identificador_fiscal,
    telefono: p.telefono,
    email: p.email,
    datos_extra: safeJsonParse(p.datos_extra as string),
    fecha_creacion: p.fecha_creacion
  };

  return serializeData(provider);
}

export async function getDocumentsByClientName(
  fiscalId: string,
  empresaIds?: number[]
): Promise<Document[]> {
  const fiscalIdHash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');
  console.log('🔍 [getDocumentsByClientName] Iniciando:', { fiscalId, empresaIds });

  let query = `
        SELECT DISTINCT d.*
        FROM documentos d
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
  AND(ed.rol = 'cliente' OR ed.rol = 'receptor')
          AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
    `;

  const params: any[] = [fiscalIdHash, fiscalId];

  // ✅ Agregar filtro de empresas si se especifica
  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    query += ` AND d.id_de_empresa IN(${placeholders})`;
    params.push(...empresaIds);
  }

  query += ' ORDER BY d.fecha_emision DESC';

  console.log('📝 [getDocumentsByClientName] Query:', query);
  console.log('📝 [getDocumentsByClientName] Params:', params);

  const [documentRows] = await db.query<DocumentPacket[]>(query, params);

  console.log('📊 [getDocumentsByClientName] Documentos encontrados:', documentRows.length);

  return mapDocumentPacketsToDocuments(documentRows);
}

export async function getProductsByClientName(
  fiscalId: string,
  empresaIds?: number[]
): Promise<DocumentLine[]> {
  const fiscalIdHash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');
  console.log('🔍 [getProductsByClientName] Iniciando:', { fiscalId, empresaIds });

  // 🛠️ Subquery para limpiar duplicados del JOIN antes de aplicar Window Functions
  let baseQuery = `
        WITH FilteredLines AS(
    SELECT DISTINCT
                ld.id as line_id,
    ld.documento_id,
    ld.codigo,
    ld.descripcion,
    ld.cantidad,
    ld.unidad,
    ld.precio_unitario,
    ld.descuento_porcentaje,
    ld.precio_neto,
    ld.importe_linea,
    ld.datos_extra,
    ld.cuenta_contable,
    d.id_de_empresa,
    d.fecha_emision
            FROM lineas_documento ld
            JOIN documentos d ON ld.documento_id = d.id
            JOIN entidades_documento ed ON d.id = ed.documento_id
            WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
    AND(ed.rol = 'cliente' OR ed.rol = 'receptor')
              AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
              AND(
      (ld.codigo IS NOT NULL AND ld.codigo != '') 
                OR
      (ld.descripcion IS NOT NULL AND ld.descripcion != '')
  )
    `;

  const params: any[] = [fiscalIdHash, fiscalId];

  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    baseQuery += ` AND d.id_de_empresa IN(${placeholders})`;
    params.push(...empresaIds);
  }

  baseQuery += `
        ),
        RankedLines AS(
    SELECT
    *,
    -- ✅ Ahora el COUNT funciona bien porque FilteredLines ya no tiene duplicados de JOIN
                COUNT(*) OVER(
      PARTITION BY(CASE 
                        WHEN codigo IS NOT NULL AND codigo != '' THEN codigo 
                        ELSE descripcion 
                    END)
    ) as veces_comprado,
    SUM(cantidad) OVER(
      PARTITION BY(CASE 
                        WHEN codigo IS NOT NULL AND codigo != '' THEN codigo 
                        ELSE descripcion 
                    END)
    ) as total_cantidad_comprada,
    ROW_NUMBER() OVER(
      PARTITION BY(CASE 
                        WHEN codigo IS NOT NULL AND codigo != '' THEN codigo 
                        ELSE descripcion 
                    END) 
                    ORDER BY fecha_emision DESC
    ) as rn
            FROM FilteredLines
  )
SELECT * FROM RankedLines WHERE rn = 1
        ORDER BY descripcion ASC
  `;

  const [lineaRows] = await db.query<any[]>(baseQuery, params);

  const products: DocumentLine[] = lineaRows.map(l => ({
    id: l.line_id,
    documento_id: l.documento_id,
    id_de_empresa: l.id_de_empresa || l.empresa_id,
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    unidad: l.unidad,
    precio_unitario: l.precio_unitario,
    descuento_porcentaje: l.descuento_porcentaje,
    precio_neto: l.precio_neto,
    importe_linea: l.importe_linea,
    datos_extra: safeJsonParse(l.datos_extra),
    fecha_emision: l.fecha_emision,
    cuenta_contable: l.cuenta_contable,
    total_cantidad_comprada: l.total_cantidad_comprada,
    veces_comprado: l.veces_comprado,
  }));

  return serializeData(products);
}

export async function getAllProductLinesByClientName(
  fiscalId: string,
  empresaIds?: number[]
): Promise<DocumentLine[]> {
  const fiscalIdHash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');
  console.log('🔍 [getAllProductLinesByClientName] Iniciando:', { fiscalId, empresaIds });

  let baseQuery = `
SELECT
ld.*,
  d.id_de_empresa,
  d.fecha_emision,
  d.numero_documento
      FROM lineas_documento ld
      JOIN documentos d ON ld.documento_id = d.id
      JOIN entidades_documento ed ON d.id = ed.documento_id
      WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
  AND(ed.rol = 'cliente' OR ed.rol = 'receptor')
        AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
AND(
  (ld.codigo IS NOT NULL AND ld.codigo != '')
OR
  (ld.descripcion IS NOT NULL AND ld.descripcion != '')
        )
`;

  const params: any[] = [fiscalIdHash, fiscalId];

  // ✅ Agregar filtro de empresas si se especifica
  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    baseQuery += ` AND d.id_de_empresa IN(${placeholders})`;
    params.push(...empresaIds);
  }

  baseQuery += ` ORDER BY d.fecha_emision DESC`;

  console.log('📝 [getAllProductLinesByClientName] Query:', baseQuery);

  const [lineaRows] = await db.query<LineaPacket[]>(baseQuery, params);

  console.log('📊 [getAllProductLinesByClientName] Productos encontrados:', lineaRows.length);

  const products: DocumentLine[] = lineaRows.map(l => ({
    id: l.id,
    documento_id: l.documento_id,
    id_de_empresa: l.id_de_empresa,
    codigo: l.codigo,
    descripcion: l.descripcion,
    cantidad: l.cantidad,
    unidad: l.unidad,
    precio_unitario: l.precio_unitario,
    descuento_porcentaje: l.descuento_porcentaje,
    precio_neto: l.precio_neto,
    importe_linea: l.importe_linea,
    datos_extra: safeJsonParse(l.datos_extra),
    fecha_creacion: l.fecha_creacion,
    fecha_emision: l.fecha_emision,
    numero_documento: l.numero_documento,
    cuenta_contable: l.cuenta_contable,
  }));

  return serializeData(products);
}

export async function getClientAnalytics(
  fiscalId: string,
  empresaIds?: number[]
): Promise<ProviderAnalyticsData | null> {
  const fiscalIdHash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');
  const provider = await getClientByFiscalId(fiscalId);
  if (!provider) {
    return null;
  }

  // ✅ Construir filtro de empresa
  let whereEmpresa = '';
  let params: any[] = [fiscalIdHash, fiscalId];

  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    whereEmpresa = `AND d.id_de_empresa IN(${placeholders})`;
    params.push(...empresaIds);
  }

  // ✅ Filtro de tipo de documento (FACTURAS Y ABONOS)
  const whereDocType = `AND(
  (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
OR(LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )
    AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)`;

  // ✅ CAMBIO CRÍTICO: Usar DISTINCT para evitar duplicados
  const [docs] = await db.query<DocumentPacket[]>(`
        SELECT DISTINCT d.*
  FROM documentos d
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
  AND(ed.rol = 'cliente' OR ed.rol = 'receptor')
          ${whereDocType}
          ${whereEmpresa}
`, params);

  console.log(`📊[getClientAnalytics] Documentos encontrados para ${fiscalId}: `, docs.length);
  console.log(`🏢[getClientAnalytics] Empresas filtradas: `, empresaIds);

  // ✅ FIX: Aplicar el mismo filtro de empresaIds a la query de líneas
  let lineQuery = `
    SELECT ld.importe_linea
    FROM lineas_documento ld
    JOIN documentos d ON ld.documento_id = d.id
    JOIN entidades_documento ed ON d.id = ed.documento_id
    WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
  AND(ed.rol = 'cliente' OR ed.rol = 'receptor')
      AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
AND(
  (ld.codigo IS NOT NULL AND ld.codigo != '')
OR
  (ld.descripcion IS NOT NULL AND ld.descripcion != '')
      )
`;
  let lineParams: any[] = [fiscalIdHash, fiscalId];

  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    lineQuery += ` AND d.id_de_empresa IN(${placeholders})`;
    lineParams.push(...empresaIds);
  }

  const [lineRows] = await db.query<LineaPacket[]>(lineQuery, lineParams);

  let totalProductsSpent = lineRows.reduce((acc, l) => acc + Number(l.importe_linea || 0), 0);

  const totalSpent = docs.reduce((acc, doc) => acc + Number(doc.importe_total || 0), 0);
  const totalDocuments = docs.length;
  const averagePurchaseValue = totalDocuments > 0 ? totalSpent / totalDocuments : 0;

  // ✅ Top Products (filtro de Facturas/Abonos para consistencia financiera)
  const docIds = docs.map(d => d.id);
  const [lines] = docIds.length > 0 ? await db.query<LineaPacket[]>(`SELECT * FROM lineas_documento WHERE documento_id IN(?)`, [docIds]) : [[]];

  const productSpend: { [key: string]: { codigo: string; descripcion: string; total: number } } = {};
  lines.forEach(line => {
    const amt = Number(line.importe_linea || 0);
    // Identificador único (Código o descripción normalizada)
    const key = (line.codigo && line.codigo !== '') ? line.codigo : normalizeProductDescription(line.descripcion || '');

    if (key) {
      if (!productSpend[key]) {
        productSpend[key] = {
          codigo: line.codigo || '',
          descripcion: line.descripcion || '',
          total: 0
        };
      }
      productSpend[key].total += amt;
    }
  });

  const topProductsBySpend = Object.values(productSpend)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const monthlySpendMap: { [key: string]: number } = {};
  docs.forEach(doc => {
    if (doc.fecha_emision) {
      const month = new Date(doc.fecha_emision).toISOString().substring(0, 7);
      monthlySpendMap[month] = (monthlySpendMap[month] || 0) + Number(doc.importe_total || 0);
    }
  });

  let monthlySpend: { month: string, total: number }[] = [];
  const monthKeys = Object.keys(monthlySpendMap).sort();

  if (monthKeys.length > 0) {
    const minMonthStr = monthKeys[0];
    const now = new Date();
    const currentMonthStr = now.toISOString().substring(0, 7);
    const maxMonthStr = monthKeys[monthKeys.length - 1] > currentMonthStr
      ? monthKeys[monthKeys.length - 1]
      : currentMonthStr;

    let currentDate = new Date(`${minMonthStr}-01T12:00:00Z`);
    const endDate = new Date(`${maxMonthStr}-01T12:00:00Z`);

    while (currentDate <= endDate) {
      const mStr = currentDate.toISOString().substring(0, 7);
      monthlySpend.push({
        month: mStr,
        total: monthlySpendMap[mStr] || 0
      });
      currentDate.setUTCMonth(currentDate.getUTCMonth() + 1);
    }
  }

  console.log(`💰[getClientAnalytics] Total gastado: ${totalSpent.toFixed(2)} EUR`);
  console.log(`💰[getClientAnalytics] Total productos: ${totalProductsSpent.toFixed(2)} EUR`);
  console.log(`📈[getClientAnalytics] Meses con compras: ${monthlySpend.length} `);

  const analyticsData = {
    provider,
    totalSpent,
    totalProductsSpent,
    totalDocuments,
    uniqueProducts: Object.keys(productSpend).length,
    averagePurchaseValue,
    topProductsBySpend,
    monthlySpend
  };

  return serializeData(analyticsData);
}

export async function getClientProductHistory(
  fiscalId: string,
  identifier: string,
  searchBy: 'code' | 'description' = 'code',
  descriptionFilter?: string
): Promise<{ productInfo: DocumentLine | null, history: DocumentLine[] }> {
  const fiscalIdHash = require('crypto').createHash('sha256').update(fiscalId.toLowerCase().trim()).digest('hex');
  let query = `
    WITH UniqueHistory AS(
  SELECT 
            ld.id,
  ld.documento_id,
  ld.codigo,
  ld.descripcion,
  ld.cantidad,
  ld.unidad,
  ld.precio_unitario,
  ld.descuento_porcentaje,
  ld.precio_neto,
  ld.importe_linea,
  ld.cuenta_contable,
  d.fecha_emision,
  d.numero_documento,
  ROW_NUMBER() OVER(
    PARTITION BY ld.id 
                ORDER BY d.fecha_emision DESC
  ) as rn
        FROM lineas_documento ld
        JOIN documentos d ON ld.documento_id = d.id
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE (ed.identificador_fiscal_hash = ? OR ed.identificador_fiscal = ?)
  AND(ed.rol = 'cliente' OR ed.rol = 'receptor')
          AND d.id NOT IN(SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    AND d.id NOT IN (SELECT documento_id FROM health_check_status WHERE verified = 0)
          AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%'
`;

  if (searchBy === 'code') {
    query += '          AND ld.codigo = ?\n';
  } else {
    query += '          AND ld.descripcion LIKE ?\n';
  }

  query += `
)
SELECT * FROM UniqueHistory 
    WHERE rn = 1 
    ORDER BY fecha_emision DESC;
`;

  const queryParams: any[] = [fiscalIdHash, fiscalId];
  if (searchBy === 'code') {
    queryParams.push(identifier);
  } else {
    const searchPattern = identifier.split(/\s+/).filter(Boolean).join('%');
    queryParams.push(`%${searchPattern}%`);
  }

  const [lineaRows] = await db.query<any[]>(query, queryParams);

  if (lineaRows.length === 0) {
    return { productInfo: null, history: [] };
  }

  const history: DocumentLine[] = lineaRows
    .filter(l => {
      const filterToUse = descriptionFilter || (searchBy === 'description' ? identifier : null);
      if (!filterToUse) return true;
      return normalizeProductDescription(l.descripcion) === filterToUse;
    })
    .map(l => ({
      id: l.id,
      documento_id: l.documento_id,
      codigo: l.codigo,
      descripcion: l.descripcion,
      cantidad: l.cantidad,
      unidad: l.unidad,
      precio_unitario: l.precio_unitario,
      descuento_porcentaje: l.descuento_porcentaje || 0,
      precio_neto: l.precio_neto || l.precio_unitario,
      importe_linea: l.importe_linea,
      fecha_emision: l.fecha_emision,
      numero_documento: l.numero_documento,
      cuenta_contable: l.cuenta_contable,
      datos_extra: {},
      fecha_creacion: null,
    }));

  const productInfo = history[0] || null;

  return serializeData({ productInfo, history });
}

// ─────────────────────────────────────────────────────────────────
// DOCS PLAYGROUND — funciones de filtro con documentos confirmados
// No tocan las funciones existentes (getUniqueProvidersNames / getUniqueClients)
// ─────────────────────────────────────────────────────────────────

export async function getDocsProviderNames(empresaIds?: number[]): Promise<string[]> {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    // ✅ Obtener empresas permitidas para el usuario
    const allowedCompanies = await getCompanies();
    const allowedIds = allowedCompanies.map(c => c.id);
    const targetIds = empresaIds && empresaIds.length > 0
      ? empresaIds.filter(id => allowedIds.includes(id))
      : allowedIds;

    if (targetIds.length === 0) return [];

    // ✅ Prisma: desencripta automáticamente. Filtramos docs confirmados en la relación.
    const entidades = await prisma.entidades_documento.findMany({
      where: {
        rol: { in: ['proveedor', 'emisor'] },
        documentos: {
          id_de_empresa: { in: targetIds.map(id => BigInt(id)) },
          tipo_documento: {
            // Solo facturas/abonos confirmados
            contains: 'factura'
          }
        }
      },
      select: { nombre: true }
    });

    // Filtrado en memoria: excluir nulos/vacíos, dedup, ordenar
    const unique = Array.from(
      new Set(entidades.map(e => e.nombre).filter((n): n is string => typeof n === 'string' && n.trim() !== ''))
    ).sort((a, b) => a.localeCompare(b, 'es'));

    console.log('✅ [getDocsProviderNames] Proveedores únicos (Prisma):', unique.length);
    return unique;
  } catch (error) {
    console.error('❌ [getDocsProviderNames] Error:', error);
    return [];
  }
}

export async function getDocsClientNames(empresaIds?: number[]): Promise<string[]> {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    // ✅ Obtener empresas permitidas para el usuario
    const allowedCompanies = await getCompanies();
    const allowedIds = allowedCompanies.map(c => c.id);
    const targetIds = empresaIds && empresaIds.length > 0
      ? empresaIds.filter(id => allowedIds.includes(id))
      : allowedIds;

    if (targetIds.length === 0) return [];

    // ✅ Prisma: desencripta automáticamente
    const entidades = await prisma.entidades_documento.findMany({
      where: {
        rol: { in: ['receptor', 'cliente'] },
        documentos: {
          id_de_empresa: { in: targetIds.map(id => BigInt(id)) }
        }
      },
      select: { nombre: true }
    });

    // Filtrado en memoria: excluir nulos/vacíos, dedup, ordenar
    const unique = Array.from(
      new Set(entidades.map(e => e.nombre).filter((n): n is string => typeof n === 'string' && n.trim() !== ''))
    ).sort((a, b) => a.localeCompare(b, 'es'));

    console.log('✅ [getDocsClientNames] Clientes únicos (Prisma):', unique.length);
    return unique;
  } catch (error) {
    console.error('❌ [getDocsClientNames] Error:', error);
    return [];
  }
}



export async function getWebhookDocumentPayload(documentId: number): Promise<any> {
  const [docRows] = await db.query<RowDataPacket[]>(
    `SELECT 
      d.id, d.file_hash, d.tipo_documento, d.numero_documento, d.fecha_emision, 
      d.fecha_vencimiento, d.importe_total, d.importe_sin_impuestos, d.moneda, 
      d.observaciones, d.fecha_creacion, d.id_de_empresa
     FROM documentos d
     WHERE d.id = ? LIMIT 1`,
    [documentId]
  );

  if (docRows.length === 0) return null;
  const doc = docRows[0];

  // ✅ Hidratar empresa con Prisma (desencripta automáticamente)
  const empresaRecord = doc.id_de_empresa ? await prisma.empresas.findUnique({
    where: { id: BigInt(doc.id_de_empresa) },
    select: { nombre_de_empresa: true, CIF: true }
  }) : null;

  doc.nombre_de_empresa = empresaRecord?.nombre_de_empresa || null;
  doc.empresa_cif = empresaRecord?.CIF || null;

  // ✅ Hidratar entidades con Prisma (desencripta automáticamente)
  const entidadesPrisma = await prisma.entidades_documento.findMany({
    where: { 
      documento_id: BigInt(documentId),
      rol: { in: ['emisor', 'cliente'] }
    },
    select: {
      rol: true,
      nombre: true,
      identificador_fiscal: true,
      direccion: true,
      telefono: true,
      email: true
    }
  });

  const entidades = entidadesPrisma.map(e => ({
    rol: e.rol,
    nombre: e.nombre,
    identificador_fiscal: e.identificador_fiscal,
    direccion: e.direccion,
    telefono: e.telefono,
    email: e.email
  }));

  const [impuestos] = await db.query<RowDataPacket[]>(
    `SELECT tipo_impuesto, porcentaje, base_imponible, cuota 
     FROM impuestos_documento WHERE documento_id = ?`,
    [documentId]
  );

  return {
    ...doc,
    entidades,
    iva_details: impuestos
  };
}

export async function getSnapshotBeforeUpdate(id: number, tx: any = prisma): Promise<any> {
  const doc = await tx.documentos.findUnique({
    where: { id: BigInt(id) },
    select: {
      numero_documento: true,
      tipo_documento: true,
      importe_total: true,
      importe_sin_impuestos: true,
      fecha_emision: true,
      fecha_vencimiento: true,
      moneda: true,
      observaciones: true,
      entidades_documento: {
        select: {
          rol: true,
          nombre: true,
          identificador_fiscal: true,
        }
      },
      impuestos_documento: {
        select: {
          tipo_impuesto: true,
          base_imponible: true,
          cuota: true,
        }
      },
      lineas_documento: {
        select: {
          descripcion: true,
          cantidad: true,
          precio_unitario: true,
          importe_linea: true,
        }
      }
    }
  });

  if (!doc) return null;

  return {
    numero_documento: doc.numero_documento,
    tipo_documento: doc.tipo_documento,
    importe_total: doc.importe_total !== null ? Number(doc.importe_total) : null,
    importe_sin_impuestos: doc.importe_sin_impuestos !== null ? Number(doc.importe_sin_impuestos) : null,
    fecha_emision: doc.fecha_emision,
    fecha_vencimiento: doc.fecha_vencimiento,
    moneda: doc.moneda,
    observaciones: doc.observaciones,
    entidades: doc.entidades_documento,
    iva_details: doc.impuestos_documento.map((i: any) => ({
      ...i,
      base_imponible: i.base_imponible !== null ? Number(i.base_imponible) : null,
      cuota: i.cuota !== null ? Number(i.cuota) : null,
    })),
    lineas: doc.lineas_documento.map((l: any) => ({
      ...l,
      cantidad: l.cantidad !== null ? Number(l.cantidad) : null,
      precio_unitario: l.precio_unitario !== null ? Number(l.precio_unitario) : null,
      importe_linea: l.importe_linea !== null ? Number(l.importe_linea) : null,
    }))
  };
}

function compareDocumentStates(oldSnapshot: any, newData: any): string[] {
  const mod: string[] = [];
  if (!oldSnapshot || !newData) return Object.keys(newData || {});

  if (oldSnapshot.numero_documento !== newData.numero_documento) mod.push('numero_documento');
  if (oldSnapshot.tipo_documento !== newData.tipo_documento) mod.push('tipo_documento');
  if (Number(oldSnapshot.importe_total) !== Number(newData.total)) mod.push('total', 'importe_total');
  if (Number(oldSnapshot.importe_sin_impuestos) !== Number(newData.base_imponible)) mod.push('base_imponible', 'importe_sin_impuestos');
  if (oldSnapshot.moneda !== newData.moneda) mod.push('moneda');
  if ((oldSnapshot.observaciones || '') !== (newData.observaciones || '')) mod.push('observaciones');

  const pDate = (d: any) => d ? new Date(d).toISOString().split('T')[0] : null;
  if (pDate(oldSnapshot.fecha_emision) !== pDate(newData.fecha_emision)) mod.push('fecha_emision');
  if (pDate(oldSnapshot.fecha_vencimiento) !== pDate(newData.fecha_vencimiento)) mod.push('fecha_vencimiento');

  const oldEnt = (oldSnapshot.entidades || []).map((e: any) => `${e.rol}-${e.nombre}-${e.identificador_fiscal}`).sort().join('|');
  const newEnt = (newData.entidades || []).map((e: any) => `${e.rol}-${e.nombre}-${e.identificador_fiscal}`).sort().join('|');
  if (oldEnt !== newEnt) mod.push('entidades');

  const oldIva = (oldSnapshot.iva_details || []).map((i: any) => `${i.tipo_impuesto}-${Number(i.base_imponible)}-${Number(i.cuota)}`).sort().join('|');
  const newIva = (newData.iva_details || []).map((i: any) => `${i.tipo_impuesto}-${Number(i.base_imponible)}-${Number(i.cuota)}`).sort().join('|');
  if (oldIva !== newIva) mod.push('iva_details');

  const oldLin = (oldSnapshot.lineas || []).map((l: any) => `${l.descripcion}-${Number(l.cantidad)}-${Number(l.importe_linea)}`).sort().join('|');
  const newLin = (newData.lineas || []).map((l: any) => `${l.descripcion}-${Number(l.cantidad)}-${Number(l.importe_linea)}`).sort().join('|');
  if (oldLin !== newLin) mod.push('lineas');

  return mod;
}
