import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/user-service';
import { revokeApiKey } from '@/services/api-key-service';

export const dynamic = 'force-dynamic';

// DELETE — Revocar una clave
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { id } = await params;
    const keyId = parseInt(id, 10);
    if (isNaN(keyId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const success = await revokeApiKey(keyId, user.id);

    if (!success) {
      return NextResponse.json(
        { error: 'Clave no encontrada o sin permisos para revocarla' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ [api/user/api-keys/[id] DELETE] Error:', error);
    return NextResponse.json({ error: 'Error al revocar la clave' }, { status: 500 });
  }
}
