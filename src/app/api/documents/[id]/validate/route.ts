import { NextRequest, NextResponse } from 'next/server';
import { validateDocumentIncidents } from '@/services/document-service';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  const params = await props.params;
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const documentId = parseInt(params.id, 10);
    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const result = await validateDocumentIncidents(documentId);

    if (!result.success) {
      return NextResponse.json({ error: 'Error al validar' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Error validando incidencias:', error);
    return NextResponse.json({
      error: 'Error al validar incidencias'
    }, { status: 500 });
  }
}