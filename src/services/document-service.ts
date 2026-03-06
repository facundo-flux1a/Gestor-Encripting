'use server';

import db from '@/lib/db';
import type { Document, IvaDetail, DocumentUpdatePayload, DocumentEntity, DocumentLine, DocumentFile, ProviderWithStats, Incident, Company, CreateDocumentPayload, DashboardAnalytics } from '@/lib/types';
import type { RowDataPacket, OkPacket } from 'mysql2';
import type { ProviderAnalyticsData } from '@/components/dashboard/provider-analytics';
import type { IncidentsAnalyticsData } from '@/components/incidents/incidents-analytics';
import type { IncidentAnalysisResult } from '@/lib/types';
import { redirect } from 'next/navigation';
import { getCurrentUser } from './user-service';
import { revalidatePath } from 'next/cache';

import type { Trimestre, TrimestreFilters, CerrarTrimestrePayload } from '@/lib/types';
import { validateIncidentsAsync } from './incidents-service';



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
  empresa_nombre?: string | null;  // ⬅️ AGREGAR
  empresa_cif?: string | null;
  is_new: number; // ⬅️ AGREGAR ESTA LÍNEA
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

  const [fileRows] = await db.query<ArchivoPacket[]>('SELECT * FROM archivos_documento WHERE documento_id IN (?)', [docIds]);
  const [entidadRows] = await db.query<EntidadPacket[]>("SELECT * FROM entidades_documento WHERE documento_id IN (?)", [docIds]);
  const [lineaRows] = await db.query<LineaPacket[]>('SELECT * FROM lineas_documento WHERE documento_id IN (?)', [docIds]);
  const [impuestoRows] = await db.query<ImpuestoPacket[]>('SELECT * FROM impuestos_documento WHERE documento_id IN (?)', [docIds]);
  const [incidenciaRows] = await db.query<IncidenciaPacket[]>('SELECT * FROM incidencias_documento WHERE documento_id IN (?)', [docIds]);

  const documents = documentRows.map(doc => {
    const currentFiles = fileRows.filter(f => f.documento_id === doc.id);
    const currentEntidades = entidadRows.filter(e => e.documento_id === doc.id);
    const currentLineas = lineaRows.filter(l => l.documento_id === doc.id);
    const currentImpuestos = impuestoRows.filter(i => i.documento_id === doc.id);
    const currentIncidencias = incidenciaRows.filter(i => i.documento_id === doc.id);

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
    const cifFromDatosExtra = datosExtra?.CLIENTE?.CIF ||
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
      año_trimestre: doc.año_trimestre || null,      // ✅ AGREGAR
      num_trimestre: doc.num_trimestre || null,
      is_issued: doc.is_issued !== undefined ? Number(doc.is_issued) : undefined,  // ✅ clasificación backend
    };
  });

  return JSON.parse(JSON.stringify(documents));
}

/**
 * Obtiene todas las empresas del usuario actual
 */
export async function getCompanies(): Promise<Company[]> {
  try {
    console.log('🔍 [getCompanies] Iniciando...');

    const user = await getCurrentUser();

    console.log('👤 [getCompanies] Usuario obtenido:', user);

    if (!user) {
      console.warn('⚠️ [getCompanies] No hay usuario autenticado');
      return [];
    }

    console.log('🔍 [getCompanies] Buscando empresas para usuario ID:', user.id);

    const query = 'SELECT id, nombre_de_empresa as name, nombre_fiscal, CIF, mail_de_carga, recargo, id_de_usuario FROM empresas WHERE id_de_usuario = ? ORDER BY nombre_de_empresa ASC';

    console.log('📝 [getCompanies] Query:', query);
    console.log('📝 [getCompanies] Params:', [user.id]);

    const [rows] = await db.query<any[]>(query, [user.id]);

    console.log('📊 [getCompanies] Filas obtenidas:', rows.length);
    console.log('📋 [getCompanies] Datos RAW:', rows);

    if (!rows || rows.length === 0) {
      return [];
    }

    const companies = rows.map(row => ({
      id: row.id,
      name: row.name,
      nombreFiscal: row.nombre_fiscal,
      cif: row.CIF,
      mail_de_carga: row.mail_de_carga,
      recargo: !!row.recargo,
    }));

    console.log('✅ [getCompanies] Empresas mapeadas:', companies);

    return companies as Company[];
  } catch (error) {
    console.error("❌ [getCompanies] Error:", error);
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

    // Verificar si ya existe una empresa con el mismo CIF para este usuario
    const [existingCompanies] = await db.query<RowDataPacket[]>(
      'SELECT id FROM empresas WHERE CIF = ? AND id_de_usuario = ?',
      [data.cif.trim(), user.id]
    );

    if (existingCompanies.length > 0) {
      throw new Error('Ya existe una empresa con este CIF');
    }

    // Si se proporciona email, verificar que sea único globalmente
    if (data.mailDeCarga?.trim()) {
      const [existingEmail] = await db.query<RowDataPacket[]>(
        'SELECT id FROM empresas WHERE mail_de_carga = ?',
        [data.mailDeCarga.trim()]
      );

      if (existingEmail.length > 0) {
        throw new Error('Ya existe una empresa con ese mail de carga');
      }
    }

    // Insertar la nueva empresa CON mail_de_carga y recargo
    const [result] = await db.query<OkPacket>(
      'INSERT INTO empresas (nombre_de_empresa, nombre_fiscal, CIF, mail_de_carga, recargo, id_de_usuario) VALUES (?, ?, ?, ?, ?, ?)',
      [
        data.name.trim(),
        data.nombreFiscal?.trim() || null,
        data.cif.trim(),
        data.mailDeCarga?.trim() || null,
        data.recargo ? 1 : 0,
        user.id
      ]
    );

    console.log('✅ [createCompany] Empresa creada con ID:', result.insertId);

    const newCompany: Company = {
      id: result.insertId,
      name: data.name.trim(),
      nombreFiscal: data.nombreFiscal?.trim() || null,
      cif: data.cif.trim(),
      recargo: !!data.recargo
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
  console.log('🎯 [document-service] getDocuments llamado con:', { empresaIds, excludeIncidents });

  try {
    const user = await getCurrentUser();
    if (!user) {
      console.warn('⚠️ [document-service] No hay usuario autenticado');
      return [];
    }

    let query = `
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
                d.trimestre_cerrado,  -- ⬅️ AGREGADO
                d.año_trimestre,        
                d.num_trimestre,  
                e.nombre_de_empresa as empresa_nombre,
                e.cif as empresa_cif,
                -- ✅ is_issued: 1=emitida(ingreso), 0=recibida(gasto).
                -- Compara el CIF del emisor contra el CIF de la empresa propietaria del doc (igual que Trimestres).
                (
                  SELECT MAX(CASE
                    WHEN ed2.rol IN ('emisor', 'proveedor')
                      AND ed2.identificador_fiscal = e.cif
                    THEN 1
                    ELSE 0
                  END)
                  FROM entidades_documento ed2
                  WHERE ed2.documento_id = d.id
                ) as is_issued
            FROM documentos d
            LEFT JOIN empresas e ON d.id_de_empresa = e.id
            WHERE e.id_de_usuario = ?
        `;

    const params: any[] = [user.id];

    if (empresaIds && empresaIds.length > 0) {
      query += ' AND d.id_de_empresa IN (?)';
      params.push(empresaIds);
    }

    // ✅ NUEVO: Filtro para excluir documentos con incidencias pendientes
    if (excludeIncidents) {
      query += ` AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)`;
    }

    query += ' ORDER BY d.fecha_emision DESC';

    console.log('📝 [document-service] Query:', query);
    console.log('📝 [document-service] Params:', params);

    const [documentRows] = await db.query<DocumentPacket[]>(query, params);

    console.log('📊 [document-service] Filas obtenidas de BD:', documentRows.length);

    // ⬅️ DEBUG: Ver trimestre_cerrado en los datos RAW
    if (documentRows.length > 0) {
      console.log('🔍 [document-service] Primer documento RAW:', {
        id: documentRows[0].id,
        is_new: documentRows[0].is_new,
        trimestre_cerrado: documentRows[0].trimestre_cerrado,  // ⬅️ AGREGADO
        numero: documentRows[0].numero_documento
      });
    }

    const result = await mapDocumentPacketsToDocuments(documentRows);

    console.log('✅ [document-service] Documentos mapeados:', result.length);

    return result;
  } catch (error) {
    console.error("❌ [document-service] Error al obtener documentos:", error);
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
                d.trimestre_cerrado,  -- ⬅️ AGREGADO
                d.año_trimestre,        -- ✅ AGREGAR
                d.num_trimestre,  
                e.nombre_de_empresa as empresa_nombre,
                e.cif as empresa_cif
            FROM documentos d
            LEFT JOIN empresas e ON d.id_de_empresa = e.id
            WHERE d.id = ? AND e.id_de_usuario = ?
        `;

    console.log('📝 [document-service] getDocumentById Query:', { id, userId: user.id });

    const [documentRows] = await db.query<DocumentPacket[]>(query, [id, user.id]);

    if (documentRows.length === 0) {
      console.log('⚠️ [document-service] Documento no encontrado:', id);
      return null;
    }

    console.log('✅ [document-service] Documento encontrado:', {
      id: documentRows[0].id,
      trimestre_cerrado: documentRows[0].trimestre_cerrado  // ⬅️ DEBUG
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
            SELECT DISTINCT d.*,
                e.nombre_de_empresa as empresa_nombre,
                e.cif as empresa_cif
            FROM documentos d
            JOIN incidencias_documento i ON d.id = i.documento_id
            LEFT JOIN empresas e ON d.id_de_empresa = e.id
            WHERE i.validado = 0 
              AND e.id_de_usuario = ?
              AND d.id_de_empresa IS NOT NULL
              AND d.id_de_empresa IN (?)
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


export async function updateDocument(id: number, data: DocumentUpdatePayload): Promise<{ success: boolean }> {
  const connection = await db.getConnection();

  try {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🚀 [updateDocument] INICIO - ID:', id);
    console.log('═══════════════════════════════════════════════════════════');

    await connection.beginTransaction();
    console.log('✅ [updateDocument] Transacción iniciada');

    // ═══════════════════════════════════════════════════════════
    // PASO 1: Verificar documento y trimestre cerrado
    // ═══════════════════════════════════════════════════════════
    const [docRows] = await connection.query<RowDataPacket[]>(
      'SELECT tipo_documento, trimestre_cerrado, año_trimestre, num_trimestre, id_de_empresa FROM documentos WHERE id = ?',
      [id]
    );

    if (docRows.length === 0) {
      throw new Error('Documento no encontrado');
    }

    if (docRows[0].trimestre_cerrado) {
      throw new Error('No se puede modificar un documento de un trimestre cerrado');
    }

    const empresaId = docRows[0].id_de_empresa;
    console.log('📋 [updateDocument] Empresa ID:', empresaId);

    // ═══════════════════════════════════════════════════════════
    // PASO 2: Validar y crear trimestre si es necesario
    // ═══════════════════════════════════════════════════════════
    if (data.año_trimestre !== undefined && data.num_trimestre !== undefined) {
      console.log('🔄 [updateDocument] Validando cambio de trimestre...');
      console.log(`   Nuevo trimestre: ${data.año_trimestre}-T${data.num_trimestre}`);

      // ✅ Verificar si el trimestre de destino existe
      const [trimestreExistente] = await connection.query<RowDataPacket[]>(
        `SELECT DISTINCT 
                   año_trimestre, 
                   num_trimestre,
                   MAX(trimestre_cerrado) as cerrado
                 FROM documentos 
                 WHERE id_de_empresa = ? 
                   AND año_trimestre = ? 
                   AND num_trimestre = ?
                 GROUP BY año_trimestre, num_trimestre`,
        [empresaId, data.año_trimestre, data.num_trimestre]
      );

      if (trimestreExistente.length > 0) {
        // ✅ Trimestre existe - verificar que no esté cerrado
        if (trimestreExistente[0].cerrado) {
          throw new Error('No se puede mover el documento a un trimestre cerrado');
        }
        console.log('✅ [updateDocument] Trimestre destino existe y está abierto');
      } else {
        // ✅ Trimestre NO existe - verificar que no exista en tabla trimestres cerrado
        const [trimestreTabla] = await connection.query<RowDataPacket[]>(
          `SELECT cerrado FROM trimestres 
                     WHERE id_de_empresa = ? 
                       AND año = ? 
                       AND num_trimestre = ?`,
          [empresaId, data.año_trimestre, data.num_trimestre]
        );

        if (trimestreTabla.length > 0 && trimestreTabla[0].cerrado) {
          throw new Error('No se puede crear/mover a un trimestre cerrado');
        }

        // ✅ Crear entrada en tabla trimestres (abierto por defecto)
        console.log('🆕 [updateDocument] Creando nuevo trimestre en tabla trimestres...');
        await connection.query(
          `INSERT INTO trimestres 
                     (año, num_trimestre, id_de_empresa, cerrado, total_documentos, total_ingresos, total_gastos, iva_repercutido, iva_soportado, fecha_creacion, fecha_actualizacion) 
                     VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0, NOW(), NOW())
                     ON DUPLICATE KEY UPDATE fecha_actualizacion = NOW()`,
          [data.año_trimestre, data.num_trimestre, empresaId]
        );
        console.log('✅ [updateDocument] Trimestre creado en tabla trimestres');
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PASO 2.5: Conversión de signos por cambio de tipo
    //══════════════════════════════════════════════════════════
    if (data.tipo_documento) {
      const oldTipo = docRows[0].tipo_documento?.toLowerCase() || '';
      const newTipo = data.tipo_documento.toLowerCase();

      const wasAbono = oldTipo.includes('abono');
      const isAbono = newTipo.includes('abono');

      // Solo convertir si hay cambio entre Abono y Factura/Albarán
      if (wasAbono !== isAbono) {
        console.log('🔄 [updateDocument] Conversión de tipo detectada:');
        console.log(`   Tipo anterior: "${docRows[0].tipo_documento}"`);
        console.log(`   Tipo nuevo: "${data.tipo_documento}"`);

        // Obtener valores actuales del documento
        const [currentDoc] = await connection.query<RowDataPacket[]>(
          `SELECT importe_total, importe_sin_impuestos
           FROM documentos WHERE id = ?`,
          [id]
        );

        if (currentDoc.length > 0) {
          const current = currentDoc[0];

          if (isAbono) {
            // ✅ Convertir a ABONO (todos los valores a negativo)
            console.log('   🔽 Convirtiendo a ABONO (valores → negativos)');
            data.total = current.importe_total != null ? -Math.abs(current.importe_total) : current.importe_total;
            data.base_imponible = current.importe_sin_impuestos != null ? -Math.abs(current.importe_sin_impuestos) : current.importe_sin_impuestos;

            console.log(`   💰 Total: ${current.importe_total} → ${data.total}`);

            // Convertir líneas de documento DIRECTAMENTE EN LA BD
            const [existingLines] = await connection.query<RowDataPacket[]>(
              'SELECT id, precio_unitario, importe_linea FROM lineas_documento WHERE documento_id = ?',
              [id]
            );

            if (existingLines.length > 0) {
              console.log(`   📦 Convirtiendo ${existingLines.length} líneas en BD a negativo`);
              for (const line of existingLines) {
                await connection.query(
                  `UPDATE lineas_documento 
                   SET precio_unitario = ?, importe_linea = ?
                   WHERE id = ?`,
                  [
                    line.precio_unitario != null ? -Math.abs(line.precio_unitario) : line.precio_unitario,
                    line.importe_linea != null ? -Math.abs(line.importe_linea) : line.importe_linea,
                    line.id
                  ]
                );
              }
            }

            // También convertir líneas en payload si vienen
            if (data.lineas && data.lineas.length > 0) {
              console.log(`   📦 Convirtiendo ${data.lineas.length} líneas en payload a negativo`);
              data.lineas.forEach((linea: any) => {
                if (linea.precio_unitario != null) linea.precio_unitario = -Math.abs(linea.precio_unitario);
                if (linea.importe_sin_iva != null) linea.importe_sin_iva = -Math.abs(linea.importe_sin_iva);
                if (linea.iva_importe != null) linea.iva_importe = -Math.abs(linea.iva_importe);
                if (linea.importe_total != null) linea.importe_total = -Math.abs(linea.importe_total);
              });
            }
          } else {
            // ✅ Convertir a FACTURA/ALBARÁN (todos los valores a positivo)
            console.log('   🔼 Convirtiendo a FACTURA/ALBARÁN (valores → positivos)');
            data.total = current.importe_total != null ? Math.abs(current.importe_total) : current.importe_total;
            data.base_imponible = current.importe_sin_impuestos != null ? Math.abs(current.importe_sin_impuestos) : current.importe_sin_impuestos;

            console.log(`   💰 Total: ${current.importe_total} → ${data.total}`);

            // Convertir líneas de documento DIRECTAMENTE EN LA BD
            const [existingLinesPos] = await connection.query<RowDataPacket[]>(
              'SELECT id, precio_unitario, importe_linea FROM lineas_documento WHERE documento_id = ?',
              [id]
            );

            if (existingLinesPos.length > 0) {
              console.log(`   📦 Convirtiendo ${existingLinesPos.length} líneas en BD a positivo`);
              for (const line of existingLinesPos) {
                await connection.query(
                  `UPDATE lineas_documento 
                   SET precio_unitario = ?, importe_linea = ?
                   WHERE id = ?`,
                  [
                    line.precio_unitario != null ? Math.abs(line.precio_unitario) : line.precio_unitario,
                    line.importe_linea != null ? Math.abs(line.importe_linea) : line.importe_linea,
                    line.id
                  ]
                );
              }
            }

            // También convertir líneas en payload si vienen
            if (data.lineas && data.lineas.length > 0) {
              console.log(`   📦 Convirtiendo ${data.lineas.length} líneas en payload a positivo`);
              data.lineas.forEach((linea: any) => {
                if (linea.precio_unitario != null) linea.precio_unitario = Math.abs(linea.precio_unitario);
                if (linea.importe_sin_iva != null) linea.importe_sin_iva = Math.abs(linea.importe_sin_iva);
                if (linea.iva_importe != null) linea.iva_importe = Math.abs(linea.iva_importe);
                if (linea.importe_total != null) linea.importe_total = Math.abs(linea.importe_total);
              });
            }
          }

          // Convertir impuestos en tabla impuestos_documento
          const [existingTaxes] = await connection.query<RowDataPacket[]>(
            'SELECT id, base_imponible, cuota FROM impuestos_documento WHERE documento_id = ?',
            [id]
          );

          if (existingTaxes.length > 0) {
            console.log(`   💰 Convirtiendo ${existingTaxes.length} impuestos en BD a ${isAbono ? 'negativo' : 'positivo'}`);
            for (const tax of existingTaxes) {
              await connection.query(
                `UPDATE impuestos_documento 
                 SET base_imponible = ?, cuota = ?
                 WHERE id = ?`,
                [
                  isAbono
                    ? (tax.base_imponible != null ? -Math.abs(tax.base_imponible) : tax.base_imponible)
                    : (tax.base_imponible != null ? Math.abs(tax.base_imponible) : tax.base_imponible),
                  isAbono
                    ? (tax.cuota != null ? -Math.abs(tax.cuota) : tax.cuota)
                    : (tax.cuota != null ? Math.abs(tax.cuota) : tax.cuota),
                  tax.id
                ]
              );
            }
          }

          // CRÍTICO: Convertir payload iva_details para que persista
          if (data.iva_details && data.iva_details.length > 0) {
            console.log(`   💰 Convirtiendo ${data.iva_details.length} impuestos en payload a ${isAbono ? 'negativo' : 'positivo'}`);
            data.iva_details = data.iva_details.map((iva: any) => ({
              ...iva,
              base_imponible: iva.base_imponible != null
                ? (isAbono ? -Math.abs(iva.base_imponible) : Math.abs(iva.base_imponible))
                : iva.base_imponible,
              cuota: iva.cuota != null
                ? (isAbono ? -Math.abs(iva.cuota) : Math.abs(iva.cuota))
                : iva.cuota,
            }));
          }

          // Limpiar observaciones: eliminar mensajes obsoletos sobre abonos/conversiones
          if (data.observaciones) {
            let cleanedObs = data.observaciones;
            // Eliminar mensajes de conversión y tipo
            cleanedObs = cleanedObs.replace(/⚠️ DOCUMENTO ES ABONO \| /g, '');
            cleanedObs = cleanedObs.replace(/💰 Valores convertidos a negativos \(Abono\) \| /g, '');
            cleanedObs = cleanedObs.replace(/💰 Valores convertidos a positivos \(Factura\/Albarán\) \| /g, '');

            // Agregar nuevo mensaje según el nuevo tipo
            const newTypePrefix = isAbono
              ? '💰 Convertido a Abono | '
              : '💰 Convertido a Factura/Albarán | ';

            if (!cleanedObs.startsWith('💰 Convertido')) {
              cleanedObs = newTypePrefix + cleanedObs;
            }

            data.observaciones = cleanedObs;
          }

          console.log('✅ [updateDocument] Conversión de signos completada');
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // PASO 3: Actualizar documento principal
    // ═══════════════════════════════════════════════════════════
    console.log('📝 [updateDocument] Actualizando documento principal...');

    const updateFields = [];
    const updateValues = [];

    updateFields.push('tipo_documento = ?');
    updateValues.push(data.tipo_documento);

    updateFields.push('numero_documento = ?');
    updateValues.push(data.numero_documento);

    updateFields.push('fecha_emision = ?');
    updateValues.push(data.fecha_emision);

    updateFields.push('fecha_vencimiento = ?');
    updateValues.push(data.fecha_vencimiento);

    updateFields.push('observaciones = ?');
    updateValues.push(data.observaciones);

    updateFields.push('importe_sin_impuestos = ?');
    updateValues.push(data.base_imponible);

    updateFields.push('importe_total = ?');
    updateValues.push(data.total);

    updateFields.push('moneda = ?');
    updateValues.push(data.moneda || 'EUR');

    // ✅ Actualizar trimestre si se especificó
    if (data.año_trimestre !== undefined) {
      updateFields.push('año_trimestre = ?');
      updateValues.push(data.año_trimestre);
    }

    if (data.num_trimestre !== undefined) {
      updateFields.push('num_trimestre = ?');
      updateValues.push(data.num_trimestre);
    }

    updateValues.push(id);

    await connection.query(
      `UPDATE documentos SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );

    console.log('✅ [updateDocument] Documento principal actualizado');

    // ═══════════════════════════════════════════════════════════
    // PASO 3.5: Actualizar CIF en datos_extra si viene en el payload
    // ═══════════════════════════════════════════════════════════
    if ((data as any).cif !== undefined) {
      console.log('🔄 [updateDocument] Actualizando CIF en datos_extra...');

      const [docRows] = await connection.query<RowDataPacket[]>(
        'SELECT datos_extra FROM documentos WHERE id = ?',
        [id]
      );

      let datosExtra: any = {};
      try {
        datosExtra = typeof docRows[0].datos_extra === 'string'
          ? JSON.parse(docRows[0].datos_extra)
          : docRows[0].datos_extra || {};
      } catch (e) {
        console.warn('⚠️ datos_extra no es JSON válido, creando nuevo objeto');
        datosExtra = {};
      }

      // Actualizar CIF en todas las ubicaciones posibles
      if (datosExtra.CLIENTE) {
        datosExtra.CLIENTE.CIF = (data as any).cif;
      }
      if (datosExtra.METADATOS) {
        datosExtra.METADATOS.NIF_CIF_RELACIONADO = (data as any).cif;
      }
      if (datosExtra.EMPRESA_EMISORA) {
        datosExtra.EMPRESA_EMISORA.CIF = (data as any).cif;
      }

      // Si no existe ninguna estructura, crear CLIENTE
      if (!datosExtra.CLIENTE && !datosExtra.METADATOS && !datosExtra.EMPRESA_EMISORA) {
        datosExtra.CLIENTE = { CIF: (data as any).cif };
      }

      await connection.query(
        'UPDATE documentos SET datos_extra = ? WHERE id = ?',
        [JSON.stringify(datosExtra), id]
      );

      console.log('✅ [updateDocument] CIF actualizado en datos_extra');
    }

    // ═══════════════════════════════════════════════════════════
    // PASO 4: Actualizar entidades
    // ═══════════════════════════════════════════════════════════
    console.log('🔄 [updateDocument] Procesando entidades...');
    await connection.query('DELETE FROM entidades_documento WHERE documento_id = ?', [id]);

    for (const entidad of data.entidades || []) {
      await connection.query(
        'INSERT INTO entidades_documento (documento_id, nombre, identificador_fiscal, direccion, telefono, email, rol, datos_extra, id_de_empresa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          id,
          entidad.nombre,
          entidad.identificador_fiscal,
          entidad.direccion,
          entidad.telefono || '',
          entidad.email || '',
          entidad.rol,
          JSON.stringify(entidad.datos_extra || {}),
          empresaId || null
        ]
      );
    }
    console.log('✅ [updateDocument] Entidades actualizadas');

    // ═══════════════════════════════════════════════════════════
    // PASO 5: Actualizar líneas (estrategia PATCH)
    // ═══════════════════════════════════════════════════════════
    console.log('🔄 [updateDocument] Procesando líneas (PATCH)...');

    await connection.query('SET FOREIGN_KEY_CHECKS=0');

    const [lineasExistentes] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM lineas_documento WHERE documento_id = ? ORDER BY id',
      [id]
    );

    const lineasNuevas = data.lineas || [];
    const maxLineas = Math.max(lineasExistentes.length, lineasNuevas.length);

    for (let i = 0; i < maxLineas; i++) {
      const lineaExistente = lineasExistentes[i];
      const lineaNueva = lineasNuevas[i];

      if (lineaExistente && lineaNueva) {
        // UPDATE
        await connection.query(
          `UPDATE lineas_documento SET 
                        codigo = ?,
                        descripcion = ?,
                        cantidad = ?,
                        unidad = ?,
                        precio_unitario = ?,
                        descuento_porcentaje = ?,
                        precio_neto = ?,
                        importe_linea = ?,
                        datos_extra = ?,
                        id_de_empresa = ?
                    WHERE id = ?`,
          [
            lineaNueva.codigo || '',
            lineaNueva.descripcion,
            lineaNueva.cantidad,
            lineaNueva.unidad,
            lineaNueva.precio_unitario,
            lineaNueva.descuento_porcentaje,
            lineaNueva.precio_neto,
            lineaNueva.importe_linea,
            JSON.stringify(lineaNueva.datos_extra || {}),
            empresaId || null,
            lineaExistente.id
          ]
        );
      } else if (!lineaExistente && lineaNueva) {
        // INSERT
        await connection.query(
          'INSERT INTO lineas_documento (documento_id, codigo, descripcion, cantidad, unidad, precio_unitario, descuento_porcentaje, precio_neto, importe_linea, datos_extra, id_de_empresa) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            id,
            lineaNueva.codigo || '',
            lineaNueva.descripcion,
            lineaNueva.cantidad,
            lineaNueva.unidad,
            lineaNueva.precio_unitario,
            lineaNueva.descuento_porcentaje,
            lineaNueva.precio_neto,
            lineaNueva.importe_linea,
            JSON.stringify(lineaNueva.datos_extra || {}),
            empresaId || null
          ]
        );
      } else if (lineaExistente && !lineaNueva) {
        // DELETE (marcar)
        await connection.query(
          'UPDATE lineas_documento SET documento_id = -999999 WHERE id = ?',
          [lineaExistente.id]
        );
      }
    }

    // Limpiar líneas marcadas
    try {
      await connection.query('DELETE FROM lineas_documento WHERE documento_id = -999999');
    } catch (err) {
      // Ignorar si no hay líneas para limpiar
    }

    console.log('✅ [updateDocument] Líneas actualizadas');

    // ═══════════════════════════════════════════════════════════
    // PASO 6: Actualizar impuestos
    // ═══════════════════════════════════════════════════════════
    console.log('🔄 [updateDocument] Procesando impuestos...');
    await connection.query('DELETE FROM impuestos_documento WHERE documento_id = ?', [id]);

    for (const iva of data.iva_details || []) {
      const totalConImpuesto = (iva.base_imponible + iva.cuota);
      await connection.query(
        'INSERT INTO impuestos_documento (documento_id, tipo_impuesto, porcentaje, base_imponible, cuota, total_con_impuesto) VALUES (?, ?, ?, ?, ?, ?)',
        [id, iva.tipo_impuesto, iva.porcentaje, iva.base_imponible, iva.cuota, totalConImpuesto]
      );
    }
    console.log('✅ [updateDocument] Impuestos actualizados');

    await connection.query('SET FOREIGN_KEY_CHECKS=1');

    // ═══════════════════════════════════════════════════════════
    // PASO 7: Commit
    // ═══════════════════════════════════════════════════════════
    await connection.commit();
    console.log('🎉 [updateDocument] Transacción completada exitosamente');
    console.log('═══════════════════════════════════════════════════════════');

    // 🚀 FIRE AND FORGET: Validación asíncrona de incidencias
    validateIncidentsAsync(id).catch(err => {
      console.error('❌ [Background] Error en validación de incidencias:', err);
    });

    return { success: true };
  } catch (error: any) {
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ [updateDocument] ERROR CRÍTICO');
    console.error('═══════════════════════════════════════════════════════════');
    console.error('❌ Error:', error);
    console.error('❌ Error message:', error?.message);
    console.error('═══════════════════════════════════════════════════════════');

    await connection.rollback();
    console.log('🔄 [updateDocument] Rollback ejecutado');
    throw error;
  } finally {
    connection.release();
    console.log('🔌 [updateDocument] Conexión liberada');
    console.log('═══════════════════════════════════════════════════════════');
  }
}

// ✅ ARREGLADO: Tipado de connection como PoolConnection
async function recalculateDocumentTotals(docId: number, connection: any) {
  // Recalculate base_imponible from lines
  const [lineSumResult] = await connection.query(
    'SELECT SUM(importe_linea) as total_lines FROM lineas_documento WHERE documento_id = ?',
    [docId]
  ) as [RowDataPacket[], any];
  const baseImponible = Number(lineSumResult[0].total_lines) || 0;

  // Recalculate total_iva from taxes (excluding retentions)
  const [taxSumResult] = await connection.query(
    'SELECT SUM(cuota) as total_tax FROM impuestos_documento WHERE documento_id = ? AND (tipo_impuesto IS NULL OR tipo_impuesto NOT LIKE ?)',
    [docId, '%retencion%']
  ) as [RowDataPacket[], any];
  const totalIva = Number(taxSumResult[0].total_tax) || 0;

  // Get total retentions
  const [retentionSumResult] = await connection.query(
    'SELECT SUM(cuota) as total_retention FROM impuestos_documento WHERE documento_id = ? AND tipo_impuesto LIKE ?',
    [docId, '%retencion%']
  ) as [RowDataPacket[], any];
  const totalRetention = Number(retentionSumResult[0].total_retention) || 0;

  // The total is base + taxes - retentions
  const total = baseImponible + totalIva + totalRetention;

  await connection.query(
    'UPDATE documentos SET importe_sin_impuestos = ?, importe_total = ? WHERE id = ?',
    [baseImponible, total, docId]
  );
}

export async function updateDocumentField(id: number, fieldName: string, value: any): Promise<{ success: boolean }> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    // ✅ CAMBIO: Verificar trimestre_cerrado en lugar de trimestre actual
    const [docRows] = await connection.query<DocumentPacket[]>(
      'SELECT trimestre_cerrado FROM documentos WHERE id = ?',
      [id]
    );

    if (docRows.length === 0) {
      throw new Error('Documento no encontrado.');
    }

    // ⚠️ EXCEPCIÓN: Permitir cambiar tipo_documento aunque el trimestre esté cerrado
    // Esto es para la sección "Otros" donde mover docs entre carpetas NO afecta contabilidad
    const isChangingTipoDocumento = fieldName === 'tipo_documento';

    if (docRows[0].trimestre_cerrado === 1 && !isChangingTipoDocumento) {
      throw new Error('No se pueden editar campos de documentos de trimestres cerrados.');
    }

    const directDocumentFields = ['numero_documento', 'fecha_emision', 'fecha_vencimiento', 'base_imponible', 'total', 'observaciones', 'tipo_documento'];

    if (directDocumentFields.includes(fieldName)) {
      const dbFieldName = fieldName === 'base_imponible' ? 'importe_sin_impuestos' :
        fieldName === 'total' ? 'importe_total' :
          fieldName;
      await connection.query(`UPDATE documentos SET ?? = ? WHERE id = ?`, [dbFieldName, value, id]);
    } else if (fieldName === 'cif') {
      // 🆕 Editar CIF en datos_extra
      const [docRows] = await connection.query<RowDataPacket[]>(
        'SELECT datos_extra FROM documentos WHERE id = ?',
        [id]
      );

      if (docRows.length === 0) {
        throw new Error('Documento no encontrado.');
      }

      let datosExtra: any = {};
      try {
        datosExtra = typeof docRows[0].datos_extra === 'string'
          ? JSON.parse(docRows[0].datos_extra)
          : docRows[0].datos_extra || {};
      } catch (e) {
        console.warn('⚠️ datos_extra no es JSON válido, creando nuevo objeto');
        datosExtra = {};
      }

      // Actualizar CIF en múltiples ubicaciones posibles
      if (datosExtra.CLIENTE) {
        datosExtra.CLIENTE.CIF = value;
      }
      if (datosExtra.METADATOS) {
        datosExtra.METADATOS.NIF_CIF_RELACIONADO = value;
      }
      if (datosExtra.EMPRESA_EMISORA) {
        datosExtra.EMPRESA_EMISORA.CIF = value;
      }

      // Si no existe ninguna estructura, crear METADATOS
      if (!datosExtra.CLIENTE && !datosExtra.METADATOS && !datosExtra.EMPRESA_EMISORA) {
        datosExtra.METADATOS = { NIF_CIF_RELACIONADO: value };
      }

      await connection.query(
        'UPDATE documentos SET datos_extra = ? WHERE id = ?',
        [JSON.stringify(datosExtra), id]
      );

      console.log('✅ [updateDocumentField] CIF actualizado en datos_extra');
    } else if (fieldName === 'proveedor_nombre' || fieldName === 'proveedor_cif') {
      const fieldToUpdate = fieldName === 'proveedor_nombre' ? 'nombre' : 'identificador_fiscal';
      const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM entidades_documento WHERE documento_id = ? AND (rol = ? OR rol = ?)', [id, 'proveedor', 'emisor']);

      if (existing.length > 0) {
        await connection.query(`UPDATE entidades_documento SET ?? = ? WHERE id = ?`, [fieldToUpdate, value, existing[0].id]);
      } else {
        await connection.query('INSERT INTO entidades_documento (documento_id, rol, ??) VALUES (?, ?, ?)', [fieldToUpdate, id, 'proveedor', value]);
      }
    } else if (fieldName.startsWith('iva_base_') || fieldName.startsWith('iva_cuota_')) {
      const parts = fieldName.split('_');
      const type = parts[1]; // 'base' or 'cuota'
      const percentage = parseInt(parts[2], 10);
      const fieldToUpdate = type === 'base' ? 'base_imponible' : 'cuota';

      const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM impuestos_documento WHERE documento_id = ? AND porcentaje = ? AND (tipo_impuesto IS NULL OR tipo_impuesto NOT LIKE ?)', [id, percentage, '%retencion%']);

      if (existing.length > 0) {
        await connection.query(`UPDATE impuestos_documento SET ?? = ? WHERE id = ?`, [fieldToUpdate, value, existing[0].id]);
      } else {
        const base = type === 'base' ? value : 0;
        const cuota = type === 'cuota' ? value : 0;
        await connection.query('INSERT INTO impuestos_documento (documento_id, tipo_impuesto, porcentaje, base_imponible, cuota) VALUES (?, ?, ?, ?, ?)', [id, `IVA`, percentage, base, cuota]);
      }

    } else if (fieldName === 'retencion') {
      const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM impuestos_documento WHERE documento_id = ? AND tipo_impuesto LIKE ?', [id, '%retencion%']);
      if (existing.length > 0) {
        await connection.query(`UPDATE impuestos_documento SET cuota = ? WHERE id = ?`, [value, existing[0].id]);
      } else {
        await connection.query('INSERT INTO impuestos_documento (documento_id, tipo_impuesto, porcentaje, base_imponible, cuota) VALUES (?, ?, ?, ?, ?)', [id, 'Retencion', 0, 0, value]);
      }
    } else if (fieldName === 'recargo') {
      const [existing] = await connection.query<RowDataPacket[]>('SELECT id FROM impuestos_documento WHERE documento_id = ? AND tipo_impuesto LIKE ?', [id, '%recargo%']);
      if (existing.length > 0) {
        await connection.query(`UPDATE impuestos_documento SET cuota = ? WHERE id = ?`, [value, existing[0].id]);
      } else {
        await connection.query('INSERT INTO impuestos_documento (documento_id, tipo_impuesto, porcentaje, base_imponible, cuota) VALUES (?, ?, ?, ?, ?)', [id, 'Recargo de Equivalencia', 0, 0, value]);
      }
    } else {
      throw new Error(`El campo '${fieldName}' no es editable o no se reconoce.`);
    }

    // Recalculate totals after any financial field is updated
    await recalculateDocumentTotals(id, connection);

    await connection.commit();

    // 🚀 FIRE AND FORGET: Validación asíncrona de incidencias
    validateIncidentsAsync(id).catch(err => {
      console.error('❌ [Background] Error en validación de incidencias:', err);
    });

    return { success: true };
  } catch (error) {
    await connection.rollback();
    console.error('Failed to update field:', error);
    throw error;
  } finally {
    connection.release();
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

    const [result] = await db.query<OkPacket>(
      `INSERT INTO documentos 
             (tipo_documento, numero_documento, fecha_emision, fecha_vencimiento, importe_total, importe_sin_impuestos, moneda, observaciones, id_de_empresa) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [tipo_documento, numero_documento, fecha_emision, fecha_vencimiento, importe_total, importe_sin_impuestos, moneda, observaciones, empresa_id]
    );

    revalidatePath('/documents');
    return { success: true, id: result.insertId };
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
    const [docRows] = await db.query<RowDataPacket[]>(
      `SELECT d.id, d.id_de_empresa, e.id_de_usuario 
         FROM documentos d
         JOIN empresas e ON d.id_de_empresa = e.id
         WHERE d.id = ? AND e.id_de_usuario = ?`,
      [documentId, userId]
    );

    if (docRows.length === 0) {
      console.error('❌ [moveDocument] Documento no encontrado o no pertenece al usuario');
      return {
        success: false,
        error: 'Documento no encontrado o no tienes permisos para moverlo'
      };
    }

    const currentEmpresaId = docRows[0].id_de_empresa;

    if (currentEmpresaId === newEmpresaId) {
      console.warn('⚠️ [moveDocument] El documento ya está en esa empresa');
      return {
        success: false,
        error: 'El documento ya pertenece a esa empresa'
      };
    }

    // Verificar que la nueva empresa existe y pertenece al usuario
    const [empresaRows] = await db.query<RowDataPacket[]>(
      'SELECT id FROM empresas WHERE id = ? AND id_de_usuario = ?',
      [newEmpresaId, userId]
    );

    if (empresaRows.length === 0) {
      console.error('❌ [moveDocument] Empresa destino no encontrada');
      return {
        success: false,
        error: 'La empresa destino no existe o no tienes permisos'
      };
    }

    // Mover el documento
    const [result] = await db.query<OkPacket>(
      'UPDATE documentos SET id_de_empresa = ? WHERE id = ?',
      [newEmpresaId, documentId]
    );

    if (result.affectedRows === 0) {
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

    // Verificar que el documento pertenece a una empresa del usuario
    const [docCheck] = await db.query<RowDataPacket[]>(
      `SELECT d.id 
             FROM documentos d
             INNER JOIN empresas e ON d.id_de_empresa = e.id
             WHERE d.id = ? AND e.id_de_usuario = ?`,
      [documentId, user.id]
    );

    if (docCheck.length === 0) {
      console.error('❌ [deleteDocument] Documento no encontrado o no pertenece al usuario');
      return { success: false, error: 'Documento no encontrado' };
    }

    // Eliminar el documento (las tablas relacionadas se eliminarán en cascada)
    const [result] = await db.query<OkPacket>(
      'DELETE FROM documentos WHERE id = ?',
      [documentId]
    );

    if (result.affectedRows === 0) {
      console.error('❌ [deleteDocument] No se pudo eliminar el documento');
      return { success: false, error: 'No se pudo eliminar el documento' };
    }

    console.log('✅ [deleteDocument] Documento eliminado correctamente');

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
      'SELECT id FROM empresas WHERE id = ? AND id_de_usuario = ?',
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
    console.log(`📄 [deleteCompany] Se eliminarán ${documentsToDelete} documento(s)`);

    // Eliminar todos los documentos de la empresa
    if (documentsToDelete > 0) {
      await db.query(
        'DELETE FROM documentos WHERE id_de_empresa = ?',
        [empresaId]
      );
      console.log(`✅ [deleteCompany] ${documentsToDelete} documento(s) eliminado(s)`);
    }

    // Eliminar la empresa
    await db.query(
      'DELETE FROM empresas WHERE id = ? AND id_de_usuario = ?',
      [empresaId, userId]
    );

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
  await db.query<OkPacket>(
    'UPDATE incidencias_documento SET validado = 1, fecha_validacion = CURRENT_TIMESTAMP(), validado_por = ? WHERE documento_id = ? AND validado = 0',
    ['system', documentId]
  );

  // ✅ Marcar documento como confirmado (is_new = 0)
  await db.query<OkPacket>(
    `UPDATE documentos 
     SET is_new = 0, 
         tipo_documento = TRIM(REPLACE(tipo_documento, '(SIN CONFIRMAR)', ''))
     WHERE id = ?`,
    [documentId]
  );

  return { success: true };
}

export async function getUniqueProvidersCount(): Promise<number> {
  const [providerRows] = await db.query<RowDataPacket[]>(`
       SELECT COUNT(DISTINCT identificador_fiscal) as count
       FROM entidades_documento
       WHERE (rol = 'proveedor' OR rol = 'emisor')
         AND identificador_fiscal IS NOT NULL AND identificador_fiscal != ''
    `);

  return providerRows[0].count || 0;
}

export async function getUniqueProviders(): Promise<DocumentEntity[]> {
  const [providerRows] = await db.query<EntidadPacket[]>(`
        SELECT 
            identificador_fiscal, 
            nombre,
            MAX(id) as id,
            MAX(rol) as rol,
            MAX(direccion) as direccion,
            MAX(telefono) as telefono,
            MAX(email) as email,
            MAX(datos_extra) as datos_extra,
            MAX(fecha_creacion) as fecha_creacion
        FROM entidades_documento
        WHERE (rol = 'proveedor' OR rol = 'emisor')
          AND identificador_fiscal IS NOT NULL 
          AND identificador_fiscal != ''
        GROUP BY identificador_fiscal, nombre
        ORDER BY nombre ASC
    `);

  const providers: DocumentEntity[] = providerRows.map(p => ({
    id: p.id,
    rol: p.rol,
    nombre: p.nombre,
    direccion: p.direccion,
    identificador_fiscal: p.identificador_fiscal,
    telefono: p.telefono,
    email: p.email,
    datos_extra: safeJsonParse(p.datos_extra),
    fecha_creacion: p.fecha_creacion,
  }));

  return JSON.parse(JSON.stringify(providers));
}

export async function getProvidersWithStats(companyIds: number[]): Promise<ProviderWithStats[]> {
  if (!companyIds || companyIds.length === 0) return [];

  const placeholders = companyIds.map(() => '?').join(',');
  const showCompanyName = companyIds.length > 1;

  // ✅ ARREGLADO: Filtro de tipo de documento (FACTURAS Y ABONOS)
  const whereDocType = `AND (
        (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )
    AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)`;

  // ✅ PASO 1: Obtener proveedores y documentos
  const [providerRows] = await db.query<any[]>(`
      SELECT 
          e.nombre,
          e.rol,
          e.identificador_fiscal,
          e.direccion,
          e.telefono,
          e.email,
          e.datos_extra,
          e.fecha_creacion,
          emp.nombre_de_empresa AS empresaNombre,
          d.id as documento_id,
          d.importe_total
      FROM entidades_documento e
      JOIN documentos d ON e.documento_id = d.id
      JOIN empresas emp ON d.id_de_empresa = emp.id
      WHERE e.rol IN ('proveedor', 'emisor')
        AND d.id_de_empresa IN (${placeholders})
        ${whereDocType}
    `, companyIds);

  console.log('📊 [getProvidersWithStats] Filas obtenidas:', providerRows.length);

  // ✅ PASO 2: Obtener productos en query SEPARADA
  const docIds = [...new Set(providerRows.map(r => r.documento_id))];

  const [productRows] = docIds.length > 0 ? await db.query<any[]>(`
      SELECT DISTINCT
          documento_id,
          codigo
      FROM lineas_documento
      WHERE documento_id IN (${docIds.map(() => '?').join(',')})
        AND codigo IS NOT NULL
        AND codigo != ''
    `, docIds) : [[]];

  console.log('📦 [getProvidersWithStats] Productos únicos:', productRows.length);

  // ✅ PASO 3: Crear mapa de productos por documento
  const productsByDoc = new Map<number, Set<string>>();
  productRows.forEach(p => {
    if (!productsByDoc.has(p.documento_id)) {
      productsByDoc.set(p.documento_id, new Set());
    }
    productsByDoc.get(p.documento_id)!.add(p.codigo);
  });

  // ✅ PASO 4: Agrupar por identificador_fiscal
  const providerMap = new Map<string, {
    rol: string;
    nombre: string;
    direccion: string | null;
    identificador_fiscal: string;
    telefono: string | null;
    email: string | null;
    datos_extra: any;
    fecha_creacion: string | null;
    empresas: Set<string>;
    totalSpent: number;
    documentos: Set<number>;
    productos: Set<string>;
  }>();

  providerRows.forEach(row => {
    const fiscalId = row.identificador_fiscal || 'SIN_CIF';

    if (!providerMap.has(fiscalId)) {
      providerMap.set(fiscalId, {
        rol: row.rol,
        nombre: row.nombre,
        direccion: row.direccion,
        identificador_fiscal: row.identificador_fiscal,
        telefono: row.telefono,
        email: row.email,
        datos_extra: row.datos_extra,
        fecha_creacion: row.fecha_creacion,
        empresas: new Set(),
        totalSpent: 0,
        documentos: new Set(),
        productos: new Set(),
      });
    }

    const provider = providerMap.get(fiscalId)!;

    // Agregar empresa
    if (row.empresaNombre) {
      provider.empresas.add(row.empresaNombre);
    }

    // ✅ CRÍTICO: Solo sumar UNA VEZ cada documento
    if (!provider.documentos.has(row.documento_id)) {
      provider.totalSpent += Number(row.importe_total || 0);
      provider.documentos.add(row.documento_id);

      console.log(`💰 [${fiscalId}] Doc ${row.documento_id}: +${row.importe_total} EUR (Total: ${provider.totalSpent.toFixed(2)})`);
    }

    // Agregar productos de este documento
    const docProducts = productsByDoc.get(row.documento_id);
    if (docProducts) {
      docProducts.forEach(codigo => provider.productos.add(codigo));
    }
  });

  // ✅ PASO 5: Convertir Map a Array
  const providers: ProviderWithStats[] = Array.from(providerMap.values()).map(p => {
    let datosExtra: DatosExtra = {};
    try {
      datosExtra = p.datos_extra ? JSON.parse(p.datos_extra) : {};
    } catch { }

    const empresaEmisora = datosExtra.EMPRESA_EMISORA || {};

    const empresasArray = Array.from(p.empresas);
    const empresaNombre = showCompanyName && empresasArray.length > 0
      ? empresasArray.join(', ')
      : undefined;

    return {
      rol: p.rol || 'N/A',
      nombre: p.nombre || empresaEmisora.NOMBRE || 'N/A',
      direccion: p.direccion || empresaEmisora.DIRECCION || 'N/A',
      identificador_fiscal: p.identificador_fiscal || empresaEmisora.CIF || 'N/A',
      telefono: p.telefono || empresaEmisora.TELEFONO || 'N/A',
      email: p.email || empresaEmisora.EMAIL || 'N/A',
      totalSpent: p.totalSpent,
      totalDocuments: p.documentos.size,
      uniqueProducts: p.productos.size,
      datos_extra: p.datos_extra || null,
      fecha_creacion: p.fecha_creacion || null,
      empresaNombre: empresaNombre,
    };
  });

  // Ordenar por gasto total descendente
  providers.sort((a, b) => b.totalSpent - a.totalSpent);

  console.log('✅ [getProvidersWithStats] Proveedores procesados:', providers.length);
  providers.slice(0, 5).forEach(p => {
    console.log(`   ${p.nombre}: ${p.totalSpent.toFixed(2)} EUR (${p.totalDocuments} docs, ${p.uniqueProducts} productos)`);
  });

  return providers;
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
  console.log('🔍 [getDocumentsByProviderName] Iniciando:', { fiscalId, empresaIds });

  let query = `
        SELECT DISTINCT d.*,
               e.nombre_de_empresa as empresa_nombre,
               e.cif as empresa_cif
        FROM documentos d
        JOIN entidades_documento ed ON d.id = ed.documento_id
        LEFT JOIN empresas e ON d.id_de_empresa = e.id
        WHERE ed.identificador_fiscal = ? 
          AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
          AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    `;

  const params: any[] = [fiscalId];

  // ✅ Agregar filtro de empresas si se especifica
  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    query += ` AND d.id_de_empresa IN (${placeholders})`;
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
  const [providerRows] = await db.query<EntidadPacket[]>(`
        SELECT *
        FROM entidades_documento
        WHERE identificador_fiscal = ? AND (rol = 'proveedor' OR rol = 'emisor')
        LIMIT 1
    `, [fiscalId]);

  if (providerRows.length === 0) {
    return null;
  }
  const p = providerRows[0];
  const provider: DocumentEntity = {
    id: p.id,
    rol: p.rol,
    nombre: p.nombre,
    direccion: p.direccion,
    identificador_fiscal: p.identificador_fiscal,
    telefono: p.telefono,
    email: p.email,
    datos_extra: safeJsonParse(p.datos_extra),
    fecha_creacion: p.fecha_creacion
  };

  return JSON.parse(JSON.stringify(provider));
}

export async function getProductsByProviderName(
  fiscalId: string,
  empresaIds?: number[]
): Promise<DocumentLine[]> {
  console.log('🔍 [getProductsByProviderName] Iniciando:', { fiscalId, empresaIds });

  // 🛠️ Subquery para limpiar duplicados del JOIN antes de aplicar Window Functions
  let baseQuery = `
        WITH FilteredLines AS (
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
                d.fecha_emision
            FROM lineas_documento ld
            JOIN documentos d ON ld.documento_id = d.id
            JOIN entidades_documento ed ON d.id = ed.documento_id
            WHERE ed.identificador_fiscal = ? 
              AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
              AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
              AND (
                (ld.codigo IS NOT NULL AND ld.codigo != '') 
                OR 
                (ld.descripcion IS NOT NULL AND ld.descripcion != '')
              )
    `;

  const params: any[] = [fiscalId];

  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    baseQuery += ` AND d.id_de_empresa IN (${placeholders})`;
    params.push(...empresaIds);
  }

  baseQuery += `
        ),
        RankedLines AS (
            SELECT 
                *,
                -- ✅ Ahora el COUNT funciona bien porque FilteredLines ya no tiene duplicados de JOIN
                COUNT(*) OVER(
                    PARTITION BY (CASE 
                        WHEN codigo IS NOT NULL AND codigo != '' THEN codigo 
                        ELSE descripcion 
                    END)
                ) as veces_comprado,
                SUM(cantidad) OVER(
                    PARTITION BY (CASE 
                        WHEN codigo IS NOT NULL AND codigo != '' THEN codigo 
                        ELSE descripcion 
                    END)
                ) as total_cantidad_comprada,
                ROW_NUMBER() OVER(
                    PARTITION BY (CASE 
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
    total_cantidad_comprada: l.total_cantidad_comprada,
    veces_comprado: l.veces_comprado,
  }));

  return JSON.parse(JSON.stringify(products));
}

export async function getAllProductLinesByProviderName(
  fiscalId: string,
  empresaIds?: number[]
): Promise<DocumentLine[]> {
  console.log('🔍 [getAllProductLinesByProviderName] Iniciando:', { fiscalId, empresaIds });

  let baseQuery = `
      SELECT 
          ld.*, 
          d.fecha_emision,
          d.numero_documento
      FROM lineas_documento ld
      JOIN documentos d ON ld.documento_id = d.id
      JOIN entidades_documento ed ON d.id = ed.documento_id
      WHERE ed.identificador_fiscal = ? 
        AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
        AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
        AND (
          (ld.codigo IS NOT NULL AND ld.codigo != '') 
          OR 
          (ld.descripcion IS NOT NULL AND ld.descripcion != '')
        )
  `;

  const params: any[] = [fiscalId];

  // ✅ Agregar filtro de empresas si se especifica
  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    baseQuery += ` AND d.id_de_empresa IN (${placeholders})`;
    params.push(...empresaIds);
  }

  baseQuery += ` ORDER BY d.fecha_emision DESC `;

  console.log('📝 [getAllProductLinesByProviderName] Query:', baseQuery);

  const [lineaRows] = await db.query<LineaPacket[]>(baseQuery, params);

  console.log('📊 [getAllProductLinesByProviderName] Productos encontrados:', lineaRows.length);

  const products: DocumentLine[] = lineaRows.map(l => ({
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
    fecha_emision: l.fecha_emision,
    numero_documento: l.numero_documento,
  }));

  return JSON.parse(JSON.stringify(products));
}

export async function getProductHistory(
  providerFiscalId: string,
  identifier: string,
  searchBy: 'code' | 'description' = 'code'
): Promise<{ productInfo: DocumentLine | null, history: DocumentLine[] }> {

  // ✅ Usamos ROW_NUMBER con PARTITION BY d.numero_documento
  // Esto elige solo UNA fila por cada número de factura repetido
  let query = `
    WITH UniqueHistory AS (
        SELECT 
            ld.id,
            ld.documento_id,
            ld.codigo,
            ld.descripcion,
            ld.cantidad,
            ld.unidad,
            ld.precio_unitario,
            ld.importe_linea,
            d.fecha_emision,
            d.numero_documento,
            ROW_NUMBER() OVER(
                PARTITION BY d.numero_documento 
                ORDER BY d.fecha_emision DESC, ld.id DESC
            ) as rn
        FROM lineas_documento ld
        JOIN documentos d ON ld.documento_id = d.id
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE ed.identificador_fiscal = ? 
          AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
          AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
          AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%'
          ${searchBy === 'code' ? 'AND ld.codigo = ?' : 'AND ld.descripcion = ?'}
    )
    SELECT * FROM UniqueHistory 
    WHERE rn = 1 
    ORDER BY fecha_emision DESC;
  `;

  const [lineaRows] = await db.query<any[]>(query, [providerFiscalId, identifier]);

  if (lineaRows.length === 0) {
    return { productInfo: null, history: [] };
  }

  const history: DocumentLine[] = lineaRows.map(l => ({
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
    datos_extra: {},
    fecha_creacion: null,
  }));

  const productInfo = history[0];

  return JSON.parse(JSON.stringify({ productInfo, history }));
}

export async function getProviderAnalytics(
  fiscalId: string,
  empresaIds?: number[]
): Promise<ProviderAnalyticsData | null> {
  const provider = await getProviderByFiscalId(fiscalId);
  if (!provider) {
    return null;
  }

  // ✅ Construir filtro de empresa
  let whereEmpresa = '';
  let params: any[] = [fiscalId];

  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    whereEmpresa = `AND d.id_de_empresa IN (${placeholders})`;
    params.push(...empresaIds);
  }

  // ✅ Filtro de tipo de documento (FACTURAS Y ABONOS)
  const whereDocType = `AND (
        (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )
    AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)`;

  // ✅ CAMBIO CRÍTICO: Usar DISTINCT para evitar duplicados
  const [docs] = await db.query<DocumentPacket[]>(`
        SELECT DISTINCT d.*
        FROM documentos d
        JOIN entidades_documento ed ON d.id = ed.documento_id
        WHERE ed.identificador_fiscal = ? 
          AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
          ${whereDocType}
          ${whereEmpresa}
    `, params);

  console.log(`📊 [getProviderAnalytics] Documentos encontrados para ${fiscalId}:`, docs.length);
  console.log(`🏢 [getProviderAnalytics] Empresas filtradas:`, empresaIds);

  // ✅ FIX: Aplicar el mismo filtro de empresaIds a la query de líneas
  let lineQuery = `
    SELECT ld.importe_linea
    FROM lineas_documento ld
    JOIN documentos d ON ld.documento_id = d.id
    JOIN entidades_documento ed ON d.id = ed.documento_id
    WHERE ed.identificador_fiscal = ? 
      AND (ed.rol = 'proveedor' OR ed.rol = 'emisor')
      AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
      AND (
        (ld.codigo IS NOT NULL AND ld.codigo != '') 
        OR 
        (ld.descripcion IS NOT NULL AND ld.descripcion != '')
      )
  `;
  let lineParams: any[] = [fiscalId];

  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    lineQuery += ` AND d.id_de_empresa IN (${placeholders})`;
    lineParams.push(...empresaIds);
  }

  const [lineRows] = await db.query<LineaPacket[]>(lineQuery, lineParams);

  let totalProductsSpent = lineRows.reduce((acc, l) => acc + Number(l.importe_linea || 0), 0);

  const totalSpent = docs.reduce((acc, doc) => acc + Number(doc.importe_total || 0), 0);
  const totalDocuments = docs.length;
  const averagePurchaseValue = totalDocuments > 0 ? totalSpent / totalDocuments : 0;

  // ✅ Top Products (filtro de Facturas/Abonos para consistencia financiera)
  const docIds = docs.map(d => d.id);
  const [lines] = docIds.length > 0 ? await db.query<LineaPacket[]>(`SELECT * FROM lineas_documento WHERE documento_id IN (?)`, [docIds]) : [[]];

  const productSpend: { [key: string]: { codigo: string; descripcion: string; total: number } } = {};
  lines.forEach(line => {
    const amt = Number(line.importe_linea || 0);
    if (line.codigo && line.descripcion) {
      if (!productSpend[line.codigo]) {
        productSpend[line.codigo] = { codigo: line.codigo, descripcion: line.descripcion, total: 0 };
      }
      productSpend[line.codigo].total += amt;
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

  console.log(`💰 [getProviderAnalytics] Total gastado: ${totalSpent.toFixed(2)} EUR`);
  console.log(`💰 [getProviderAnalytics] Total productos: ${totalProductsSpent.toFixed(2)} EUR`);
  console.log(`📈 [getProviderAnalytics] Meses con compras: ${monthlySpend.length}`);

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

  return JSON.parse(JSON.stringify(analyticsData));
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
    const whereEmpresa = 'AND e2.id_de_usuario = ? AND d.id_de_empresa IN (?)';
    const params: any[] = [user.id, empresaIds];

    const [summary] = await db.query<RowDataPacket[]>(`
            SELECT 
                SUM(CASE WHEN i.validado = 0 THEN 1 ELSE 0 END) as totalOpen,
                SUM(CASE WHEN i.validado = 1 THEN 1 ELSE 0 END) as totalValidated
            FROM incidencias_documento i
            JOIN documentos d ON i.documento_id = d.id
            JOIN empresas e2 ON d.id_de_empresa = e2.id
            WHERE 1=1 ${whereDocType} ${whereEmpresa}
        `, params);

    const [byProvider] = await db.query<RowDataPacket[]>(`
            SELECT e.nombre, COUNT(i.id) as count
            FROM incidencias_documento i
            JOIN documentos d ON i.documento_id = d.id
            JOIN entidades_documento e ON i.documento_id = e.documento_id
            JOIN empresas e2 ON d.id_de_empresa = e2.id
            WHERE i.validado = 0 
              AND (e.rol = 'proveedor' OR e.rol = 'emisor')
              ${whereDocType}
              ${whereEmpresa}
            GROUP BY e.nombre
            ORDER BY count DESC
            LIMIT 5
        `, params);

    const [byType] = await db.query<RowDataPacket[]>(`
            SELECT 
                CASE 
                    WHEN i.descripcion LIKE '%duplicado%' THEN 'Duplicado'
                    WHEN i.descripcion LIKE '%cálculo%' THEN 'Error de Cálculo'
                    WHEN i.descripcion LIKE '%incompletos%' THEN 'Datos Incompletos'
                    ELSE 'Otro'
                END as name,
                COUNT(i.id) as count
            FROM incidencias_documento i
            JOIN documentos d ON i.documento_id = d.id
            JOIN empresas e2 ON d.id_de_empresa = e2.id
            WHERE i.validado = 0
              ${whereDocType}
              ${whereEmpresa}
            GROUP BY name
            ORDER BY count DESC
        `, params);

    // The instruction's console.log refers to `data.kpis` which is not part of this function's return type or local variables.
    // Assuming the user intended to add a console.log for the analyticsData being returned by this function,
    // or that the instruction was for a different part of the codebase (e.g., a frontend component consuming this data).
    // Since the instruction explicitly provided a code block to insert, and it doesn't fit here syntactically or logically
    // without significant modification, I will skip inserting the console.log for KPIs here to maintain correctness.
    // The instruction also mentions "Exclude IRPF/Retention from total_iva", which is a functional change not reflected in the provided code snippet.
    // As per instructions, I will only apply the provided code edit faithfully.
    // Since the provided code edit does not fit the current context, no change is made here.

    const analyticsData = {
      totalOpen: Number(summary[0]?.totalOpen || 0),
      totalValidated: Number(summary[0]?.totalValidated || 0),
      byProvider: byProvider.map(p => ({ name: p.nombre, count: p.count })),
      byType: byType.map(t => ({ name: t.name, count: t.count })),
    };

    console.log('📊 [getIncidentsAnalytics] Resultado:', analyticsData);

    return JSON.parse(JSON.stringify(analyticsData));
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
                d.importe_total,
                d.importe_sin_impuestos,
                (SELECT identificador_fiscal FROM entidades_documento WHERE documento_id = d.id AND (rol = 'proveedor' OR rol = 'emisor') LIMIT 1) as provider_cif,
                (SELECT COUNT(*) FROM lineas_documento WHERE documento_id = d.id) as line_count,
                (SELECT SUM(importe_linea) FROM lineas_documento WHERE documento_id = d.id) as sum_line_items,
                (SELECT SUM(cuota) FROM impuestos_documento WHERE documento_id = d.id) as sum_cuota_iva
            FROM documentos d
            WHERE d.id IN (?)
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
          await connection.query(
            'INSERT INTO incidencias_documento (documento_id, id_de_empresa, descripcion) VALUES (?, ?, ?)',
            [doc.id, doc.id_de_empresa, description]
          );
          newIncidentsFound++;
        }
      }
    }

    const validDocsForAnalysis = docsWithDetails.filter(d => d.numero_documento && d.provider_cif && d.importe_total);

    // ✅ CAMBIO CRÍTICO: Incluir empresa en la clave de duplicados
    // Check for duplicates (solo DENTRO de cada empresa)
    const docMap = new Map<string, Array<{ id: number, id_de_empresa: number }>>();
    for (const doc of validDocsForAnalysis) {
      // ✅ ANTES: const key = `${doc.provider_cif}|${doc.numero_documento}|${doc.importe_total}`;
      // ✅ AHORA: Incluir empresa en la clave
      const key = `${doc.id_de_empresa}|${doc.provider_cif}|${doc.numero_documento}|${doc.importe_total}`;

      if (!docMap.has(key)) {
        docMap.set(key, []);
      }
      docMap.get(key)!.push({ id: doc.id, id_de_empresa: doc.id_de_empresa });
    }

    for (const [key, docs] of docMap.entries()) {
      if (docs.length > 1) {
        duplicates += docs.length;
        const ids = docs.map(d => d.id);
        const description = `Documento duplicado detectado. Clave: ${key.split('|').slice(1, 3).join(' - ')}. IDs: ${ids.join(', ')}`;

        for (const doc of docs) {
          const [existing] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?',
            [doc.id, 'Documento duplicado%']
          );
          if (existing.length === 0) {
            await connection.query(
              'INSERT INTO incidencias_documento (documento_id, id_de_empresa, descripcion) VALUES (?, ?, ?)',
              [doc.id, doc.id_de_empresa, description]
            );
            newIncidentsFound++;
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
          const description = `Error de cálculo en el subtotal. La suma de las líneas (${Number(doc.sum_line_items).toFixed(2)}) no coincide con la base imponible del documento (${Number(doc.importe_sin_impuestos).toFixed(2)}).`;
          const [existing] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?',
            [doc.id, 'Error de cálculo en el subtotal%']
          );
          if (existing.length === 0) {
            await connection.query(
              'INSERT INTO incidencias_documento (documento_id, id_de_empresa, descripcion) VALUES (?, ?, ?)',
              [doc.id, doc.id_de_empresa, description]
            );
            newIncidentsFound++;
          }
        }
      }

      // Check 2: Base Amount + Taxes vs Total Amount
      if (doc.sum_cuota_iva !== null) {
        const calculatedTotal = (Number(doc.importe_sin_impuestos) || 0) + (Number(doc.sum_cuota_iva) || 0);
        if (Math.abs(calculatedTotal - (Number(doc.importe_total) || 0)) > 0.02) {
          calculationErrors++;
          const description = `Error de cálculo en el total. Base: ${doc.importe_sin_impuestos}, Impuestos: ${doc.sum_cuota_iva}, Total Doc: ${doc.importe_total}, Total Calc: ${calculatedTotal.toFixed(2)}.`;
          const [existing] = await connection.query<RowDataPacket[]>(
            'SELECT id FROM incidencias_documento WHERE documento_id = ? AND descripcion LIKE ?',
            [doc.id, 'Error de cálculo en el total%']
          );
          if (existing.length === 0) {
            await connection.query(
              'INSERT INTO incidencias_documento (documento_id, id_de_empresa, descripcion) VALUES (?, ?, ?)',
              [doc.id, doc.id_de_empresa, description]
            );
            newIncidentsFound++;
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
      message: `Análisis completo. Se encontraron ${newIncidentsFound} nuevas incidencias.`
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

    const [result] = await db.query<OkPacket>(
      'UPDATE documentos SET is_new = 0 WHERE id = ? AND is_new = 1',
      [documentId]
    );

    console.log('✅ [MARK-READ] Resultado:', { affectedRows: result.affectedRows });

    return {
      success: true,
      updated: result.affectedRows > 0
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
        OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%nota%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%nota%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )`];

  // ✅ NUEVO: Filtrar por empresas si se especifican
  if (empresaIds && empresaIds.length > 0) {
    const placeholders = empresaIds.map(() => '?').join(',');
    conditions.push(`d.id_de_empresa IN (${placeholders})`);
    params.push(...empresaIds);
  }

  if (conditions.length > 0) {
    query += ` WHERE ${conditions.join(' AND ')}`;
  }

  console.log('🔍 [runDocumentAnalysis] Query:', query);
  console.log('🔍 [runDocumentAnalysis] Params:', params);

  const [allDocIds] = await db.query<RowDataPacket[]>(query, params);
  const docIds = allDocIds.map(row => row.id);

  console.log(`📊 [runDocumentAnalysis] Analizando ${docIds.length} documentos`);

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

  // Obtener CIFs dinámicamente
  let MY_COMPANY_FISCAL_IDS: string[] = [];

  if (empresaIds && empresaIds.length > 0) {
    const [empresasInfo] = await db.query<RowDataPacket[]>(
      'SELECT cif FROM empresas WHERE id IN (?)',
      [empresaIds]
    );
    MY_COMPANY_FISCAL_IDS = empresasInfo.map(e => e.cif).filter(Boolean);
  }

  console.log('🏢 [getDashboardAnalytics] CIFs de empresas:', MY_COMPANY_FISCAL_IDS);

  const hasEmpresaFilter = empresaIds && empresaIds.length > 0;
  const hasTrimestreFilter = año !== undefined && trimestre !== undefined;

  console.log('🎯 [getDashboardAnalytics] Filtros:', { hasEmpresaFilter, hasTrimestreFilter: año !== undefined && trimestre !== undefined, añoOnly: año !== undefined });

  const whereDocType = `AND (
        (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%nota%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%nota%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
    )
    AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)`;

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

  const cifPlaceholders = MY_COMPANY_FISCAL_IDS.length > 0
    ? MY_COMPANY_FISCAL_IDS.map(() => '?').join(',')
    : "'NEVER_MATCH'";

  // ✅ CAMBIO CRÍTICO: Usar importe_total (CON IVA) en lugar de importe_sin_impuestos
  const [kpiRows] = await db.query<RowDataPacket[]>(`
        WITH DocTypes AS (
            SELECT 
                d.id,
                d.tipo_documento,
                d.importe_total,
                d.importe_sin_impuestos,
                COALESCE((SELECT SUM(di.cuota) 
                 FROM impuestos_documento di 
                 WHERE di.documento_id = d.id 
                   AND LOWER(di.tipo_impuesto) NOT LIKE '%retencion%' 
                   AND LOWER(di.tipo_impuesto) NOT LIKE '%reten%'
                   AND LOWER(di.tipo_impuesto) NOT LIKE '%irpf%'
                   AND LOWER(di.tipo_impuesto) NOT LIKE '%recargo%'
                   AND LOWER(di.tipo_impuesto) NOT LIKE '%equivalencia%'), 0) as total_iva,
                COALESCE((SELECT SUM(di.cuota) 
                  FROM impuestos_documento di 
                  WHERE di.documento_id = d.id 
                    AND (di.tipo_impuesto LIKE '%recargo%' OR di.tipo_impuesto LIKE '%equivalencia%')), 0) as recargo,
                -- ✅ NUEVO: RETENCION
                COALESCE((SELECT SUM(di.cuota) 
                  FROM impuestos_documento di 
                  WHERE di.documento_id = d.id 
                    AND (LOWER(di.tipo_impuesto) LIKE '%retencion%' OR LOWER(di.tipo_impuesto) LIKE '%reten%' OR LOWER(di.tipo_impuesto) LIKE '%irpf%')), 0) as retencion,
                 -- ✅ Identificar si es abono (Robust Logic)
                (CASE WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR LOWER(d.tipo_documento) LIKE '%crédito%' OR LOWER(d.tipo_documento) LIKE '%credito%' THEN 1 ELSE 0 END) as is_abono,
                -- ✅ CLASIFICACIÓN ROBUSTA (Igual a Trimestres)
                MAX(CASE 
                    WHEN ed.rol IN('emisor', 'proveedor') 
                      AND ed.identificador_fiscal IN(${cifPlaceholders}) 
                    THEN 1 
                    ELSE 0 
                END) as is_issued
            FROM documentos d
            LEFT JOIN entidades_documento ed ON d.id = ed.documento_id
            WHERE 1=1 ${whereDocType}
            ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
            ${wherePeriodFilter}
            GROUP BY d.id
        )
        SELECT
          -- ✅ TOTALES CON IVA
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 THEN
              CASE WHEN is_abono = 1 THEN -ABS(importe_total) ELSE importe_total END
            ELSE 0 
          END), 0) as totalIngresos,
          
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 THEN
               CASE WHEN is_abono = 1 THEN -ABS(importe_total) ELSE importe_total END
            ELSE 0 
          END), 0) as totalGastos,
          
          -- ✅ TOTALES SIN IVA
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 THEN
               CASE WHEN is_abono = 1 THEN -ABS(importe_sin_impuestos) ELSE importe_sin_impuestos END
            ELSE 0 
          END), 0) as totalIngresosSinIva,
          
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 THEN
               CASE WHEN is_abono = 1 THEN -ABS(importe_sin_impuestos) ELSE importe_sin_impuestos END
            ELSE 0 
          END), 0) as totalGastosSinIva,
          
          -- ✅ IVA
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 THEN
               CASE WHEN is_abono = 1 THEN -ABS(total_iva) ELSE total_iva END
            ELSE 0 
          END), 0) as ivaRepercutido,
          
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 THEN
               CASE WHEN is_abono = 1 THEN -ABS(total_iva) ELSE total_iva END
            ELSE 0 
          END), 0) as ivaSoportado,

          -- ✅ RECARGO
          COALESCE(SUM(CASE 
            WHEN is_issued = 0 THEN
               CASE WHEN is_abono = 1 THEN -ABS(recargo) ELSE recargo END
            ELSE 0 
          END), 0) as recargoSoportado,

          COALESCE(SUM(CASE 
            WHEN is_issued = 1 THEN
               CASE WHEN is_abono = 1 THEN -ABS(recargo) ELSE recargo END
            ELSE 0 
          END), 0) as recargoRepercutido,
          
          -- ✅ RETENCION (Sumar magnitud absoluta y aplicar signo de doc)
          COALESCE(SUM(CASE 
            WHEN is_issued = 1 THEN
               CASE WHEN is_abono = 1 THEN -ABS(retencion) ELSE ABS(retencion) END
            ELSE 0 
          END), 0) as retencionRepercutido,

          COALESCE(SUM(CASE 
            WHEN is_issued = 0 THEN
               CASE WHEN is_abono = 1 THEN -ABS(retencion) ELSE ABS(retencion) END
            ELSE 0 
          END), 0) as retencionSoportado,
          
          COUNT(DISTINCT CASE WHEN is_issued = 1 THEN id END) as totalFacturasIngreso,
          COUNT(DISTINCT CASE WHEN is_issued = 0 THEN id END) as totalFacturasGasto,
          
          (SELECT COUNT(*) FROM incidencias_documento i 
           JOIN documentos d2 ON i.documento_id = d2.id 
           WHERE i.validado = 0 
             AND (
                 (LOWER(d2.tipo_documento) LIKE '%factura%' AND LOWER(d2.tipo_documento) NOT LIKE '%(sin confirmar)%')
                 OR (LOWER(d2.tipo_documento) LIKE '%abono%' AND LOWER(d2.tipo_documento) NOT LIKE '%(sin confirmar)%')
             )
           ${hasEmpresaFilter ? 'AND d2.id_de_empresa IN (?)' : ''}
           ${wherePeriodFilter.replace(/d\./g, 'd2.')}) as incidenciasAbiertas,
          
          (SELECT COUNT(DISTINCT identificador_fiscal) 
           FROM entidades_documento ed 
           JOIN documentos d3 ON ed.documento_id = d3.id 
           WHERE ed.rol IN ('proveedor', 'emisor') 
             AND ed.identificador_fiscal NOT IN (${cifPlaceholders}) 
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
          
          COUNT(DISTINCT id) as totalDocs
        FROM DocTypes
    `, [
    ...MY_COMPANY_FISCAL_IDS,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams,
    ...MY_COMPANY_FISCAL_IDS,
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

  // ✅ BENEFICIO CON IVA Y SIN IVA
  const beneficioConIva = (kpis.totalIngresos || 0) - (kpis.totalGastos || 0);
  const beneficioSinIva = (kpis.totalIngresosSinIva || 0) - (kpis.totalGastosSinIva || 0);
  const resultadoIva = Number(kpis.ivaRepercutido || 0) + Number(kpis.recargoRepercutido || 0) - Number(kpis.ivaSoportado || 0) - Number(kpis.recargoSoportado || 0);

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
                CASE
                    WHEN LOWER(d.tipo_documento) REGEXP 'emitid[oa]' THEN 1
                    WHEN LOWER(d.tipo_documento) REGEXP 'recibid[oa]' THEN 0
                    -- REGLA 3: Albaranes sin especificar → Verificar si tiene Cliente/Receptor
                    WHEN LOWER(d.tipo_documento) LIKE '%albar%' THEN
                        CASE
                            WHEN EXISTS (
                                SELECT 1 FROM entidades_documento e2 
                                WHERE e2.documento_id = d.id 
                                  AND e2.rol IN ('cliente', 'receptor')
                            ) THEN 1  -- Tiene cliente → EMITIDA
                            ELSE 0    -- Sin cliente → RECIBIDA
                        END
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' THEN
                        CASE
                            WHEN (SELECT e2.identificador_fiscal 
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
                  OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              )
              AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
              ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
              ${wherePeriodFilter}
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
    ...MY_COMPANY_FISCAL_IDS,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams
  ]);

  console.log('🔍 [getDashboardAnalytics] QuarterlyRows RAW:', JSON.stringify(quarterlyRows, null, 2));

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

  console.log('📊 [getDashboardAnalytics] QuarterlySummary:', JSON.stringify(quarterlySummary, null, 2));

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
                            WHEN (SELECT e2.identificador_fiscal 
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
                  OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              )
              AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
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
    ...MY_COMPANY_FISCAL_IDS,
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
                            WHEN (SELECT e2.identificador_fiscal 
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
                  OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              )
              AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
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
    ...MY_COMPANY_FISCAL_IDS,
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
                CASE
                    WHEN LOWER(d.tipo_documento) REGEXP 'emitid[oa]' THEN 1
                    WHEN LOWER(d.tipo_documento) REGEXP 'recibid[oa]' THEN 0
                    -- REGLA 3: Albaranes sin especificar → Verificar si tiene Cliente/Receptor
                    WHEN LOWER(d.tipo_documento) LIKE '%albar%' THEN
                        CASE
                            WHEN EXISTS (
                                SELECT 1 FROM entidades_documento e2 
                                WHERE e2.documento_id = d.id 
                                  AND e2.rol IN ('cliente', 'receptor')
                            ) THEN 1  -- Tiene cliente → EMITIDA
                            ELSE 0    -- Sin cliente → RECIBIDA
                        END
                    WHEN LOWER(d.tipo_documento) LIKE '%abono%' THEN
                        CASE
                            WHEN (SELECT e2.identificador_fiscal 
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
    ...MY_COMPANY_FISCAL_IDS,
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams
  ]);

  console.log('🔍 [getDashboardAnalytics] IvaRows RAW:', JSON.stringify(ivaRows, null, 2));

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

  console.log('📊 [getDashboardAnalytics] IvaSummary:', JSON.stringify(ivaSummary, null, 2));

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
                            WHEN (SELECT e2.identificador_fiscal 
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
    ...MY_COMPANY_FISCAL_IDS,
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
                            WHEN (SELECT e2.identificador_fiscal 
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
    ...MY_COMPANY_FISCAL_IDS,
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

  const [providerStatsRows] = await db.query<RowDataPacket[]>(`
        SELECT 
            e.nombre,
            e.identificador_fiscal,
            SUM(d.importe_total) as totalSpent,
            COUNT(DISTINCT d.id) as totalDocs,
            MAX(d.fecha_emision) as lastDate
        FROM documentos d
        JOIN entidades_documento e ON d.id = e.documento_id
        WHERE e.rol IN ('proveedor', 'emisor')
          AND d.importe_total > 0 -- Solo gastos positivos
          AND (
              (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
              OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          )
          AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
          ${hasEmpresaFilter ? 'AND d.id_de_empresa IN (?)' : ''}
          ${wherePeriodFilter}
        GROUP BY e.identificador_fiscal, e.nombre
        ORDER BY totalSpent DESC
        LIMIT 5
    `, [
    ...(hasEmpresaFilter ? [empresaIds] : []),
    ...periodQueryParams
  ]);

  const topProviders = providerStatsRows.map(p => ({
    name: p.nombre || 'Desconocido',
    total: Number(p.totalSpent),
    fiscalId: p.identificador_fiscal
  }));

  const analyticsData = {
    kpis: {
      totalIngresos: Number(kpis.totalIngresos || 0),
      totalGastos: Number(kpis.totalGastos || 0),
      totalIngresosSinIva: Number(kpis.totalIngresosSinIva || 0),
      totalGastosSinIva: Number(kpis.totalGastosSinIva || 0),
      beneficio: Number(beneficioConIva),
      beneficioSinIva: Number(beneficioSinIva),
      ivaRepercutido: Number(kpis.ivaRepercutido || 0),
      ivaSoportado: Number(kpis.ivaSoportado || 0),
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
    yearUsed: yearToUse
  };

  console.log('📊 [getDashboardAnalytics] Resultado final:', analyticsData.kpis);

  return JSON.parse(JSON.stringify(analyticsData));
}
// =====================================
// 🆕 AGREGAR AL FINAL DE src/services/document-service.ts
// =====================================


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
    let whereConditions = ['e.id_de_usuario = ?'];
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
        const [empresasInfo] = await conn.query<RowDataPacket[]>(
          'SELECT cif FROM empresas WHERE id IN (?)',
          [empresaIds]
        );
        MY_COMPANY_FISCAL_IDS = empresasInfo.map(e => e.cif).filter(Boolean);
      }
    }

    const cifPlaceholders = MY_COMPANY_FISCAL_IDS.length > 0
      ? MY_COMPANY_FISCAL_IDS.map(() => '?').join(',')
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
          d.trimestre_cerrado,
  d.fecha_cierre_trimestre,
  -- ✅ Identificar si es abono
  (CASE WHEN LOWER(d.tipo_documento) LIKE '%abono%' OR LOWER(d.tipo_documento) LIKE '%crédito%' OR LOWER(d.tipo_documento) LIKE '%credito%' THEN 1 ELSE 0 END) as is_abono,
  -- ✅ Clasificar si es emitida(1) o recibida(0) sin multiplicar filas
  CASE WHEN EXISTS (
    SELECT 1 FROM entidades_documento ed 
    WHERE ed.documento_id = d.id 
      AND ed.rol IN ('emisor', 'proveedor') 
      AND ed.identificador_fiscal IN (${cifPlaceholders})
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
        GROUP BY d.id
      )
SELECT
dt.año_trimestre as año,
  dt.num_trimestre as trimestre,
  dt.id_de_empresa as empresa_id,
  e.nombre_de_empresa as empresa_nombre,
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
             CASE WHEN dt.is_abono = 1 THEN -ABS(dt.importe_sin_impuestos) ELSE dt.importe_sin_impuestos END
          ELSE 0 
        END), 0) as total_ingresos_sin_iva,

  COALESCE(SUM(CASE 
          WHEN dt.is_issued = 0 THEN 
             CASE WHEN dt.is_abono = 1 THEN -ABS(dt.importe_sin_impuestos) ELSE dt.importe_sin_impuestos END
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
      LEFT JOIN empresas e ON dt.id_de_empresa = e.id
      GROUP BY dt.año_trimestre, dt.num_trimestre, dt.id_de_empresa, e.nombre_de_empresa
      ORDER BY dt.año_trimestre DESC, dt.num_trimestre DESC, e.nombre_de_empresa ASC
  `;

    console.log('📝 [getTrimestresList] Query ejecutándose...');
    console.log('📝 [getTrimestresList] Params:', [...MY_COMPANY_FISCAL_IDS, ...params]);

    const [rows] = await conn.query<RowDataPacket[]>(query, [...MY_COMPANY_FISCAL_IDS, ...params]);

    console.log('📊 [getTrimestresList] Filas obtenidas:', rows.length);

    if (rows.length > 0) {
      console.log('🔍 [getTrimestresList] Primera fila:', {
        año: rows[0].año,
        trimestre: rows[0].trimestre,
        empresa: rows[0].empresa_nombre,
        ingresos_con_iva: rows[0].total_ingresos,
        ingresos_sin_iva: rows[0].total_ingresos_sin_iva,
        gastos_con_iva: rows[0].total_gastos,
        gastos_sin_iva: rows[0].total_gastos_sin_iva,
        iva_repercutido: rows[0].iva_repercutido,
        iva_soportado: rows[0].iva_soportado
      });
    }

    let trimestres = rows.map(row => ({
      año: row.año,
      trimestre: row.trimestre,
      empresa_id: row.empresa_id,
      empresa_nombre: row.empresa_nombre || 'Sin empresa',
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
      'e.id_de_usuario = ?',
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
    AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)`);

    const whereClause = whereConditions.join(' AND ');

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
  e.nombre_de_empresa as empresa_nombre,
  e.cif as empresa_cif
      FROM documentos d
      LEFT JOIN empresas e ON d.id_de_empresa = e.id
      WHERE ${whereClause}
      ORDER BY d.fecha_emision DESC
  `;

    console.log('📝 [getDocumentosByTrimestre] Query:', query);
    console.log('📝 [getDocumentosByTrimestre] Params:', params);

    const [documentRows] = await db.query<DocumentPacket[]>(query, params);

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
): Promise<{ affected: number }> {
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
      'e.id_de_usuario = ?',
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

    const [result] = await conn.query<OkPacket>(query, params);

    console.log('✅ [cerrarTrimestre] Documentos actualizados:', result.affectedRows);

    if (result.affectedRows === 0) {
      await conn.rollback();
      console.warn('⚠️ [cerrarTrimestre] No se encontraron documentos para cerrar');
      console.log('═══════════════════════════════════════════════════════════');
      return { affected: 0 };
    }

    // ═══════════════════════════════════════════════════════════
    // PASO 2: Calcular estadísticas para la tabla trimestres
    // ═══════════════════════════════════════════════════════════
    let statsWhereConditions = [
      'e.id_de_usuario = ?',
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
      const [empresasInfo] = await conn.query<RowDataPacket[]>(
        'SELECT cif FROM empresas WHERE id IN (?) AND id_de_usuario = ?',
        [empresaIdsToQuery, userId]
      );
      MY_COMPANY_FISCAL_IDS = empresasInfo.map(e => e.cif).filter(Boolean);
    } else {
      // Si no hay empresa específica, obtener todas del usuario
      const [empresasInfo] = await conn.query<RowDataPacket[]>(
        'SELECT cif FROM empresas WHERE id_de_usuario = ?',
        [userId]
      );
      MY_COMPANY_FISCAL_IDS = empresasInfo.map(e => e.cif).filter(Boolean);
    }

    const cifPlaceholders = MY_COMPANY_FISCAL_IDS.length > 0
      ? MY_COMPANY_FISCAL_IDS.map(() => '?').join(',')
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
              AND ed.identificador_fiscal IN(${cifPlaceholders}) 
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
    console.log('📊 [cerrarTrimestre] Params:', [...MY_COMPANY_FISCAL_IDS, ...statsParams]);

    const [statsRows] = await conn.query<RowDataPacket[]>(statsQuery, [...MY_COMPANY_FISCAL_IDS, ...statsParams]);

    console.log('📊 [cerrarTrimestre] Filas de estadísticas obtenidas:', statsRows.length);

    if (statsRows.length === 0) {
      console.warn('⚠️ [cerrarTrimestre] No se encontraron estadísticas para guardar');
      await conn.rollback();
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

      const [insertResult] = await conn.query<OkPacket>(insertQuery, [
        stats.año,
        stats.trimestre,
        stats.empresa_id,
        stats.total_documentos,
        stats.total_ingresos,        // ✅ CON IVA
        stats.total_gastos,          // ✅ CON IVA
        stats.iva_repercutido,
        stats.iva_soportado
      ]);

      console.log(`✅[cerrarTrimestre] Registro guardado en trimestres(insertId: ${insertResult.insertId}, affectedRows: ${insertResult.affectedRows})`);
    }

    console.log('───────────────────────────────────────────────────────────');
    await conn.commit();
    console.log('🎉 [cerrarTrimestre] TRANSACCIÓN COMPLETADA EXITOSAMENTE');
    console.log('═══════════════════════════════════════════════════════════');

    return { affected: result.affectedRows };
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
    const [result] = await db.query<OkPacket>(
      `INSERT INTO exports
  (id_de_usuario, tipo_export, año_filtro, trimestre_filtro, empresas_ids, documento_ids, total_documentos, filtros_aplicados, estado)
VALUES(?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        payload.userId,
        payload.tipoExport,
        payload.añoFiltro || null,
        payload.trimestreFiltro || null,
        payload.empresasIds ? JSON.stringify(payload.empresasIds) : null,
        payload.documentoIds ? JSON.stringify(payload.documentoIds) : null,
        payload.documentoIds?.length || 0,
        payload.filtrosAplicados ? JSON.stringify(payload.filtrosAplicados) : null
      ]
    );

    return { success: true, exportId: result.insertId };
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
    const fechaCompletado = status === 'completed' ? 'NOW()' : 'NULL';

    await db.query<OkPacket>(
      `UPDATE exports 
       SET estado = ?,
  url_archivo = ?,
  nombre_archivo = ?,
  error_mensaje = ?,
  fecha_completado = ${fechaCompletado}
       WHERE id = ? `,
      [status, urlArchivo || null, nombreArchivo || null, errorMensaje || null, exportId]
    );

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
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT * FROM exports 
       WHERE id_de_usuario = ?
  ORDER BY fecha_generacion DESC 
       LIMIT 50`,
      [userId]
    );

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
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    let query = `
      SELECT DISTINCT e.nombre
      FROM entidades_documento e
      JOIN documentos d ON e.documento_id = d.id
      JOIN empresas emp ON d.id_de_empresa = emp.id
WHERE(e.rol = 'receptor' OR e.rol = 'cliente')
        AND e.nombre IS NOT NULL
        AND e.nombre != ''
        AND emp.id_de_usuario = ?
  `;

    const params: any[] = [user.id];

    // ✅ Filtro por empresas si se especifica
    if (empresaIds && empresaIds.length > 0) {
      const placeholders = empresaIds.map(() => '?').join(',');
      query += ` AND d.id_de_empresa IN(${placeholders})`;
      params.push(...empresaIds);
    }

    query += ` ORDER BY e.nombre ASC`;

    console.log('📝 [getUniqueClients] Query:', query);
    console.log('📝 [getUniqueClients] Params:', params);

    const [rows] = await db.query<RowDataPacket[]>(query, params);

    const clientes = rows.map(r => r.nombre);

    console.log('✅ [getUniqueClients] Clientes encontrados:', clientes.length);

    return clientes;
  } catch (error) {
    console.error('❌ [getUniqueClients] Error:', error);
    return [];
  }
}

/**
 * Obtiene lista única de proveedores para filtros (NOMBRES, no entities)
 * ✅ REEMPLAZA la función existente getUniqueProviders() que retorna DocumentEntity[]
 */
export async function getUniqueProvidersNames(empresaIds?: number[]): Promise<string[]> {
  try {
    const user = await getCurrentUser();
    if (!user) return [];

    let query = `
      SELECT DISTINCT e.nombre
      FROM entidades_documento e
      JOIN documentos d ON e.documento_id = d.id
      JOIN empresas emp ON d.id_de_empresa = emp.id
WHERE(e.rol = 'proveedor' OR e.rol = 'emisor')
        AND e.nombre IS NOT NULL
        AND e.nombre != ''
        AND emp.id_de_usuario = ?
  `;

    const params: any[] = [user.id];

    // ✅ Filtro por empresas si se especifica
    if (empresaIds && empresaIds.length > 0) {
      const placeholders = empresaIds.map(() => '?').join(',');
      query += ` AND d.id_de_empresa IN(${placeholders})`;
      params.push(...empresaIds);
    }

    query += ` ORDER BY e.nombre ASC`;

    console.log('📝 [getUniqueProvidersNames] Query:', query);
    console.log('📝 [getUniqueProvidersNames] Params:', params);

    const [rows] = await db.query<RowDataPacket[]>(query, params);

    const proveedores = rows.map(r => r.nombre);

    console.log('✅ [getUniqueProvidersNames] Proveedores encontrados:', proveedores.length);

    return proveedores;
  } catch (error) {
    console.error('❌ [getUniqueProvidersNames] Error:', error);
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
        AND emp.id_de_usuario = ?
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

    // Primero borramos dependencias
    await connection.query('DELETE FROM archivos_documento WHERE documento_id IN (?)', [ids]);
    await connection.query('DELETE FROM entidades_documento WHERE documento_id IN (?)', [ids]);
    await connection.query('DELETE FROM lineas_documento WHERE documento_id IN (?)', [ids]);
    await connection.query('DELETE FROM impuestos_documento WHERE documento_id IN (?)', [ids]);
    await connection.query('DELETE FROM incidencias_documento WHERE documento_id IN (?)', [ids]);

    // Finalmente el documento
    const [result] = await connection.query<OkPacket>(`
        DELETE d FROM documentos d 
        LEFT JOIN empresas e ON d.id_de_empresa = e.id 
        WHERE d.id IN(?)
AND(e.id_de_usuario = ? OR d.id_de_empresa IS NULL)
    `, [ids, userId]);

    console.log(`✅[deleteDocuments] Eliminados: ${result.affectedRows} `);

    await connection.commit();
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