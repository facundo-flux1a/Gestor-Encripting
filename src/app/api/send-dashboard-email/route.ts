import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { createExport } from '@/services/document-service';
import db from '@/lib/db';
import type { RowDataPacket } from 'mysql2';

const N8N_WEBHOOK_URL = 'https://agent.flux1a.com.ar/webhook/6d62acdb-a2d3-4e2d-a4f7-41a49be815d4';

export async function POST(request: NextRequest) {
  try {
    // Verificar autenticación
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { empresaId, empresaNombre, stats, emailTo } = body;

    // Validaciones
    if (!empresaId || !emailTo) {
      return NextResponse.json(
        { error: 'Datos incompletos: empresaId y emailTo son requeridos' },
        { status: 400 }
      );
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(emailTo)) {
      return NextResponse.json(
        { error: 'Formato de email inválido' },
        { status: 400 }
      );
    }

    // Obtener datos completos de la empresa
    const [empresaRows] = await db.query<RowDataPacket[]>(
      'SELECT * FROM empresas WHERE id = ?',
      [empresaId]
    );

    if (empresaRows.length === 0) {
      return NextResponse.json(
        { error: 'Empresa no encontrada' },
        { status: 404 }
      );
    }

    const empresa = empresaRows[0];

    // 1. Generar el PDF primero (usando la misma lógica que export-dashboard)
    const exportResult = await createExport({
      userId: user.id,
      empresaId,
      tipo: 'dashboard',
      formato: 'pdf',
      nombre: `Dashboard ${empresa.nombre} - ${new Date().toISOString().split('T')[0]}`
    });

    if (!exportResult.success || !exportResult.exportId) {
      throw new Error('Error al generar el PDF del dashboard');
    }

    // 2. Obtener la URL del PDF generado
    const [exportRows] = await db.query<RowDataPacket[]>(
      'SELECT url FROM exportes WHERE id = ?',
      [exportResult.exportId]
    );

    const pdfUrl = exportRows[0]?.url || '';

    // 3. Preparar datos para el webhook de n8n
    const webhookPayload = {
      // Información del destinatario
      emailTo,
      
      // Información de la empresa
      empresaId: empresa.id,
      empresaNombre: empresa.nombre,
      empresaCuit: empresa.cuit || '',
      
      // URL del PDF generado
      pdfUrl,
      exportId: exportResult.exportId,
      
      // Estadísticas del dashboard
      stats: {
        totalCuentas: stats?.totalCuentas || 0,
        totalDocumentos: stats?.totalDocumentos || 0,
        documentosPendientes: stats?.documentosPendientes || 0,
        proximosVencimientos: stats?.proximosVencimientos || 0,
      },
      
      // Metadata
      fechaGeneracion: new Date().toISOString(),
      generadoPor: user.email || user.nombre,
      
      // Información adicional para personalizar el email
      asunto: `Dashboard de ${empresa.nombre} - ${new Date().toLocaleDateString('es-AR')}`,
      nombreArchivo: `dashboard-${empresa.nombre.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`,
    };

    // 4. Enviar al webhook de n8n
    const n8nResponse = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text();
      console.error('Error en n8n webhook:', errorText);
      throw new Error(`Error al enviar email: ${n8nResponse.status}`);
    }

    const n8nResult = await n8nResponse.json();

    // 5. Actualizar el registro de exportación con info del email
    await db.query(
      `UPDATE exportes 
       SET metadata = JSON_SET(
         COALESCE(metadata, '{}'),
         '$.emailEnviado', true,
         '$.emailDestinatario', ?,
         '$.emailFechaEnvio', ?
       )
       WHERE id = ?`,
      [emailTo, new Date().toISOString(), exportResult.exportId]
    );

    return NextResponse.json({
      success: true,
      message: 'Dashboard enviado por email correctamente',
      exportId: exportResult.exportId,
      pdfUrl,
      emailTo,
      n8nResponse: n8nResult,
    });

  } catch (error) {
    console.error('Error en send-dashboard-email:', error);
    return NextResponse.json(
      {
        error: 'Error al enviar el dashboard por email',
        details: error instanceof Error ? error.message : 'Error desconocido',
      },
      { status: 500 }
    );
  }
}