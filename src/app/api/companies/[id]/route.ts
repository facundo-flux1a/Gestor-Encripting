import { NextRequest, NextResponse } from 'next/server';
import { deleteCompany } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

// DELETE - Eliminar empresa y todos sus documentos
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    console.log('🗑️ [API-DELETE-COMPANY] Iniciando eliminación...');
    
    const user = await getCurrentUser();
    
    if (!user) {
      console.warn('⚠️ [API-DELETE-COMPANY] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    // ⭐ IMPORTANTE: Await params en Next.js 15+
    const params = await context.params;
    const companyId = parseInt(params.id);
    
    if (isNaN(companyId)) {
      return NextResponse.json({ error: 'ID de empresa inválido' }, { status: 400 });
    }

    console.log('👤 [API-DELETE-COMPANY] Usuario:', user.id, 'Empresa:', companyId);

    const result = await deleteCompany(companyId, user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    console.log('✅ [API-DELETE-COMPANY] Empresa eliminada exitosamente');

    return NextResponse.json({ 
      success: true,
      message: result.documentsDeleted 
        ? `Empresa eliminada junto con ${result.documentsDeleted} documento(s)` 
        : 'Empresa eliminada correctamente',
      documentsDeleted: result.documentsDeleted
    });

  } catch (error) {
    console.error('❌ [API-DELETE-COMPANY] Error:', error);
    return NextResponse.json(
      { error: 'Error al eliminar la empresa' },
      { status: 500 }
    );
  }
}