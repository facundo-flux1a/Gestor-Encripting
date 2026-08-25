import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { prisma } from '@/lib/prisma';
import { extractRetencionFromImpuestos } from '@/lib/tax-helpers';
import { formatEntityData, buildFileUrl, formatDocumentLine, parseFlexibleDate } from '@/lib/api-v1-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/documents/full
 *
 * Autenticación (header obligatorio):
 *   X-Api-Key: flux_xxxxx
 *
 * Query Parameters (opcionales):
 *   ?desde_id=8627                  (cursor incremental)
 *   &modificados_desde=2026-08-24   (modificados desde fecha)
 *   &limit=500                      (máximo 1000)
 *   &trimestre=3
 *   &año=2025
 *   &proveedor=García
 *   &cliente=Pérez
 *   &tipo=recibidas (emitidas | recibidas | todas)
 *   &incluir_incidencias=true (true | false - default: false)
 *   &incluir_sin_verificar=true (true | false - default: false)
 *   &incluir_sin_confirmar=true (true | false - default: false)
 *
 * Respuesta: JSON con la lista completa de documentos enriquecidos con todas sus relaciones.
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Extraer API Key del header
    const rawKey = request.headers.get('x-api-key') || '';

    if (!rawKey) {
      return NextResponse.json(
        { error: 'Header X-Api-Key requerido.' },
        { status: 401 }
      );
    }

    // 2. Validar la clave
    const authResult = await validateApiKey(rawKey);
    if (!authResult.valid || !authResult.empresa_id) {
      return NextResponse.json(
        { error: 'API Key inválida o revocada.' },
        { status: 401 }
      );
    }

    const empresaId = authResult.empresa_id;

    // 3. Leer filtros de la URL
    const searchParams = request.nextUrl.searchParams;
    const desdeIdParam = searchParams.get('desde_id');
    const modificadosDesdeParam = searchParams.get('modificados_desde') || searchParams.get('modificado_desde');
    const limitParam = searchParams.get('limit');
    const trimestreParam = searchParams.get('trimestre');
    const añoParam = searchParams.get('año') ?? searchParams.get('ano');
    const proveedorParam = searchParams.get('proveedor');
    const clienteParam = searchParams.get('cliente');
    const tipoParam = searchParams.get('tipo') || 'todas';

    // Parámetros de inclusión opcionales (por defecto false)
    const incluirIncidencias = searchParams.get('incluir_incidencias') === 'true';
    const incluirSinVerificar = searchParams.get('incluir_sin_verificar') === 'true';
    const incluirSinConfirmar = searchParams.get('incluir_sin_confirmar') === 'true';

    const desdeId = desdeIdParam ? Number(desdeIdParam) : null;
    const limit = Math.min(Math.max(limitParam ? Number(limitParam) : 500, 1), 1000);
    const trimestre = trimestreParam ? Number(trimestreParam) : null;
    const año = añoParam ? Number(añoParam) : null;
    const proveedor = proveedorParam?.trim() || null;
    const cliente = clienteParam?.trim() || null;
    const tipo = tipoParam.toLowerCase() as 'emitidas' | 'recibidas' | 'todas';

    // Validaciones básicas
    if (desdeId !== null && (isNaN(desdeId) || desdeId < 0)) {
      return NextResponse.json({ error: '"desde_id" debe ser un número entero positivo.' }, { status: 400 });
    }
    if (trimestre !== null && (trimestre < 1 || trimestre > 4)) {
      return NextResponse.json({ error: '"trimestre" debe ser 1, 2, 3 o 4.' }, { status: 400 });
    }
    if (!['emitidas', 'recibidas', 'todas'].includes(tipo)) {
      return NextResponse.json(
        { error: '"tipo" debe ser "emitidas", "recibidas" o "todas".' },
        { status: 400 }
      );
    }

    // 4. Construir query de documentos principal
    let query = `
      SELECT
        d.*
      FROM documentos d
      WHERE d.id_de_empresa = ?
    `;
    const params: any[] = [empresaId];

    // Semáforo incremental: ?desde_id=
    if (desdeId !== null) {
      query += ` AND d.id > ?`;
      params.push(desdeId);
    }

    // Filtro por modificación: ?modificados_desde=
    if (modificadosDesdeParam) {
      const modDate = parseFlexibleDate(modificadosDesdeParam);
      if (modDate && !isNaN(modDate.getTime())) {
        query += ` AND (d.fecha_creacion >= ? OR d.id IN (SELECT documento_id FROM documentos_auditoria WHERE fecha_accion >= ?))`;
        params.push(modDate, modDate);
      }
    }

    // Aplicar filtros de tipo de documento
    if (incluirSinConfirmar) {
      query += ` AND (
        LOWER(d.tipo_documento) LIKE '%factura%'
        OR LOWER(d.tipo_documento) LIKE '%abono%'
        OR LOWER(d.tipo_documento) LIKE '%nota%cr%dito%'
        OR LOWER(d.tipo_documento) LIKE '%nota%credito%'
      )`;
    } else {
      query += ` AND (
        (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%nota%cr%dito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        OR (LOWER(d.tipo_documento) LIKE '%nota%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
      )`;
    }

    // Aplicar filtros de validación
    if (!incluirIncidencias) {
      query += ` AND d.id NOT IN (
        SELECT documento_id FROM incidencias_documento WHERE validado = 0
      )`;
    }

    if (!incluirSinVerificar) {
      query += ` AND d.id NOT IN (
        SELECT documento_id FROM health_check_status WHERE verified = 0
      )`;
    }

    if (trimestre !== null) {
      query += ` AND d.num_trimestre = ?`;
      params.push(trimestre);
    }

    if (año) {
      query += ` AND d.año_trimestre = ?`;
      params.push(año);
    }

    query += ` ORDER BY d.id ASC LIMIT ?`;
    params.push(limit);

    const [documentos] = await db.query<RowDataPacket[]>(query, params);

    if (documentos.length === 0) {
      return NextResponse.json({ total: 0, data: [] }, { status: 200 });
    }

    const docIds = documentos.map((d: any) => d.id);

    // 5. Cargar relaciones
    const [
      [lineasRows],
      [impuestosRows],
      [incidenciasRows],
      [healthCheckRows]
    ] = await Promise.all([
      db.query<RowDataPacket[]>(`SELECT * FROM lineas_documento WHERE documento_id IN (?)`, [docIds]),
      db.query<RowDataPacket[]>(`SELECT * FROM impuestos_documento WHERE documento_id IN (?)`, [docIds]),
      db.query<RowDataPacket[]>(`SELECT * FROM incidencias_documento WHERE documento_id IN (?)`, [docIds]),
      db.query<RowDataPacket[]>(`SELECT * FROM health_check_status WHERE documento_id IN (?)`, [docIds])
    ]);

    // Prisma fetches encrypted tables natively
    const [entidadesRows, archivosRows, empresaData] = await Promise.all([
      prisma.entidades_documento.findMany({ where: { documento_id: { in: docIds } } }),
      prisma.archivos_documento.findMany({ where: { documento_id: { in: docIds } } }),
      prisma.empresas.findUnique({ where: { id: empresaId }, select: { CIF: true, nombre_de_empresa: true } })
    ]);
    const empresaCifGlobal = empresaData?.CIF?.trim().toLowerCase() || '';

    // 6. Agrupar entidades con formateo estandarizado
    const entidadesByDoc: Record<number, Record<string, any>> = {};
    entidadesRows.forEach((r: any) => {
      const docId = Number(r.documento_id);
      if (!entidadesByDoc[docId]) {
        entidadesByDoc[docId] = {};
      }
      entidadesByDoc[docId][r.rol] = formatEntityData(r);
    });

    // 7. Agrupar impuestos
    const impuestosByDoc: Record<number, any[]> = {};
    impuestosRows.forEach((r: any) => {
      if (!impuestosByDoc[r.documento_id]) {
        impuestosByDoc[r.documento_id] = [];
      }
      impuestosByDoc[r.documento_id].push({
        id: r.id,
        tipo_impuesto: r.tipo_impuesto,
        porcentaje: Number(r.porcentaje) || 0,
        base_imponible: Number(r.base_imponible) || 0,
        cuota: Number(r.cuota) || 0,
        total_con_impuesto: Number(r.total_con_impuesto) || 0,
        fecha_creacion: r.fecha_creacion
      });
    });

    // 8. Agrupar líneas con códigos e IVA
    const lineasByDoc: Record<number, any[]> = {};
    lineasRows.forEach((r: any) => {
      if (!lineasByDoc[r.documento_id]) {
        lineasByDoc[r.documento_id] = [];
      }
      const docImpuestos = impuestosByDoc[r.documento_id] || [];
      lineasByDoc[r.documento_id].push(formatDocumentLine(r, docImpuestos));
    });

    // 9. Agrupar archivos y generar enlaces públicos sin prefijos duplicados
    const archivosByDoc: Record<number, any[]> = {};
    archivosRows.forEach((r: any) => {
      const docId = Number(r.documento_id);
      if (!archivosByDoc[docId]) {
        archivosByDoc[docId] = [];
      }

      const publicUrl = buildFileUrl(r.ruta_archivo);

      archivosByDoc[docId].push({
        id: Number(r.id),
        tipo_archivo: r.tipo_archivo,
        nombre_archivo: r.nombre_archivo,
        hash_archivo: r.hash_archivo,
        ruta_archivo: r.ruta_archivo,
        fecha_subida: r.fecha_subida,
        url_archivo: publicUrl
      });
    });

    // 10. Agrupar incidencias
    const incidenciasByDoc: Record<number, any[]> = {};
    incidenciasRows.forEach((r: any) => {
      if (!incidenciasByDoc[r.documento_id]) {
        incidenciasByDoc[r.documento_id] = [];
      }
      incidenciasByDoc[r.documento_id].push({
        id: Number(r.id),
        incidencia: !!r.incidencia,
        fecha_incidencia: r.fecha_incidencia,
        descripcion: r.descripcion,
        validado: !!r.validado,
        fecha_validacion: r.fecha_validacion,
        validado_por: r.validado_por,
        usuario_validado_id: r.usuario_validado_id,
        observaciones_validacion: r.observaciones_validacion,
        fecha_creacion: r.fecha_creacion,
        fecha_actualizacion: r.fecha_actualizacion
      });
    });

    // 11. Agrupar health check status
    const healthCheckByDoc: Record<number, any> = {};
    healthCheckRows.forEach((r: any) => {
      healthCheckByDoc[r.documento_id] = {
        verified: !!r.verified,
        created_at: r.created_at,
        check_type: r.check_type,
        motivo: r.motivo
      };
    });

    // 12. Enriquecer y formatear documentos
    let enriched = documentos.map((doc: any) => {
      const docId = doc.id;
      const entities = entidadesByDoc[docId] || {};
      
      const emisorCif = (entities.emisor?.cif || entities.proveedor?.cif || '').trim().toLowerCase();
      const isIssued = !!(empresaCifGlobal && emisorCif && emisorCif === empresaCifGlobal);

      const docArchivos = archivosByDoc[docId] || [];
      const publicUrl = docArchivos.length > 0 ? docArchivos[0].url_archivo : null;

      const impuestos = impuestosByDoc[docId] || [];
      const retencion = extractRetencionFromImpuestos(impuestos);

      const fechaCreacionIso = doc.fecha_creacion ? new Date(doc.fecha_creacion).toISOString() : null;

      return {
        id: doc.id,
        file_hash: doc.file_hash,
        tipo_documento: doc.tipo_documento,
        numero_documento: doc.numero_documento,
        fecha_emision: doc.fecha_emision,
        fecha_vencimiento: doc.fecha_vencimiento,
        actualizado_en: fechaCreacionIso,
        importe_total: Number(doc.importe_total) || 0,
        importe_sin_impuestos: Number(doc.importe_sin_impuestos) || 0,
        moneda: doc.moneda,
        observaciones: doc.observaciones,
        datos_extra: doc.datos_extra,
        fecha_creacion: doc.fecha_creacion,
        id_de_empresa: doc.id_de_empresa != null ? Number(doc.id_de_empresa) : null,
        is_new: doc.is_new,
        trimestre_cerrado: !!doc.trimestre_cerrado,
        enviado_sii: !!doc.enviado_sii,
        fecha_cierre_trimestre: doc.fecha_cierre_trimestre,
        año: doc.año_trimestre,
        trimestre: doc.num_trimestre,
        retencion,
        canal_carga: doc['dashboard-correo'],
        is_issued: isIssued,
        url_archivo: publicUrl,
        entidades: entities,
        impuestos,
        lineas_detalle: lineasByDoc[docId] || [],
        archivos: docArchivos,
        incidencias: incidenciasByDoc[docId] || [],
        health_check: healthCheckByDoc[docId] || null
      };
    });

    // Filtrar por flujo (emitidas/recibidas) en memoria después de calcular is_issued
    if (tipo !== 'todas') {
      enriched = enriched.filter((doc: any) =>
        tipo === 'emitidas' ? doc.is_issued : !doc.is_issued
      );
    }

    // Filtrar en memoria por proveedor/cliente (partial match)
    if (proveedor) {
      const term = proveedor.toLowerCase();
      enriched = enriched.filter((doc: any) => {
        const emisor = doc.entidades.emisor || doc.entidades.proveedor;
        if (!emisor) return false;
        return (emisor.nombre?.toLowerCase().includes(term) || emisor.cif?.toLowerCase().includes(term));
      });
    }

    if (cliente) {
      const term = cliente.toLowerCase();
      enriched = enriched.filter((doc: any) => {
        const receptor = doc.entidades.receptor || doc.entidades.cliente;
        if (!receptor) return false;
        return (receptor.nombre?.toLowerCase().includes(term) || receptor.cif?.toLowerCase().includes(term));
      });
    }

    return NextResponse.json(
      {
        total: enriched.length,
        data: enriched
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('❌ [GET /api/v1/documents/full] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
