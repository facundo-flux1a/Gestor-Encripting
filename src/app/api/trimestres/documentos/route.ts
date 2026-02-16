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
    const trimestreRaw = searchParams.get('trimestre');
    const empresaIdsParam = searchParams.getAll('empresa_id');

    if (!año) {
      return NextResponse.json(
        { error: 'año es requerido' },
        { status: 400 }
      );
    }

    // ✅ CORRECCIÓN: Asegurar que trimestre sea undefined si es null o string vacía
    const trimestre = trimestreRaw ? parseInt(trimestreRaw) : undefined;

    console.log('📥 [API-TRIMESTRES-DOCS] Parámetros recibidos:', {
      año,
      trimestreRaw,
      trimestreParsed: trimestre,
      empresaIds: empresaIdsParam
    });

    const empresaIds = empresaIdsParam.length > 0
      ? empresaIdsParam.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
      : [];

    console.log('🔍 [API-TRIMESTRES-DOCS] Llamando getDocumentosByTrimestre con:', {
      userId: session.userId,
      año: parseInt(año),
      trimestre: trimestre ?? 'TODOS (undefined)',
      empresaIds: empresaIds.length > 0 ? empresaIds : 'sin empresas (retornará [])'
    });

    const documentos = await getDocumentosByTrimestre(
      session.userId,
      parseInt(año),
      trimestre,
      empresaIds
    );

    console.log('✅ [API-TRIMESTRES-DOCS] Documentos encontrados:', documentos.length);

    return NextResponse.json(documentos);
  } catch (error) {
    console.error('❌ Error en GET /api/trimestres/documentos:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al obtener documentos' },
      { status: 500 }
    );
  }
}