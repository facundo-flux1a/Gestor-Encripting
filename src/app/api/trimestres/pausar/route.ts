import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { pausarTrimestre } from '@/services/document-service';
import { PausarTrimestrePayloadSchema } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    const validation = PausarTrimestrePayloadSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      );
    }

    const result = await pausarTrimestre(session.userId, validation.data);

    const estadoMsg = result.estado === 1
      ? `Trimestre T${validation.data.trimestre} ${validation.data.año} cerrado`
      : result.estado === 2
        ? `Ingesta pausada para T${validation.data.trimestre} ${validation.data.año}`
        : `Trimestre T${validation.data.trimestre} ${validation.data.año} activo`;

    return NextResponse.json({
      success: true,
      pausado: result.pausado,
      estado: result.estado,
      message: estadoMsg,
    });
  } catch (error) {
    console.error('Error en POST /api/trimestres/pausar:', error);
    return NextResponse.json(
      { error: 'Error al cambiar estado de pausa del trimestre' },
      { status: 500 }
    );
  }
}
