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

    console.log('📥 [API-TRIMESTRES-DOCS] Parámetros recibidos:', {
      año,
      trimestre,
      empresaIds: empresaIdsParam
    });

    // ✅ CAMBIO: Convertir a array de números (o undefined si está vacío)
    const empresaIds = empresaIdsParam.length > 0 
      ? empresaIdsParam.map(id => parseInt(id, 10)).filter(id => !isNaN(id))
      : undefined;

    console.log('🔍 [API-TRIMESTRES-DOCS] Llamando getDocumentosByTrimestre con:', {
      userId: session.userId,
      año: parseInt(año),
      trimestre: parseInt(trimestre),
      empresaIds
    });

    const documentos = await getDocumentosByTrimestre(
      session.userId,
      parseInt(año),
      parseInt(trimestre),
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