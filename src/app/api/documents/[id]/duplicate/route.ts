import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/services/user-service';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const params = await props.params;
    const documentId = parseInt(params.id, 10);

    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'ID de documento inválido' }, { status: 400 });
    }

    // Insertar incidencia en la base de datos
    await prisma.incidencias_documento.create({
      data: {
        documento_id: BigInt(documentId),
        incidencia: true,
        descripcion: `Marcado como duplicado por el usuario ${user.email}`,
        validado: false
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('❌ Error marcando como duplicado:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
