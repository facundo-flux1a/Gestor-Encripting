import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/services/auth-service';

export const dynamic = 'force-dynamic';

export async function PATCH(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || !session.userId) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const empresaId = searchParams.get('empresaId');

    if (!empresaId) {
      return NextResponse.json({ error: 'Falta empresaId' }, { status: 400 });
    }

    // Marcar como leídas todas las actividades nuevas de esa empresa para este usuario usando Prisma
    const result = await prisma.actividad.updateMany({
      where: {
        id_de_empresa: BigInt(empresaId),
        is_new: true,
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
      updated: result.count,
    });

  } catch (error) {
    console.error('❌ [API-ACTIVITY-DISMISS-ALL] Error:', error);
    return NextResponse.json(
      { error: 'Error al descartar actividades' },
      { status: 500 }
    );
  }
}
