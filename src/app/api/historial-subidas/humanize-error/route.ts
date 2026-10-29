import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { humanizeIngestionError } from '@/services/ingestion/error-humanizer';

export const dynamic = 'force-dynamic';

/**
 * POST /api/historial-subidas/humanize-error
 * Recibe un error_detalle crudo y devuelve un mensaje humanizado usando IA.
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { errorDetalle } = await req.json();
    if (!errorDetalle || typeof errorDetalle !== 'string') {
      return NextResponse.json({ error: 'errorDetalle requerido' }, { status: 400 });
    }

    const humanized = await humanizeIngestionError(errorDetalle, {
      workerTag: 'HistorialSubidas',
    });

    return NextResponse.json({
      mensaje: humanized.mensaje,
      sugerencia: humanized.sugerencia,
    });
  } catch (error: any) {
    console.error('❌ [humanize-error] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
