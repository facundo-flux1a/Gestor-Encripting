import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/services/api-key-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { prisma } from '@/lib/prisma';
import { extractRetencionFromImpuestos } from '@/lib/tax-helpers';
import { formatEntityData, buildFileUrl, formatDocumentLine, parseFlexibleDate } from '@/lib/api-v1-helpers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/documents
 *
 * Autenticación (header obligatorio):
 *   X-Api-Key: flux_xxxxx
 *
 * Query Parameters (opcionales):
 *   ?desde_id=8627                  (paginación por cursor incremental)
 *   &modificados_desde=2026-08-24   (facturas modificadas desde fecha)
 *   &limit=100                      (límite de resultados, por defecto 500, max 1000)
 *   &trimestre=3
 *   &año=2026
 *   &proveedor=García
 *   &cliente=Pérez
 *   &tipo=recibidas (emitidas | recibidas | todas)
 *
 * Respuesta: JSON con la lista de documentos, impuestos, líneas y URL de archivo.
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
        d.id AS doc_id,
        d.tipo_documento,
        d.numero_documento,
        d.fecha_emision,
        d.fecha_vencimiento,
        d.importe_total,
        d.importe_sin_impuestos,
        d.moneda,
        d.observaciones,
        d.año_trimestre,
        d.num_trimestre,
        d.trimestre_cerrado,
        d.fecha_creacion
      FROM documentos d
      WHERE d.id_de_empresa = ?
        AND (
          (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
          OR (LOWER(d.tipo_documento) LIKE '%nota%cr%dito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        )
        AND d.id NOT IN (
          SELECT documento_id FROM incidencias_documento WHERE validado = 0
        )
        AND d.id NOT IN (
          SELECT documento_id FROM health_check_status WHERE verified = 0
        )
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

    if (trimestre !== null) {
      query += ` AND d.num_trimestre = ?`;
      params.push(trimestre);
    }

    if (año) {
      query += ` AND d.año_trimestre = ?`;
      params.push(Number(año));
    }

    // Ordenamiento por ID creciente para paginación por cursor fiable
    query += ` GROUP BY d.id ORDER BY d.id ASC LIMIT ?`;
    params.push(limit);

    const [documentos] = await db.query<RowDataPacket[]>(query, params);

    if (documentos.length === 0) {
      return NextResponse.json({ total: 0, data: [] }, { status: 200 });
    }

    const docIds = documentos.map((d: any) => d.doc_id);

    // 5. Cargar impuestos de todos los documentos
    const [ivaRows] = await db.query<RowDataPacket[]>(
      `SELECT documento_id, tipo_impuesto, porcentaje, base_imponible, cuota
       FROM impuestos_documento WHERE documento_id IN (?)`,
      [docIds]
    );

    const ivaByDoc: Record<number, any[]> = {};
    ivaRows.forEach((r: any) => {
      if (!ivaByDoc[r.documento_id]) ivaByDoc[r.documento_id] = [];
      ivaByDoc[r.documento_id].push(r);
    });

    // 6. Cargar líneas de todos los documentos
    const [lineasRows] = await db.query<RowDataPacket[]>(
      `SELECT id, documento_id, codigo, descripcion, cantidad, unidad, precio_unitario, descuento_porcentaje, precio_neto, importe_linea, datos_extra
       FROM lineas_documento WHERE documento_id IN (?)`,
      [docIds]
    );

    const lineasByDoc: Record<number, any[]> = {};
    lineasRows.forEach((r: any) => {
      if (!lineasByDoc[r.documento_id]) lineasByDoc[r.documento_id] = [];
      const docImpuestos = ivaByDoc[r.documento_id] || [];
      lineasByDoc[r.documento_id].push(formatDocumentLine(r, docImpuestos));
    });

    // 6.5 Cargar entidades completas usando Prisma para desencriptación transparente
    const entidadesPrisma = await prisma.entidades_documento.findMany({
      where: { documento_id: { in: docIds } },
      select: {
        documento_id: true,
        rol: true,
        nombre: true,
        identificador_fiscal: true,
        direccion: true,
        telefono: true,
        email: true,
        cuenta_contable: true,
        datos_extra: true
      }
    });

    const entidadesByDoc: Record<number, Record<string, any>> = {};
    entidadesPrisma.forEach((ent) => {
      const docId = Number(ent.documento_id);
      if (!entidadesByDoc[docId]) entidadesByDoc[docId] = {};
      if (ent.rol) {
        entidadesByDoc[docId][ent.rol] = formatEntityData(ent);
      }
    });

    // 6.6 Cargar archivos usando Prisma
    const archivosPrisma = await prisma.archivos_documento.findMany({
      where: { documento_id: { in: docIds } },
      select: { documento_id: true, ruta_archivo: true }
    });

    const archivoByDoc: Record<number, string> = {};
    archivosPrisma.forEach((archivo) => {
      if (archivo.ruta_archivo) {
        archivoByDoc[Number(archivo.documento_id)] = archivo.ruta_archivo;
      }
    });

    // 6.7 Cargar empresa para calcular clasificación emitida / recibida
    const empresa = await prisma.empresas.findUnique({
      where: { id: empresaId },
      select: { CIF: true }
    });
    const empresaCif = empresa?.CIF?.trim().toLowerCase() || '';

    // 7. Enriquecer documentos
    let enriched = documentos.map((doc: any) => {
      const entidades = entidadesByDoc[doc.doc_id] || {};

      const emisorCif = (entidades.emisor?.cif || entidades.proveedor?.cif || '').trim().toLowerCase();
      const isIssued = !!(empresaCif && emisorCif && emisorCif === empresaCif);

      const docRutaArchivo = archivoByDoc[doc.doc_id];
      const publicUrl = buildFileUrl(docRutaArchivo);

      const impuestos = ivaByDoc[doc.doc_id] || [];
      const retencion = extractRetencionFromImpuestos(impuestos);

      const fechaCreacionIso = doc.fecha_creacion ? new Date(doc.fecha_creacion).toISOString() : null;

      return {
        id: doc.doc_id,
        tipo_documento: doc.tipo_documento,
        numero_documento: doc.numero_documento,
        fecha_emision: doc.fecha_emision,
        fecha_vencimiento: doc.fecha_vencimiento,
        actualizado_en: fechaCreacionIso,
        importe_total: Number(doc.importe_total) || 0,
        importe_sin_impuestos: Number(doc.importe_sin_impuestos) || 0,
        moneda: doc.moneda,
        observaciones: doc.observaciones,
        trimestre: doc.num_trimestre,
        año: doc.año_trimestre,
        retencion,
        entidades: entidades,
        is_issued: isIssued,
        url_archivo: publicUrl,
        impuestos,
        lineas_detalle: lineasByDoc[doc.doc_id] || [],
      };
    });

    // 8. Filtrar por tipo si se especifica
    if (tipo !== 'todas') {
      enriched = enriched.filter((doc: any) =>
        tipo === 'emitidas' ? doc.is_issued : !doc.is_issued
      );
    }

    // 9. Filtrar en memoria por proveedor/cliente (partial match)
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
    console.error('❌ [GET /api/v1/documents] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
