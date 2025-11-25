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
    const { empresaIds, año, trimestre } = body;

    console.log('📤 [export-dashboard] Iniciando exportación:', { empresaIds, año, trimestre });

    // ✅ Obtener documentos directamente con toda su info (SOLO FACTURAS)
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
        d.año_trimestre,
        d.num_trimestre,
        e.nombre_de_empresa,
        e.cif as empresa_cif
      FROM documentos d
      LEFT JOIN empresas e ON d.id_de_empresa = e.id
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

    // ✅ Crear registro en BD
    const exportResult = await createExport({
      userId: user.id,
      tipoExport: 'dashboard',
      añoFiltro: año || null,
      trimestreFiltro: trimestre || null,
      empresasIds: empresaIds || [],
      documentoIds: documentos.map(d => d.id),
      filtrosAplicados: { empresaIds, año, trimestre }
    });

    if (!exportResult.success || !exportResult.exportId) {
      return NextResponse.json(
        { error: exportResult.error || 'Error al crear exportación' },
        { status: 500 }
      );
    }

    // ✅ Calcular totales simples
    let totalIngresos = 0;
    let totalGastos = 0;
    let totalIva = 0;

    documentos.forEach(doc => {
      const importe = Number(doc.importe_sin_impuestos || 0);
      const emisorCif = doc.datos_extra?.EMPRESA_EMISORA?.CIF;
      
      // Si el emisor es la empresa, es ingreso, sino es gasto
      if (emisorCif === doc.empresa_cif) {
        totalIngresos += importe;
      } else {
        totalGastos += importe;
      }
      
      totalIva += Number(doc.importe_total || 0) - Number(doc.importe_sin_impuestos || 0);
    });

    // ✅ Generar nombre descriptivo del archivo
    const empresaNombre = documentos.length > 0 ? documentos[0].nombre_de_empresa : 'Sin_Empresa';
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

    // ✅ Enviar a n8n
    const n8nWebhookUrl = 'https://agent.flux1a.com.ar/webhook/19aedb0e-661d-429a-b84b-1db75a18cfae';
    
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
      // ✅ Datos calculados simples
      resumen: {
        totalDocumentos: documentos.length,
        totalIngresos,
        totalGastos,
        totalIva,
        beneficio: totalIngresos - totalGastos
      },
      // ✅ Lista completa de documentos
      documentos: documentos.map(d => ({
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

    console.log('🚀 [export-dashboard] Enviando a n8n:', {
      documentos: documentos.length,
      totalGastos,
      totalIngresos
    });

    // Enviar a n8n
    fetch(n8nWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload)
    }).catch(err => {
      console.error('❌ Error enviando a n8n:', err);
    });

    console.log('✅ [export-dashboard] Exportación iniciada con ID:', exportResult.exportId);

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