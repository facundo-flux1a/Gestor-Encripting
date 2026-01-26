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

// DELETE - Eliminar múltiples documentos (Bulk)
export async function DELETE(req: NextRequest) {
  try {
    console.log('🗑️ [API-DOCUMENTS-DELETE] Iniciando...');

    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const body = await req.json();
    const { ids } = body;

    // Validación básica: soporta array de IDs (bulk)
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Se requiere un array de IDs válido' }, { status: 400 });
    }

    console.log('🔢 [API-DOCUMENTS-DELETE] IDs a eliminar:', ids.length);

    // Importar el servicio (ahora que ya existe la función)
    const { deleteDocuments } = await import('@/services/document-service');

    const result = await deleteDocuments(ids, user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    console.log('✅ [API-DOCUMENTS-DELETE] Eliminación exitosa');

    // Revalidar caché
    revalidatePath('/documents');
    revalidatePath('/dashboard');

    return NextResponse.json({ success: true, count: ids.length });

  } catch (error) {
    console.error('❌ [API-DOCUMENTS-DELETE] Error:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}