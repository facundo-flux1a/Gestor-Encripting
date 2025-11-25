import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { cerrarTrimestre } from '@/services/document-service';
import { CerrarTrimestrePayloadSchema } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const body = await req.json();
    
    // Validar payload
    const validation = CerrarTrimestrePayloadSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validation.error.errors },
        { status: 400 }
      );
    }

    const result = await cerrarTrimestre(session.userId, validation.data);

    if (result.affected === 0) {
      return NextResponse.json(
        { error: 'No se encontraron documentos para cerrar o ya están cerrados' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      affected: result.affected,
      message: `Se cerraron ${result.affected} documento(s)`,
    });
  } catch (error) {
    console.error('Error en POST /api/trimestres/cerrar:', error);
    return NextResponse.json(
      { error: 'Error al cerrar trimestre' },
      { status: 500 }
    );
  }
}