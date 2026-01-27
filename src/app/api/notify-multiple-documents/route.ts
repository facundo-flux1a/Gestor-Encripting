import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * 🆕 ENDPOINT: Recibe notificación de Microservice cuando se detectan múltiples documentos en un PDF
 * Solo emite un evento para que el frontend cree los modales
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      parentUploadId,
      totalDocumentos,
      documentos // Array de { individualUploadId, numeroDocumento, tipoDocumento, index }
    } = body;

    console.log('📄 [notify-multiple-documents] PDF múltiple detectado:', {
      parentUploadId,
      totalDocumentos,
      documentos: documentos?.length
    });

    if (!parentUploadId || !documentos || documentos.length === 0) {
      return NextResponse.json({
        error: 'Faltan datos requeridos'
      }, { status: 400 });
    }

    console.log(`✅ [notify-multiple-documents] Notificación registrada para ${documentos.length} documentos`);

    return NextResponse.json({
      success: true,
      parentUploadId,
      totalDocumentos,
      documentos
    });

  } catch (error) {
    console.error('❌ [notify-multiple-documents] Error:', error);
    return NextResponse.json(
      { error: 'Error al procesar notificación' },
      { status: 500 }
    );
  }
}