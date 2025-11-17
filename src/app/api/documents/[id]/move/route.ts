import { NextRequest, NextResponse } from 'next/server';
import { moveDocument } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

// PATCH - Mover documento a otra empresa
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('🔄 [API-MOVE-DOCUMENT] Iniciando PATCH...');
    
    // Verificar usuario
    const user = await getCurrentUser();
    console.log('👤 [API-MOVE-DOCUMENT] Usuario actual:', user?.id, user?.email);
    
    if (!user) {
      console.warn('⚠️ [API-MOVE-DOCUMENT] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }
    
    const documentId = parseInt(params.id, 10);
    
    if (isNaN(documentId)) {
      return NextResponse.json(
        { error: 'ID de documento inválido' },
        { status: 400 }
      );
    }
    
    // Obtener datos del body
    const body = await request.json();
    const { newEmpresaId } = body;
    
    console.log('📝 [API-MOVE-DOCUMENT] Datos recibidos:', { documentId, newEmpresaId });
    
    // Validaciones
    if (!newEmpresaId || isNaN(parseInt(newEmpresaId, 10))) {
      console.warn('⚠️ [API-MOVE-DOCUMENT] ID de empresa inválido');
      return NextResponse.json(
        { error: 'ID de empresa inválido' },
        { status: 400 }
      );
    }
    
    // Mover el documento
    const result = await moveDocument(documentId, parseInt(newEmpresaId, 10), user.id);
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Error al mover el documento' },
        { status: 400 }
      );
    }
    
    console.log('✅ [API-MOVE-DOCUMENT] Documento movido exitosamente');
    
    return NextResponse.json({
      success: true,
      message: 'Documento movido exitosamente'
    }, { status: 200 });
    
  } catch (error) {
    console.error('❌ [API-MOVE-DOCUMENT] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Error al mover el documento';
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}