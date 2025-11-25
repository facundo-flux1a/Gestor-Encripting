import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/services/auth-service';
import { getDocumentosByTrimestre } from '@/services/document-service';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    
    const año = searchParams.get('año');
    const trimestre = searchParams.get('trimestre');
    const empresaIdsParam = searchParams.getAll('empresa_id');

    if (!año || !trimestre) {
      return NextResponse.json(
        { error: 'año y trimestre son requeridos' },
        { status: 400 }
      );
    }

    // Convertir a números o null
    const empresaIds = empresaIdsParam.length > 0 
      ? empresaIdsParam.map(id => parseInt(id))
      : null;

    const documentos = await getDocumentosByTrimestre(
      session.userId,
      parseInt(año),
      parseInt(trimestre),
      empresaIds
    );

    return NextResponse.json(documentos);
  } catch (error) {
    console.error('❌ Error en GET /api/trimestres/documentos:', error);
    return NextResponse.json(
      { error: 'Error al obtener documentos' },
      { status: 500 }
    );
  }
}