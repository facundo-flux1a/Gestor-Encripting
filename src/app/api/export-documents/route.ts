import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { createExport } from '@/services/document-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'No autenticado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { empresaIds, año, trimestre, status, search, documentIds } = body;

    console.log('📤 [export-documents] Iniciando exportación:', { empresaIds, año, trimestre, status, search, documentIds: documentIds?.length });

    let documentos: RowDataPacket[] = [];

    // Exportación por IDs seleccionados (bulk bar)
    if (documentIds && Array.isArray(documentIds) && documentIds.length > 0) {
      const placeholders = documentIds.map(() => '?').join(',');
      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT 
          d.id, d.id_de_empresa, d.tipo_documento, d.numero_documento,
          d.fecha_emision, d.fecha_vencimiento, d.fecha_creacion,
          d.importe_total, d.importe_sin_impuestos, d.moneda, d.observaciones,
          d.año_trimestre, d.num_trimestre, d.trimestre_cerrado, d.datos_extra,
          EXISTS(SELECT 1 FROM incidencias_documento i WHERE i.documento_id = d.id AND i.validado = 0) AS tiene_incidencia
        FROM documentos d
        WHERE d.id IN (${placeholders})
        ORDER BY d.fecha_emision DESC`,
        documentIds
      );
      documentos = rows;
    } else {
    // ✅ Query base — solo columnas de la tabla documentos (sin JOINs a tablas encriptadas)
    let query = `
      SELECT 
        d.id,
        d.id_de_empresa,
        d.tipo_documento,
        d.numero_documento,
        d.fecha_emision,
        d.fecha_vencimiento,
        d.fecha_creacion,
        d.importe_total,
        d.importe_sin_impuestos,
        d.moneda,
        d.observaciones,
        d.año_trimestre,
        d.num_trimestre,
        d.trimestre_cerrado,
        d.datos_extra,
        EXISTS(SELECT 1 FROM incidencias_documento i WHERE i.documento_id = d.id AND i.validado = 0) AS tiene_incidencia
      FROM documentos d
      WHERE 1=1
        AND (
            (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%nota%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%nota%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        )
        AND d.id NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    `;

    const params: any[] = [];

    if (empresaIds && empresaIds.length > 0) {
      query += ` AND d.id_de_empresa IN (?)`;
      params.push(empresaIds);
    }

    if (año !== null && año !== undefined && trimestre !== null && trimestre !== undefined) {
      query += ` AND d.año_trimestre = ? AND d.num_trimestre = ?`;
      params.push(año, trimestre);
    }

    if (status) {
      switch (status) {
        case 'pending':
          query += ` AND LOWER(d.tipo_documento) LIKE '%sin confirmar%'`;
          break;
        case 'confirmed':
          query += ` AND LOWER(d.tipo_documento) NOT LIKE '%sin confirmar%'`;
          break;
        case 'incidents':
          query += ` AND EXISTS(SELECT 1 FROM incidencias_documento i WHERE i.documento_id = d.id AND i.validado = 0)`;
          break;
      }
    }

    // ⚠️ Búsqueda por texto: no podemos buscar dentro de nombre_de_empresa encriptado via SQL.
    // Solo buscamos en campos no encriptados de documentos.
    if (search && search.trim() !== '') {
      query += ` AND (
        d.numero_documento LIKE ? OR
        d.tipo_documento LIKE ? OR
        d.observaciones LIKE ?
      )`;
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY d.fecha_emision DESC`;

    const [rows] = await db.query<RowDataPacket[]>(query, params);
    documentos = rows;
    }

    console.log('📊 [export-documents] Documentos encontrados:', documentos.length);

    if (documentos.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron documentos para exportar' },
        { status: 400 }
      );
    }

    const documentoIds = documentos.map((d: any) => BigInt(d.id));

    // ✅ Hidratar nombres de empresa con Prisma (desencripta automáticamente)
    const uniqueEmpresaIds = [...new Set(documentos.map((d: any) => BigInt(d.id_de_empresa)).filter(Boolean))];
    const empresasData = uniqueEmpresaIds.length > 0
      ? await prisma.empresas.findMany({
          where: { id: { in: uniqueEmpresaIds } },
          select: { id: true, nombre_de_empresa: true, CIF: true }
        })
      : [];
    const empresaMap = new Map(empresasData.map(e => [Number(e.id), { nombre: e.nombre_de_empresa || '', cif: e.CIF || '' }]));

    // ✅ Hidratar entidades (proveedores/clientes) con Prisma (desencripta automáticamente)
    const entidades = documentoIds.length > 0
      ? await prisma.entidades_documento.findMany({
          where: { documento_id: { in: documentoIds } }
        })
      : [];

    // Agrupar entidades por documento_id
    const entidadesByDoc = new Map<number, typeof entidades>();
    for (const ent of entidades) {
      const docId = Number(ent.documento_id);
      if (!entidadesByDoc.has(docId)) entidadesByDoc.set(docId, []);
      entidadesByDoc.get(docId)!.push(ent);
    }

    // ✅ IVA desde impuestos_documento (nombre correcto de la tabla)
    const [ivaDetails] = documentoIds.length > 0
      ? await db.query<RowDataPacket[]>(
          `SELECT documento_id, tipo_impuesto, porcentaje, base_imponible, cuota
           FROM impuestos_documento
           WHERE documento_id IN (?)`,
          [documentos.map((d: any) => d.id)]
        )
      : [[]];

    const ivaByDocument: { [key: number]: any[] } = {};
    (ivaDetails as any[]).forEach((iva: any) => {
      if (!ivaByDocument[iva.documento_id]) ivaByDocument[iva.documento_id] = [];
      ivaByDocument[iva.documento_id].push(iva);
    });

    // ✅ Calcular totales
    const totales = {
      totalDocumentos: documentos.length,
      totalBaseImponible: 0,
      totalIva: 0,
      totalImporte: 0,
      totalIngresos: 0,
      totalGastos: 0,
      totalIncidencias: 0,
      porTipoDocumento: {} as { [key: string]: number }
    };

    documentos.forEach((doc: any) => {
      const total = parseFloat(doc.importe_total) || 0;
      const base = parseFloat(doc.importe_sin_impuestos) || 0;
      const iva = total - base;

      const docEntidades = entidadesByDoc.get(doc.id) || [];
      const emisor = docEntidades.find(e => e.rol === 'emisor' || e.rol === 'proveedor');
      const empresaInfo = empresaMap.get(doc.id_de_empresa);

      // Determinar si es emitida (la empresa del sistema es el emisor)
      const emisorFiscal = emisor?.identificador_fiscal?.trim().toLowerCase();
      const empresaCif = empresaInfo?.cif?.trim().toLowerCase();
      const isIssued = !!(emisorFiscal && empresaCif && emisorFiscal === empresaCif);

      const tipo = doc.tipo_documento?.toLowerCase() || '';
      const isAbono = tipo.includes('abono') || tipo.includes('crédito') || tipo.includes('credito') || total < 0;

      totales.totalBaseImponible += base;
      totales.totalIva += iva;
      totales.totalImporte += total;

      if (isIssued) {
        totales.totalIngresos += isAbono ? -Math.abs(total) : total;
      } else {
        totales.totalGastos += isAbono ? -Math.abs(total) : total;
      }

      if (doc.tiene_incidencia === 1) totales.totalIncidencias++;

      const tipoDoc = doc.tipo_documento || 'Sin tipo';
      totales.porTipoDocumento[tipoDoc] = (totales.porTipoDocumento[tipoDoc] || 0) + 1;
    });

    // ✅ Crear registro en BD
    const exportResult = await createExport({
      userId: user.id,
      tipoExport: 'documentos',
      añoFiltro: año || null,
      trimestreFiltro: trimestre || null,
      empresasIds: empresaIds || [],
      documentoIds: documentos.map((d: any) => d.id),
      filtrosAplicados: { empresaIds, año, trimestre, status, search }
    });

    if (!exportResult.success || !exportResult.exportId) {
      return NextResponse.json(
        { error: exportResult.error || 'Error al crear exportación' },
        { status: 500 }
      );
    }

    // ✅ Generar nombre de archivo
    const primeraEmpresa = empresaMap.get(documentos[0]?.id_de_empresa)?.nombre || 'Documentos';
    const empresaNombreLimpio = primeraEmpresa.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
    const fechaActual = new Date().toISOString().split('T')[0];
    const statusLabel = status === 'pending' ? 'Pendientes' :
      status === 'incidents' ? 'Incidencias' :
        status === 'confirmed' ? 'Confirmados' : 'Todos';

    let nombreArchivo = `Documentos_${statusLabel}_${empresaNombreLimpio}_${fechaActual}`;
    if (año && trimestre) {
      nombreArchivo = `Documentos_${statusLabel}_${año}_T${trimestre}_${empresaNombreLimpio}_${fechaActual}`;
    }
    nombreArchivo += '.pdf';

    const microserviceWebhookUrl = 'https://agent.flux1a.com.ar/webhook/19aedb0e-661d-429a-b84b-1db75a18cfae';

    const webhookPayload = {
      exportId: exportResult.exportId,
      userId: user.id,
      userEmail: user.email,
      tipo: 'documentos',
      nombreArchivo,
      filtros: { empresaIds, año, trimestre, status, search },
      resumen: totales,
      documentos: documentos.map((d: any) => {
        const docEntidades = entidadesByDoc.get(d.id) || [];
        const emisor = docEntidades.find(e => e.rol === 'emisor' || e.rol === 'proveedor');
        const cliente = docEntidades.find(e => e.rol === 'cliente' || e.rol === 'receptor');
        const empresaInfo = empresaMap.get(d.id_de_empresa);

        return {
          id: d.id,
          tipo: d.tipo_documento,
          numero: d.numero_documento,
          fecha_emision: d.fecha_emision,
          fecha_vencimiento: d.fecha_vencimiento,
          fecha_creacion: d.fecha_creacion,
          importe_total: d.importe_total,
          importe_sin_iva: d.importe_sin_impuestos,
          base_imponible: d.importe_sin_impuestos,
          moneda: d.moneda,
          concepto: d.observaciones,
          empresa: empresaInfo?.nombre || '',
          empresa_cif: empresaInfo?.cif || '',
          trimestre: d.num_trimestre,
          año: d.año_trimestre,
          trimestre_cerrado: d.trimestre_cerrado,
          incidencia: d.tiene_incidencia === 1,
          incidencia_razon: '',
          emisor: emisor?.nombre || '',
          emisor_cif: emisor?.identificador_fiscal || '',
          cliente: cliente?.nombre || '',
          cliente_cif: cliente?.identificador_fiscal || '',
          iva_details: ivaByDocument[d.id] || []
        };
      }),
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/export-callback`
    };

    console.log('🚀 [export-documents] Enviando a Microservice:', { documentos: documentos.length, totales });

    fetch(microserviceWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(webhookPayload)
    }).catch(err => {
      console.error('❌ Error enviando a Microservice:', err);
    });

    try {
      const { logAuditAction } = await import('@/services/audit-service');
      await logAuditAction({
        empresaId: empresaIds && empresaIds.length > 0 ? Number(empresaIds[0]) : undefined,
        accion: 'EXPORTACION_DATOS',
        usuarioEmail: user.email,
        userId: user.id,
        detalle: { 
          tipo: 'documentos', 
          año, 
          trimestre,
          status,
          exportId: exportResult.exportId 
        }
      });
    } catch (auditErr) {
      console.warn('⚠️ Error registrando auditoría EXPORTACION_DATOS:', auditErr);
    }

    return NextResponse.json({
      success: true,
      exportId: exportResult.exportId,
      message: 'Exportación iniciada. Te notificaremos cuando esté lista.'
    });

  } catch (error) {
    console.error('❌ [export-documents] Error:', error);
    return NextResponse.json(
      { error: 'Error al iniciar exportación' },
      { status: 500 }
    );
  }
}