// src/app/api/documents/[id]/delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { deleteDocument } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

// DELETE - Eliminar documento individual
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    console.log('🗑️ [API-DELETE-DOCUMENT] Iniciando eliminación...');
    
    const user = await getCurrentUser();
    
    if (!user) {
      console.warn('⚠️ [API-DELETE-DOCUMENT] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id);
    
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID de documento inválido' }, { status: 400 });
    }

    console.log('👤 [API-DELETE-DOCUMENT] Usuario:', user.id, 'Documento:', documentId);

    // ✅ Llamar al servicio de eliminación
    const result = await deleteDocument(documentId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    console.log('✅ [API-DELETE-DOCUMENT] Documento eliminado exitosamente');

    // ✅ CRÍTICO: Revalidar las rutas para forzar el refetch
    revalidatePath('/documents');
    revalidatePath('/dashboard');

    return NextResponse.json({ 
      success: true,
      message: 'Documento eliminado correctamente'
    });

  } catch (error) {
    console.error('❌ [API-DELETE-DOCUMENT] Error:', error);
    return NextResponse.json(
      { error: 'Error al eliminar el documento' },
      { status: 500 }
    );
  }
}