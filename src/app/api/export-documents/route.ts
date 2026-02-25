import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { createExport } from '@/services/document-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

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
    const { empresaIds, año, trimestre, status, search } = body;

    console.log('📤 [export-documents] Iniciando exportación:', { empresaIds, año, trimestre, status, search });

    // ✅ Construir query para obtener documentos
    let query = `
      SELECT 
        d.id_documento,
        d.tipo_documento,
        d.numero_documento,
        d.fecha_emision,
        d.fecha_vencimiento,
        d.fecha_creacion,
        d.importe_total,
        d.importe_sin_impuestos,
        d.moneda,
        d.observaciones,
        d.proveedor,
        d.cif,
        d.año_trimestre,
        d.num_trimestre,
        d.trimestre_cerrado,
        d.incidencia,
        d.incidencia_razon,
        d.datos_extra,
        e.nombre_de_empresa,
        e.cif as empresa_cif,
        GROUP_CONCAT(
          DISTINCT CONCAT(
            ent.rol, ':', 
            COALESCE(ent.nombre, ''), '|',
            COALESCE(ent.cif, '')
          ) SEPARATOR ';'
        ) as entidades_data
      FROM documentos d
      LEFT JOIN empresas e ON d.id_de_empresa = e.id
      LEFT JOIN documento_entidades de ON d.id_documento = de.id_documento
      LEFT JOIN entidades ent ON de.id_entidad = ent.id_entidad
      WHERE 1=1
        AND (
            (LOWER(d.tipo_documento) LIKE '%factura%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%abono%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%nota%crédito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%nota%credito%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
            OR (LOWER(d.tipo_documento) LIKE '%albar%' AND LOWER(d.tipo_documento) NOT LIKE '%(sin confirmar)%')
        )
        AND d.id_documento NOT IN (SELECT documento_id FROM incidencias_documento WHERE validado = 0)
    `;

    const params: any[] = [];

    // Filtrar por empresa
    if (empresaIds && empresaIds.length > 0) {
      query += ` AND d.id_de_empresa IN (?)`;
      params.push(empresaIds);
    }

    // Filtrar por año y trimestre
    if (año !== null && año !== undefined && trimestre !== null && trimestre !== undefined) {
      query += ` AND d.año_trimestre = ? AND d.num_trimestre = ?`;
      params.push(año, trimestre);
    }

    // Filtrar por status (tab)
    if (status) {
      switch (status) {
        case 'pending':
          query += ` AND LOWER(d.tipo_documento) LIKE '%sin confirmar%'`;
          break;
        case 'confirmed':
          query += ` AND LOWER(d.tipo_documento) NOT LIKE '%sin confirmar%'`;
          break;
        case 'incidents':
          query += ` AND d.incidencia = 1`;
          break;
        // 'all' no agrega filtro adicional
      }
    }

    // Filtrar por búsqueda
    if (search && search.trim() !== '') {
      query += ` AND (
        d.numero_documento LIKE ? OR
        d.tipo_documento LIKE ? OR
        d.proveedor LIKE ? OR
        d.cif LIKE ? OR
        d.observaciones LIKE ? OR
        e.nombre_de_empresa LIKE ?
      )`;
      const searchTerm = `%${search.trim()}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    query += ` GROUP BY d.id_documento ORDER BY d.fecha_emision DESC`;

    const [documentos] = await db.query<RowDataPacket[]>(query, params);

    console.log('📊 [export-documents] Documentos encontrados:', documentos.length);

    if (documentos.length === 0) {
      return NextResponse.json(
        { error: 'No se encontraron documentos para exportar' },
        { status: 400 }
      );
    }

    // ✅ Obtener detalles de IVA para cada documento
    const documentoIds = documentos.map(d => d.id_documento);

    let ivaQuery = `
      SELECT 
        id_documento,
        tipo_impuesto,
        porcentaje,
        base_imponible,
        cuota
      FROM iva_details
      WHERE id_documento IN (?)
    `;

    const [ivaDetails] = await db.query<RowDataPacket[]>(ivaQuery, [documentoIds]);

    // Agrupar detalles de IVA por documento
    const ivaByDocument: { [key: number]: any[] } = {};
    ivaDetails.forEach((iva: any) => {
      if (!ivaByDocument[iva.id_documento]) {
        ivaByDocument[iva.id_documento] = [];
      }
      ivaByDocument[iva.id_documento].push(iva);
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

      // Extract entidades data
      const entidadesData = doc.entidades_data?.split(';').reduce((acc: any, e: string) => {
        const [rol, data] = e.split(':');
        if (data) {
          const [nombre, cif] = data.split('|');
          acc[rol] = { nombre, cif: cif || '' };
        }
        return acc;
      }, {}) || {};

      const tipo = doc.tipo_documento?.toLowerCase() || '';
      const isAbono = tipo.includes('abono') || tipo.includes('crédito') || tipo.includes('credito') || total < 0;

      // Logic identical to SQL:
      const emisor = entidadesData.emisor || entidadesData.proveedor;
      const emisorCif = emisor?.cif?.trim().toLowerCase();
      const empresaCif = doc.empresa_cif?.trim().toLowerCase();

      let isIssued = false;
      if (emisorCif && empresaCif && emisorCif === empresaCif) {
        isIssued = true;
      }

      totales.totalBaseImponible += base;
      totales.totalIva += iva;
      totales.totalImporte += total;

      // Clasificar ingresos vs gastos con abonos restando
      if (isIssued) {
        totales.totalIngresos += isAbono ? -Math.abs(total) : total;
      } else {
        totales.totalGastos += isAbono ? -Math.abs(total) : total;
      }

      // Contar incidencias
      if (doc.incidencia === 1) {
        totales.totalIncidencias++;
      }

      // Contar por tipo de documento
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
      documentoIds: documentoIds,
      filtrosAplicados: { empresaIds, año, trimestre, status, search }
    });

    if (!exportResult.success || !exportResult.exportId) {
      return NextResponse.json(
        { error: exportResult.error || 'Error al crear exportación' },
        { status: 500 }
      );
    }

    // ✅ Generar nombre descriptivo del archivo
    const empresaNombre = documentos[0]?.nombre_de_empresa || 'Documentos';
    const empresaNombreLimpio = empresaNombre
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 30);

    const fechaActual = new Date().toISOString().split('T')[0];
    const statusLabel = status === 'pending' ? 'Pendientes' :
      status === 'incidents' ? 'Incidencias' :
        status === 'confirmed' ? 'Confirmados' : 'Todos';

    let nombreArchivo = `Documentos_${statusLabel}_${empresaNombreLimpio}_${fechaActual}`;

    if (año && trimestre) {
      nombreArchivo = `Documentos_${statusLabel}_${año}_T${trimestre}_${empresaNombreLimpio}_${fechaActual}`;
    }

    nombreArchivo += '.pdf';

    console.log('📄 [export-documents] Nombre del archivo:', nombreArchivo);

    // ✅ Enviar a Microservice
    const microserviceWebhookUrl = 'https://agent.flux1a.com.ar/webhook/19aedb0e-661d-429a-b84b-1db75a18cfae';

    const webhookPayload = {
      exportId: exportResult.exportId,
      userId: user.id,
      userEmail: user.email,
      tipo: 'documentos',
      nombreArchivo,
      filtros: {
        empresaIds,
        año,
        trimestre,
        status,
        search
      },
      resumen: totales,
      documentos: documentos.map((d: any) => {
        const entidadesData = d.entidades_data?.split(';').reduce((acc: any, e: string) => {
          const [rol, data] = e.split(':');
          if (data) {
            const [nombre, cif] = data.split('|');
            acc[rol] = { nombre, cif };
          }
          return acc;
        }, {}) || {};

        return {
          id: d.id_documento,
          tipo: d.tipo_documento,
          numero: d.numero_documento,
          fecha_emision: d.fecha_emision,
          fecha_vencimiento: d.fecha_vencimiento,
          fecha_creacion: d.fecha_creacion,
          importe_total: d.importe_total,
          importe_sin_iva: d.importe_sin_impuestos,
          base_imponible: d.importe_sin_impuestos,
          moneda: d.moneda,
          proveedor: d.proveedor,
          cif: d.cif,
          concepto: d.observaciones,
          empresa: d.nombre_de_empresa,
          empresa_cif: d.empresa_cif,
          trimestre: d.num_trimestre,
          año: d.año_trimestre,
          trimestre_cerrado: d.trimestre_cerrado,
          incidencia: d.incidencia === 1,
          incidencia_razon: d.incidencia_razon,
          cliente: entidadesData.cliente?.nombre || entidadesData.receptor?.nombre || '',
          cliente_cif: entidadesData.cliente?.cif || entidadesData.receptor?.cif || '',
          emisor: entidadesData.emisor?.nombre || '',
          emisor_cif: entidadesData.emisor?.cif || '',
          iva_details: ivaByDocument[d.id_documento] || []
        };
      }),
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/export-callback`
    };

    console.log('🚀 [export-documents] Enviando a Microservice:', {
      documentos: documentos.length,
      totales
    });

    // Enviar a Microservice (fire and forget)
    fetch(microserviceWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload)
    }).catch(err => {
      console.error('❌ Error enviando a Microservice:', err);
    });

    console.log('✅ [export-documents] Exportación iniciada con ID:', exportResult.exportId);

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