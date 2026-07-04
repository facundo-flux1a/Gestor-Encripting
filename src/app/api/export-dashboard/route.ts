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
    const { empresaIds, año, trimestre, analytics } = body;

    console.log('📤 [export-dashboard] Iniciando exportación:', { empresaIds, año, trimestre });
    console.log('📊 [export-dashboard] Analytics recibidas:', analytics?.kpis);

    // ✅ Obtener documentos para el detalle
    let query = `
      SELECT 
        d.id,
        d.id_de_empresa,
        d.tipo_documento,
        d.numero_documento,
        d.fecha_emision,
        d.fecha_vencimiento,
        d.importe_total,
        d.importe_sin_impuestos,
        d.moneda,
        d.observaciones,
        d.datos_extra,
        d.año_trimestre,
        d.num_trimestre
      FROM documentos d
      WHERE LOWER(d.tipo_documento) LIKE '%factura%'
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

    query += ` ORDER BY d.fecha_emision DESC`;

    const [documentos] = await db.query<RowDataPacket[]>(query, params);

    console.log('📊 [export-dashboard] Documentos encontrados:', documentos.length);

    // ✅ Hidratar nombres de empresa con Prisma (desencripta automáticamente)
    const uniqueEmpresaIds = [...new Set(documentos.map((d: any) => BigInt(d.id_de_empresa)).filter(Boolean))];
    const empresasData = uniqueEmpresaIds.length > 0
      ? await prisma.empresas.findMany({
          where: { id: { in: uniqueEmpresaIds } },
          select: { id: true, nombre_de_empresa: true, CIF: true }
        })
      : [];
    const empresaMap = new Map(empresasData.map(e => [Number(e.id), { nombre: e.nombre_de_empresa || '', cif: e.CIF || '' }]));

    // Enriquecer cada documento con los datos de empresa desencriptados
    const documentosEnriquecidos = documentos.map((d: any) => ({
      ...d,
      nombre_de_empresa: empresaMap.get(d.id_de_empresa)?.nombre || '',
      empresa_cif: empresaMap.get(d.id_de_empresa)?.cif || ''
    }));
    // ✅ Crear registro en BD
    const exportResult = await createExport({
      userId: user.id,
      tipoExport: 'dashboard',
      añoFiltro: año || null,
      trimestreFiltro: trimestre || null,
      empresasIds: empresaIds || [],
      documentoIds: documentosEnriquecidos.map((d: any) => d.id),
      filtrosAplicados: { empresaIds, año, trimestre }
    });

    if (!exportResult.success || !exportResult.exportId) {
      return NextResponse.json(
        { error: exportResult.error || 'Error al crear exportación' },
        { status: 500 }
      );
    }

    // ✅ USAR LOS TOTALES QUE VIENEN DEL FRONTEND
    const totalIngresos = analytics?.kpis?.totalIngresos || 0;
    const totalGastos = analytics?.kpis?.totalGastos || 0;
    const totalIva = analytics?.kpis?.resultadoIva || 0;
    const beneficio = analytics?.kpis?.beneficio || 0;
    const totalDocs = analytics?.kpis?.totalDocs || documentosEnriquecidos.length;

    console.log('💰 [export-dashboard] Totales a enviar:', {
      totalIngresos,
      totalGastos,
      totalIva,
      beneficio,
      totalDocs
    });

    // ✅ Generar nombre descriptivo del archivo
    const empresaNombre = documentosEnriquecidos.length > 0 ? documentosEnriquecidos[0].nombre_de_empresa : 'Sin_Empresa';
    const empresaNombreLimpio = empresaNombre
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 30);

    const fechaActual = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    let nombreArchivo = `Reporte_Dashboard_${empresaNombreLimpio}_${fechaActual}`;

    if (año && trimestre) {
      nombreArchivo = `Reporte_${año}_T${trimestre}_${empresaNombreLimpio}_${fechaActual}`;
    } else if (año) {
      nombreArchivo = `Reporte_${año}_${empresaNombreLimpio}_${fechaActual}`;
    }

    nombreArchivo += '.pdf';

    console.log('📄 [export-dashboard] Nombre del archivo:', nombreArchivo);

    // ✅ Enviar a Microservice
    const microserviceWebhookUrl = 'https://agent.flux1a.com.ar/webhook/19aedb0e-661d-429a-b84b-1db75a18cfae';

    const webhookPayload = {
      exportId: exportResult.exportId,
      userId: user.id,
      userEmail: user.email,
      tipo: 'dashboard',
      nombreArchivo,
      filtros: {
        empresaIds,
        año,
        trimestre
      },
      // ✅ USAR LAS MÉTRICAS QUE VIENEN DEL FRONTEND
      resumen: {
        totalDocumentos: totalDocs,
        totalIngresos,
        totalGastos,
        totalIva,
        beneficio
      },
      // ✅ Lista completa de documentos
      documentos: documentosEnriquecidos.map((d: any) => ({
        id: d.id,
        tipo: d.tipo_documento,
        numero: d.numero_documento,
        fecha: d.fecha_emision,
        importe_total: d.importe_total,
        importe_sin_iva: d.importe_sin_impuestos,
        moneda: d.moneda,
        empresa: d.nombre_de_empresa,
        emisor: d.datos_extra?.EMPRESA_EMISORA?.NOMBRE || '',
        emisor_cif: d.datos_extra?.EMPRESA_EMISORA?.CIF || '',
        cliente: d.datos_extra?.CLIENTE?.NOMBRE || '',
        cliente_cif: d.datos_extra?.CLIENTE?.CIF || ''
      })),
      callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/export-callback`
    };

    console.log('🚀 [export-dashboard] Enviando a Microservice:', {
      documentos: documentosEnriquecidos.length,
      totalIngresos,
      totalGastos,
      totalIva,
      beneficio: totalIngresos - totalGastos
    });

    // Enviar a Microservice
    fetch(microserviceWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload)
    }).catch(err => {
      console.error('❌ Error enviando a Microservice:', err);
    });

    console.log('✅ [export-dashboard] Exportación iniciada con ID:', exportResult.exportId);

    try {
      const { logAuditAction } = await import('@/services/audit-service');
      await logAuditAction({
        empresaId: empresaIds && empresaIds.length > 0 ? Number(empresaIds[0]) : undefined,
        accion: 'EXPORTACION_DATOS',
        usuarioEmail: user.email,
        userId: user.id,
        detalle: { 
          tipo: 'dashboard', 
          año, 
          trimestre, 
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
    console.error('❌ [export-dashboard] Error:', error);
    return NextResponse.json(
      { error: 'Error al iniciar exportación' },
      { status: 500 }
    );
  }
}