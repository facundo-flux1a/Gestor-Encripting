import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ uploadId: string }> }
) {
  try {
    const session = await getSession();

    if (!session || !session.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const resolvedParams = await params;
    const { uploadId } = resolvedParams;

    if (!uploadId) {
      return NextResponse.json({ error: 'ID de subida inválido' }, { status: 400 });
    }

    // Marcar como leída la actividad principal y todas sus hijas usando Prisma
    const result = await prisma.actividad.updateMany({
      where: {
        OR: [
          { upload_id: uploadId },
          { parent_upload_id: uploadId }
        ],
        empresas: {
          id_de_usuario: {
            array_contains: session.userId
          }
        }
      },
      data: {
        is_new: false
      }
    });

    return NextResponse.json({
      success: true,
      updated: result.count > 0,
    });

  } catch (error) {
    console.error('❌ [API-ACTIVITY-DISMISS] Error:', error);
    return NextResponse.json(
      { error: 'Error al descartar actividad' },
      { status: 500 }
    );
  }
}
