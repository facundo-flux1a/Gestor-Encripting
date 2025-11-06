import { NextRequest, NextResponse } from 'next/server';
import { markDocumentAsRead } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

// PATCH - Marcar documento como leído
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('👁️ [API-MARK-READ] Iniciando...');
    
    const user = await getCurrentUser();
    
    if (!user) {
      console.warn('⚠️ [API-MARK-READ] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);
    
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID de documento inválido' }, { status: 400 });
    }

    console.log('📝 [API-MARK-READ] Marcando documento como leído:', documentId);

    const result = await markDocumentAsRead(documentId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    console.log('✅ [API-MARK-READ] Documento marcado como leído');

    return NextResponse.json({ 
      success: true,
      updated: result.updated
    });

  } catch (error) {
    console.error('❌ [API-MARK-READ] Error:', error);
    return NextResponse.json(
      { error: 'Error al marcar documento como leído' },
      { status: 500 }
    );
  }
}
        