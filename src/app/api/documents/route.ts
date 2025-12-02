import { NextRequest, NextResponse } from 'next/server';
import { getDocuments, deleteDocument } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';
import { revalidatePath } from 'next/cache'; // ⬅️ IMPORTAR ESTO

export const dynamic = 'force-dynamic';

// GET - Obtener documentos
export async function GET(req: NextRequest) {
  try {
    console.log('🚀 [API-DOCUMENTS] Iniciando...');
    
    const { searchParams } = new URL(req.url);
    const companyIdParams = searchParams.getAll('companyId');

    console.log('📥 [API-DOCUMENTS] companyIdParams recibidos:', companyIdParams);

    if (!companyIdParams || companyIdParams.length === 0) {
      console.warn('⚠️ [API-DOCUMENTS] No se proporcionaron IDs');
      return NextResponse.json([]);
    }

    const empresaIds = companyIdParams
      .map(id => parseInt(id, 10))
      .filter(id => !isNaN(id));
    
    console.log('🔢 [API-DOCUMENTS] IDs parseados:', empresaIds);

    if (empresaIds.length === 0) {
      console.warn('⚠️ [API-DOCUMENTS] IDs inválidos');
      return NextResponse.json([]);
    }

    console.log('🔍 [API-DOCUMENTS] Llamando getDocuments...');
    
    const documents = await getDocuments(empresaIds);
    
    console.log('✅ [API-DOCUMENTS] Documentos obtenidos:', documents.length);
    
    return NextResponse.json(documents);
    
  } catch (error) {
    console.error('❌ [API-DOCUMENTS] Error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Error desconocido' 
    }, { status: 500 });
  }
}

// DELETE - Eliminar documento
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

    const result = await deleteDocument(documentId, user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    console.log('✅ [API-DELETE-DOCUMENT] Documento eliminado exitosamente');

    // 🔥 REVALIDAR TODAS LAS RUTAS QUE MUESTRAN DOCUMENTOS
    revalidatePath('/documentos', 'page');           // Página principal de documentos
    revalidatePath('/incidencias', 'page');          // Si tienes página de incidencias
    revalidatePath('/documento/[id]', 'page');       // Página de detalle de documento
    revalidatePath('/api/documents', 'layout');      // Revalidar el API route también
    
    console.log('🔄 [API-DELETE-DOCUMENT] Cache revalidado');

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