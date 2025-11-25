import { NextRequest, NextResponse } from 'next/server';
import { updateExportStatus } from '@/services/document-service';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { exportId, status, urlArchivo, nombreArchivo, errorMensaje } = body;

    console.log('📥 [export-callback] Recibido:', { exportId, status, urlArchivo });

    if (!exportId) {
      return NextResponse.json(
        { error: 'exportId es requerido' },
        { status: 400 }
      );
    }

    // Validar status
    const validStatuses = ['processing', 'completed', 'failed'];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Status inválido' },
        { status: 400 }
      );
    }

    // ✅ Actualizar estado en la BD
    const result = await updateExportStatus(
      exportId,
      status,
      urlArchivo,
      nombreArchivo,
      errorMensaje
    );

    if (!result.success) {
      console.error('❌ [export-callback] Error actualizando:', result.error);
      return NextResponse.json(
        { error: result.error || 'Error al actualizar estado' },
        { status: 500 }
      );
    }

    console.log('✅ [export-callback] Export actualizado:', exportId);

    // TODO: Aquí podrías enviar una notificación al usuario vía websocket o similar
    // Por ejemplo, usando Pusher, Socket.io, o polling desde el frontend

    return NextResponse.json({
      success: true,
      message: 'Estado actualizado correctamente'
    });

  } catch (error) {
    console.error('❌ [export-callback] Error:', error);
    return NextResponse.json(
      { error: 'Error procesando callback' },
      { status: 500 }
    );
  }
}