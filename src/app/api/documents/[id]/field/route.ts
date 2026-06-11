import { NextRequest, NextResponse } from 'next/server';
import { updateDocumentField } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

// PATCH - Actualizar campo individual de documento
export async function PATCH(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    console.log('📝 [API-UPDATE-FIELD] Iniciando...');

    const user = await getCurrentUser();

    if (!user) {
      console.warn('⚠️ [API-UPDATE-FIELD] No hay usuario autenticado');
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);

    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID de documento inválido' }, { status: 400 });
    }

    const body = await request.json();
    const { fieldName, value } = body;

    if (!fieldName) {
      return NextResponse.json({ error: 'Falta el nombre del campo' }, { status: 400 });
    }

    console.log('📝 [API-UPDATE-FIELD] Actualizando:', { documentId, fieldName, value });

    const result = await updateDocumentField(documentId, fieldName, value, user.email);

    if (!result.success) {
      return NextResponse.json({ error: 'Error al actualizar campo' }, { status: 400 });
    }

    console.log('✅ [API-UPDATE-FIELD] Campo actualizado');

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('❌ [API-UPDATE-FIELD] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al actualizar campo' },
      { status: 500 }
    );
  }
}